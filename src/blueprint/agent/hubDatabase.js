/**
 * Blue Leaf Hub — server-side Supabase access for Blueprint tools.
 * Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (same DB as the Hub app).
 */

import { createClient } from '@supabase/supabase-js';

const SUB_REQUIRED_FIELDS = ['contact', 'mobile', 'abn', 'address'];
const SUB_UPDATABLE_FIELDS = [
  'contact', 'mobile', 'email', 'abn', 'address', 'suburb', 'state', 'postcode', 'notes', 'trade',
];

function isPlaceholderSupabaseUrl(url) {
  if (!url) return true;
  return /your-project|YOUR-PROJECT|example\.supabase/i.test(url);
}

/** Prefer a real project URL — Hub .env often has placeholder SUPABASE_URL but valid VITE_SUPABASE_URL. */
export function resolveSupabaseUrl() {
  const candidates = [
    process.env.SUPABASE_URL?.trim(),
    process.env.VITE_SUPABASE_URL?.trim(),
  ].filter(Boolean);

  const real = candidates.find((u) => !isPlaceholderSupabaseUrl(u));
  return real || candidates[0] || null;
}

export function getHubSupabase() {
  const url = resolveSupabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || isPlaceholderSupabaseUrl(url)) return null;
  return createClient(url, key);
}

/** Quick check for /api/blueprint/health */
export function getHubStatus() {
  const url = resolveSupabaseUrl();
  const key = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  const placeholder = isPlaceholderSupabaseUrl(url);
  return {
    supabaseConfigured: Boolean(url && key && !placeholder),
    supabaseUrlResolved: Boolean(url && !placeholder),
    supabaseUrlIsPlaceholder: placeholder,
    serviceRoleKey: key,
    hint: placeholder
      ? 'Set SUPABASE_URL in .env to the same value as VITE_SUPABASE_URL (not your-project.supabase.co)'
      : undefined,
  };
}

function missingFields(row) {
  return SUB_REQUIRED_FIELDS.filter((f) => {
    const v = row[f];
    return v == null || String(v).trim() === '';
  });
}

function enrichSubcontractor(row) {
  const missing_fields = missingFields(row);
  return {
    ...row,
    missing_fields,
    missing_count: missing_fields.length,
  };
}

export async function listSubcontractors({ missingOnly = false, trade = null, limit = 100 } = {}) {
  const sb = getHubSupabase();
  if (!sb) return { ok: false, error: 'Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' };

  let q = sb.from('subcontractors').select('*').order('business_name').limit(limit);
  if (trade) q = q.ilike('trade', `%${trade}%`);

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };

  let rows = (data || []).map(enrichSubcontractor);
  if (missingOnly) rows = rows.filter((r) => r.missing_count > 0);

  const total_missing_field_slots = rows.reduce((n, r) => n + r.missing_count, 0);

  return {
    ok: true,
    count: rows.length,
    total_missing_field_slots,
    subcontractors: rows,
  };
}

export async function getSubcontractor(id) {
  const sb = getHubSupabase();
  if (!sb) return { ok: false, error: 'Supabase not configured' };

  const { data, error } = await sb.from('subcontractors').select('*').eq('id', id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Subcontractor not found' };

  return { ok: true, subcontractor: enrichSubcontractor(data) };
}

export async function updateSubcontractor(id, updates, { confirmed = false, source = '' } = {}) {
  if (!confirmed) {
    return {
      ok: false,
      error: 'Updates require confirmed:true after the director approves each field. Present findings first.',
    };
  }

  const sb = getHubSupabase();
  if (!sb) return { ok: false, error: 'Supabase not configured' };

  const payload = {};
  for (const key of SUB_UPDATABLE_FIELDS) {
    if (updates[key] !== undefined) {
      const v = updates[key];
      payload[key] = v == null || String(v).trim() === '' ? null : String(v).trim();
    }
  }

  if (!Object.keys(payload).length) {
    return { ok: false, error: 'No valid fields to update' };
  }

  if (source?.trim()) {
    const noteLine = `[Blueprint ${new Date().toISOString().slice(0, 10)}] ${source.trim()}`;
    const { data: existing } = await sb.from('subcontractors').select('notes').eq('id', id).maybeSingle();
    const prev = existing?.notes?.trim() || '';
    payload.notes = prev ? `${prev}\n${noteLine}` : noteLine;
  }

  const { data, error } = await sb.from('subcontractors').update(payload).eq('id', id).select('*').single();
  if (error) return { ok: false, error: error.message };

  return { ok: true, subcontractor: enrichSubcontractor(data), updated_fields: Object.keys(payload) };
}

export async function listJobs({ status = null, limit = 50 } = {}) {
  const sb = getHubSupabase();
  if (!sb) return { ok: false, error: 'Supabase not configured' };

  let q = sb
    .from('jobs')
    .select('id, address, client_name, project_type, floor_area_m2, status, architect_name, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };

  return { ok: true, count: data?.length || 0, jobs: data || [] };
}

export async function getJob(id) {
  const sb = getHubSupabase();
  if (!sb) return { ok: false, error: 'Supabase not configured' };

  const { data, error } = await sb.from('jobs').select('*').eq('id', id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Job not found' };

  return { ok: true, job: data };
}

export async function saveDocumentReview({
  jobId = null,
  documentType,
  documentText,
  score,
  issues,
  revisedDocument,
}) {
  const sb = getHubSupabase();
  if (!sb) return { ok: false, error: 'Supabase not configured' };

  const { data, error } = await sb
    .from('document_reviews')
    .insert({
      job_id: jobId || null,
      document_type: documentType,
      document_text: documentText?.slice(0, 50000) || null,
      score,
      issues: issues || [],
      revised_document: revisedDocument?.slice(0, 50000) || null,
    })
    .select('id, created_at')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, review_id: data.id, created_at: data.created_at };
}
