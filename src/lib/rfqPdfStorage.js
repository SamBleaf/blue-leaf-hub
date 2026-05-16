/**
 * rfqPdfStorage.js
 * Persists RFQ PDF files in IndexedDB as ArrayBuffers.
 * File objects are NOT serialisable — always convert before storing.
 */

const DB_NAME = 'BlueLeafRFQ';
const DB_VERSION = 2;
const STORE_NAME = 'rfqPdfs';

/** Single in-browser draft scope used by `RfqEngine` (must match `RfqEngine` import). */
export const RFQ_ENGINE_PDF_SCOPE = 'draft';

// ─── DB init ────────────────────────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // keyPath: rfqId  →  each RFQ gets one record containing all its PDFs
        db.createObjectStore(STORE_NAME, { keyPath: 'rfqId' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert File, Blob, or ArrayBuffer → ArrayBuffer.
 * Returns null for null/empty/unconvertible input (never throws).
 */
async function toArrayBuffer(source) {
  if (source == null) {
    console.warn('[rfqPdfStorage] toArrayBuffer: source is null or undefined');
    return null;
  }
  if (source instanceof ArrayBuffer) {
    if (source.byteLength === 0) {
      console.warn('[rfqPdfStorage] toArrayBuffer: empty ArrayBuffer');
      return null;
    }
    return source;
  }
  if (source instanceof File || source instanceof Blob) {
    if (typeof source.size === 'number' && source.size === 0) {
      console.warn('[rfqPdfStorage] toArrayBuffer: empty File/Blob');
      return null;
    }
    try {
      const buf = await source.arrayBuffer();
      if (!(buf instanceof ArrayBuffer) || buf.byteLength === 0) {
        console.warn('[rfqPdfStorage] toArrayBuffer: read produced empty buffer');
        return null;
      }
      return buf;
    } catch (err) {
      console.warn('[rfqPdfStorage] toArrayBuffer: arrayBuffer() failed', err);
      return null;
    }
  }
  console.warn(
    `[rfqPdfStorage] toArrayBuffer: unconvertible input (${typeof source}, ${Object.prototype.toString.call(source)})`
  );
  return null;
}

/**
 * Reconstruct a File-like object from a stored PDF entry.
 * Returns a real File so downstream code (pdf.js, docxtemplater, etc.) works unchanged.
 */
function toFile({ buffer, name, type }) {
  return new File([buffer], name, { type: type || 'application/pdf' });
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Store all PDFs for an RFQ.
 * @param {string} rfqId
 * @param {Array<File|Blob|ArrayBuffer|{file: File, name: string}|{buffer: ArrayBuffer, name: string, type?: string, id?: string}>} pdfItems
 *   Accepts raw File objects, or the {file, name} shape used by RfqEngine.
 */
export async function storePdfs(rfqId, pdfItems) {
  if (!rfqId) throw new Error('rfqPdfStorage.storePdfs: rfqId is required');
  if (!Array.isArray(pdfItems) || pdfItems.length === 0) {
    return 0;
  }

  // Normalise every item to { buffer, name, type, clientId? }; skip invalid entries
  const mapped = await Promise.all(
    pdfItems.map(async (item) => {
      if (item == null) {
        console.warn('[rfqPdfStorage] storePdfs: skipping null/undefined item');
        return null;
      }

      // RfqEngine buffer-first shape (bytes already materialised — no stale File reads)
      if (item.buffer instanceof ArrayBuffer) {
        if (item.buffer.byteLength === 0) {
          console.warn('[rfqPdfStorage] storePdfs: skipping empty buffer', item?.name);
          return null;
        }
        const name = item?.name ?? 'document.pdf';
        const type = item?.type || 'application/pdf';
        const clientId = typeof item?.id === 'string' ? item.id : null;
        return { buffer: item.buffer, name, type, clientId };
      }

      // Legacy / raw: { file }, or a File/Blob/ArrayBuffer entry — never treat a plain object as a Blob
      const raw = item.file;
      let name = item?.name ?? 'document.pdf';
      let type = 'application/pdf';
      let buffer = null;

      if (raw instanceof ArrayBuffer) {
        buffer = await toArrayBuffer(raw);
      } else if (raw instanceof File || raw instanceof Blob) {
        name = item?.name ?? raw.name ?? name;
        type = raw.type || type;
        buffer = await toArrayBuffer(raw);
      } else if (item instanceof File || item instanceof Blob) {
        name = item.name ?? name;
        type = item.type || type;
        buffer = await toArrayBuffer(item);
      } else if (item instanceof ArrayBuffer) {
        buffer = await toArrayBuffer(item);
      } else {
        console.warn('[rfqPdfStorage] storePdfs: skipping item with no usable buffer/file', item?.name ?? item?.id);
        return null;
      }

      if (!buffer) return null;
      const clientId = typeof item?.id === 'string' ? item.id : null;
      return { buffer, name, type, clientId };
    })
  );

  const serialised = mapped.filter(
    (entry) => entry && entry.buffer instanceof ArrayBuffer && entry.buffer.byteLength > 0
  );

  if (!serialised.length) {
    return 0;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ rfqId, pdfs: serialised, savedAt: Date.now() });
    tx.oncomplete = () => resolve(serialised.length);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Retrieve all PDFs for an RFQ as an array of File objects.
 * Returns [] if nothing is stored for that rfqId.
 * @param {string} rfqId
 * @returns {Promise<File[]>}
 */
export async function getPdfs(rfqId) {
  if (!rfqId) throw new Error('rfqPdfStorage.getPdfs: rfqId is required');

  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(rfqId);

    req.onsuccess = () => {
      const record = req.result;
      if (!record || !record.pdfs?.length) return resolve([]);
      resolve(record.pdfs.map(toFile));
    };

    req.onerror = () => reject(req.error);
  });
}

/**
 * Resolve one PDF by stable client id (matches `pdfItems[].id` in RfqEngine).
 * @param {string} rfqId
 * @param {string} clientId
 * @returns {Promise<File | null>}
 */
export async function findDraftPdfByClientId(rfqId, clientId) {
  if (!rfqId || !clientId) return null;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(rfqId);
    req.onsuccess = () => {
      const record = req.result;
      const entry = record?.pdfs?.find((p) => p.clientId === clientId);
      if (!entry?.buffer || !(entry.buffer instanceof ArrayBuffer) || entry.buffer.byteLength === 0) {
        return resolve(null);
      }
      resolve(toFile(entry));
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete stored PDFs for an RFQ (call after extraction is complete).
 * @param {string} rfqId
 */
export async function deletePdfs(rfqId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(rfqId);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Migrate any legacy records that stored raw File objects (pre-fix).
 * Call once on app boot — safe to run on already-migrated data.
 */
export async function migrateLegacyRecords() {
  const db = await openDB();

  const allRecords = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  for (const record of allRecords) {
    const needsMigration = record.pdfs?.some(
      (p) => !(p.buffer instanceof ArrayBuffer)
    );
    if (!needsMigration) continue;

    try {
      const fixed = (
        await Promise.all(
          record.pdfs.map(async (p) => {
            if (p.buffer instanceof ArrayBuffer && p.buffer.byteLength > 0) return p;
            // Legacy: buffer was actually a File object stored incorrectly
            const buffer = await toArrayBuffer(p.buffer ?? p.file ?? p);
            if (!buffer) return null;
            return { buffer, name: p.name || 'document.pdf', type: p.type || 'application/pdf' };
          })
        )
      ).filter(Boolean);

      if (!fixed.length) {
        console.warn(`[rfqPdfStorage] Migration dropped empty record: ${record.rfqId}`);
        continue;
      }

      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({ ...record, pdfs: fixed });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });

      console.log(`[rfqPdfStorage] Migrated legacy record: ${record.rfqId}`);
    } catch (err) {
      console.warn(`[rfqPdfStorage] Could not migrate ${record.rfqId}:`, err);
    }
  }
}
