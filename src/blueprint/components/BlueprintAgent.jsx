/**
 * BlueprintAgent.jsx
 * Blue Leaf Hub — AI Operations Manager plugin
 *
 * Supports three render modes:
 *   widget      — floating button + slide-up panel (default, bottom-right)
 *   panel       — full sidebar embed (no toggle, always visible)
 *   inline-qc   — invisible; auto-scores a document and calls onScoreReady
 *
 * Usage:
 *   <BlueprintAgent mode="widget" />
 *   <BlueprintAgent mode="panel" defaultTab="sop" onSOPGenerated={fn} />
 *   <BlueprintAgent mode="inline-qc" documentText={text} documentType="rfq" onScoreReady={fn} />
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const PANEL_WIDTH = 380;
const PANEL_HEIGHT = 560;
import { chat, reviewDocument, generateSOP, troubleshoot } from '../api/chat';

// ─── Icons (inline SVG — no external dependency) ──────────────────────────────

const Icon = ({ name, size = 16, className = '' }) => {
  const paths = {
    blueprint: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
    chat: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
    qc: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    sop: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
    trouble: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    proposal: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
    send: 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8',
    close: 'M6 18L18 6M6 6l12 12',
    chevron: 'M5 15l7-7 7 7',
    loader: 'M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z',
    copy: 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z',
    check: 'M5 13l4 4L19 7',
    warn: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
    plus: 'M12 5v14m-7-7h14',
    file: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6',
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
};

// ─── QC Score Badge ────────────────────────────────────────────────────────────

export const QCBadge = ({ score, issueCount, highCount, onClick }) => {
  const color =
    score >= 85 ? '#16A34A' :
    score >= 60 ? '#D4A24C' :
    '#DC2626';

  const label =
    score >= 85 ? 'PASS' :
    score >= 60 ? 'REVIEW' :
    'FIX REQUIRED';

  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '6px',
        border: `1px solid ${color}22`,
        background: `${color}11`,
        color,
        fontSize: '12px',
        fontWeight: 600,
        fontFamily: "'DM Mono', 'Fira Code', monospace",
        cursor: 'pointer',
        letterSpacing: '0.05em',
        transition: 'all 0.15s',
      }}
      title={`Blueprint QC: ${issueCount} issues${highCount > 0 ? ` (${highCount} HIGH)` : ''}`}
    >
      <Icon name={score >= 85 ? 'check' : 'warn'} size={12} />
      {score}/100 · {label}
      {highCount > 0 && (
        <span style={{
          background: '#DC262622',
          color: '#DC2626',
          borderRadius: '4px',
          padding: '1px 5px',
          fontSize: '11px',
        }}>
          {highCount} HIGH
        </span>
      )}
    </button>
  );
};

// ─── Message Bubble ────────────────────────────────────────────────────────────

const MessageBubble = ({ message }) => {
  const [copied, setCopied] = useState(false);
  const isAssistant = message.role === 'assistant';

  const copy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isAssistant ? 'flex-start' : 'flex-end',
      gap: '4px',
      animation: 'fadeSlideIn 0.2s ease',
    }}>
      {isAssistant && (
        <span style={{
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '0.1em',
          color: '#2E6B4F',
          textTransform: 'uppercase',
          paddingLeft: '2px',
          fontFamily: "'DM Mono', monospace",
        }}>
          Blueprint
        </span>
      )}
      <div style={{
        maxWidth: '88%',
        padding: isAssistant ? '10px 14px' : '10px 14px',
        borderRadius: isAssistant ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
        background: isAssistant ? '#F0F4F8' : '#1B3A5C',
        color: isAssistant ? '#1A1A2E' : '#F8F9FA',
        fontSize: '13.5px',
        lineHeight: '1.6',
        whiteSpace: 'pre-wrap',
        position: 'relative',
      }}>
        {message.content}
        {message.streaming && (
          <span style={{ display: 'inline-block', color: '#2E6B4F', animation: 'blink 1s step-end infinite', marginLeft: '1px' }}>▍</span>
        )}
        {isAssistant && (
          <button
            onClick={copy}
            style={{
              position: 'absolute',
              top: '6px',
              right: '6px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              opacity: 0.3,
              color: '#1A1A2E',
              padding: '2px',
              borderRadius: '4px',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
            onMouseLeave={e => e.currentTarget.style.opacity = '0.3'}
            title="Copy"
          >
            <Icon name={copied ? 'check' : 'copy'} size={12} />
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Typing Indicator ─────────────────────────────────────────────────────────

const TypingIndicator = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '2px' }}>
    <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: '#2E6B4F', textTransform: 'uppercase', fontFamily: "'DM Mono', monospace" }}>Blueprint</span>
    <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: '5px', height: '5px', borderRadius: '50%',
          background: '#2E6B4F',
          animation: `typingPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
    </div>
  </div>
);

// ─── Tab Button ───────────────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
const TabBtn = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '3px',
      padding: '8px 6px 6px',
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      color: active ? '#2E6B4F' : '#64748B',
      borderBottom: active ? '2px solid #2E6B4F' : '2px solid transparent',
      transition: 'all 0.15s',
      flex: 1,
      minWidth: 0,
    }}
  >
    <Icon name={icon} size={15} />
    <span style={{ fontSize: '10px', fontWeight: active ? 700 : 500, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  </button>
);

// ─── Chat Tab ─────────────────────────────────────────────────────────────────

const MAX_CHAT_UPLOAD_BYTES = 8 * 1024 * 1024;
const TEXT_UPLOAD_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
]);

function isTextUpload(file) {
  return TEXT_UPLOAD_TYPES.has(file.type) || /\.(txt|md|markdown|csv|json)$/i.test(file.name);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

function fileToText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsText(file);
  });
}

async function readChatAttachment(file) {
  if (file.size > MAX_CHAT_UPLOAD_BYTES) {
    throw new Error(`${file.name} is over 8 MB. Use a smaller file or paste the key section.`);
  }

  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    const dataUrl = await fileToDataUrl(file);
    return {
      name: file.name,
      mimeType: 'application/pdf',
      size: file.size,
      kind: 'pdf',
      dataBase64: dataUrl.split(',')[1] || '',
    };
  }

  if (isTextUpload(file)) {
    return {
      name: file.name,
      mimeType: file.type || 'text/plain',
      size: file.size,
      kind: 'text',
      text: await fileToText(file),
    };
  }

  throw new Error(`${file.name} is not supported yet. Upload PDF, TXT, MD, CSV, or JSON files.`);
}

const ChatTab = ({ jobContext, hubContext }) => {
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: "G'day Sam. I'm Blueprint — your operations manager inside Blue Leaf Hub.\n\nI know the APB framework and I'm here to help you systematise the business, review documents, create SOPs, and diagnose problems.\n\nWhat are you working on?",
  }]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploadError, setUploadError] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || loading) return;
    setInput('');
    const sentAttachments = attachments;
    setAttachments([]);
    setUploadError('');
    const attachmentNames = sentAttachments.map((f) => f.name).join(', ');
    const content = [
      text || 'Please review the uploaded document(s).',
      attachmentNames ? `\n\nAttached: ${attachmentNames}` : '',
    ].join('');
    const userMsg = { role: 'user', content, attachments: sentAttachments.map(({ name, size, kind }) => ({ name, size, kind })) };
    const newMessages = [...messages, userMsg];
    const placeholderMsg = { role: 'assistant', content: '', streaming: true };
    setMessages([...newMessages, placeholderMsg]);
    setLoading(true);
    try {
      const reply = await chat(
        newMessages,
        { jobContext, hubContext, attachments: sentAttachments },
        (cumulative) => {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { ...updated[updated.length - 1], content: cumulative };
            return updated;
          });
        },
      );
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: reply, streaming: false };
        return updated;
      });
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: `Sorry, something went wrong: ${err.message}`, streaming: false };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;

    setUploadError('');
    try {
      const next = await Promise.all(files.map(readChatAttachment));
      setAttachments((prev) => [...prev, ...next].slice(0, 4));
    } catch (err) {
      setUploadError(err.message || 'Could not upload file');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const suggestions = [
    'Review my RFQ process for gaps',
    'Create an SOP for client onboarding',
    'We keep losing jobs on price — diagnose this',
    'Build a proposal for a new project',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {messages.map((m, i) => <MessageBubble key={i} message={m} />)}
        {loading && !messages.some((m) => m.streaming) && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions (only when just the greeting is shown) */}
      {messages.length === 1 && (
        <div style={{ padding: '0 14px 10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {suggestions.map(s => (
            <button key={s} onClick={() => setInput(s)} style={{
              padding: '5px 10px',
              borderRadius: '20px',
              border: '1px solid #E2E8F0',
              background: '#fff',
              color: '#1B3A5C',
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'all 0.15s',
              fontFamily: 'inherit',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#2E6B4F'; e.currentTarget.style.color = '#2E6B4F'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.color = '#1B3A5C'; }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      {(attachments.length > 0 || uploadError) && (
        <div style={{
          padding: '8px 12px 0',
          borderTop: '1px solid #E2E8F0',
          background: '#fff',
        }}>
          {attachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {attachments.map((file, index) => (
                <div key={`${file.name}-${index}`} style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  maxWidth: '100%',
                  padding: '5px 8px',
                  borderRadius: '8px',
                  border: '1px solid #CDE3D9',
                  background: '#2E6B4F0D',
                  color: '#1B3A5C',
                  fontSize: '11px',
                }}>
                  <Icon name="file" size={12} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '230px' }}>
                    {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== index))}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: '#64748B',
                      cursor: 'pointer',
                      padding: 0,
                      fontSize: '14px',
                      lineHeight: 1,
                    }}
                    title={`Remove ${file.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {uploadError && (
            <div style={{ marginTop: attachments.length ? '6px' : 0, color: '#DC2626', fontSize: '12px' }}>
              {uploadError}
            </div>
          )}
        </div>
      )}
      <div style={{
        padding: '10px 12px 12px',
        borderTop: attachments.length > 0 || uploadError ? 'none' : '1px solid #E2E8F0',
        display: 'flex',
        gap: '8px',
        alignItems: 'flex-end',
        background: '#fff',
      }}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.markdown,.csv,.json,application/pdf,text/plain,text/markdown,text/csv,application/json"
          onChange={handleFiles}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          style={{
            width: '36px', height: '36px', borderRadius: '999px',
            border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            background: loading ? '#E2E8F0' : '#2E6B4F',
            color: loading ? '#94A3B8' : '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
            flexShrink: 0,
            fontSize: '22px',
            fontWeight: 600,
            lineHeight: 1,
            boxShadow: loading ? 'none' : '0 2px 8px rgba(46, 107, 79, 0.24)',
          }}
          title="Upload documents"
          aria-label="Upload documents to Blueprint"
        >
          +
        </button>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Blueprint anything…"
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            border: '1px solid #E2E8F0',
            borderRadius: '8px',
            padding: '9px 12px',
            fontSize: '13.5px',
            fontFamily: 'inherit',
            outline: 'none',
            lineHeight: '1.5',
            maxHeight: '100px',
            overflowY: 'auto',
            transition: 'border-color 0.15s',
            color: '#1A1A2E',
          }}
          onFocus={e => e.target.style.borderColor = '#2E6B4F'}
          onBlur={e => e.target.style.borderColor = '#E2E8F0'}
          onInput={e => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
          }}
        />
        <button
          onClick={send}
          disabled={(!input.trim() && attachments.length === 0) || loading}
          style={{
            width: '36px', height: '36px', borderRadius: '8px',
            border: 'none', cursor: 'pointer',
            background: (input.trim() || attachments.length > 0) && !loading ? '#2E6B4F' : '#E2E8F0',
            color: (input.trim() || attachments.length > 0) && !loading ? '#fff' : '#94A3B8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
            flexShrink: 0,
          }}
        >
          <Icon name="send" size={14} />
        </button>
      </div>
    </div>
  );
};

// ─── QC result view (shared by QCTab + RfqEngine inline panel) ───────────────

export function QCResultView({ result, onUseDraft }) {
  const [copied, setCopied] = useState(false);

  const severityColor = { HIGH: '#DC2626', MEDIUM: '#D4A24C', LOW: '#64748B' };

  const handleUseDraft = () => {
    if (!result?.revisedDocument) return;
    if (onUseDraft) {
      onUseDraft(result.revisedDocument);
      return;
    }
    navigator.clipboard.writeText(result.revisedDocument);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 14px', borderRadius: '8px', marginBottom: '12px',
        background: result.score >= 85 ? '#16A34A11' : result.score >= 60 ? '#D4A24C11' : '#DC262611',
        border: `1px solid ${result.score >= 85 ? '#16A34A33' : result.score >= 60 ? '#D4A24C33' : '#DC262633'}`,
      }}>
        <span style={{
          fontSize: '28px', fontWeight: 800,
          color: result.score >= 85 ? '#16A34A' : result.score >= 60 ? '#D4A24C' : '#DC2626',
          fontFamily: "'DM Mono', monospace",
          lineHeight: 1,
        }}>
          {result.score}
        </span>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A2E' }}>
            {result.score >= 85 ? 'Passes QC' : result.score >= 60 ? 'Needs Review' : 'Fix Required Before Sending'}
          </div>
          <div style={{ fontSize: '12px', color: '#64748B' }}>
            {result.issues?.length || 0} issues found
          </div>
        </div>
      </div>

      {result.summary && (
        <div style={{
          fontSize: '13px', color: '#64748B', marginBottom: '12px',
          fontStyle: 'italic', lineHeight: 1.5,
        }}>
          {result.summary}
        </div>
      )}

      {result.issues?.map((issue, i) => (
        <div key={i} style={{
          padding: '10px 12px', marginBottom: '8px', borderRadius: '8px',
          border: `1px solid ${severityColor[issue.severity]}22`,
          background: `${severityColor[issue.severity]}08`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <span style={{
              fontSize: '10px', fontWeight: 700,
              color: ({ HIGH: '#DC2626', MEDIUM: '#D4A24C', LOW: '#64748B' })[issue.severity],
              fontFamily: "'DM Mono', monospace",
              letterSpacing: '0.08em',
            }}>
              {issue.severity}
            </span>
            {issue.section && (
              <>
                <span style={{ fontSize: '12px', color: '#64748B' }}>·</span>
                <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 500 }}>{issue.section}</span>
              </>
            )}
          </div>
          <div style={{ fontSize: '13px', color: '#1A1A2E', marginBottom: '4px' }}>{issue.issue}</div>
          {issue.fix && (
            <div style={{ fontSize: '12px', color: '#2E6B4F', fontStyle: 'italic' }}>→ {issue.fix}</div>
          )}
        </div>
      ))}

      {result.revisedDocument && (
        <div style={{ marginTop: '12px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: '6px',
          }}>
            <span style={{
              fontSize: '11px', fontWeight: 700, color: '#64748B',
              letterSpacing: '0.08em', textTransform: 'uppercase',
              fontFamily: "'DM Mono', monospace",
            }}>
              AI Draft
            </span>
            <button
              type="button"
              onClick={handleUseDraft}
              style={{
                padding: '4px 10px', borderRadius: '6px', border: 'none',
                background: '#2E6B4F', color: '#fff',
                fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {copied ? 'Copied!' : onUseDraft ? 'Use this draft' : 'Copy draft'}
            </button>
          </div>
          <div style={{
            padding: '12px', borderRadius: '8px',
            background: '#F8F9FA', border: '1px solid #E2E8F0',
            fontSize: '13px', lineHeight: '1.6', whiteSpace: 'pre-wrap',
            color: '#1A1A2E', maxHeight: '300px', overflowY: 'auto',
          }}>
            {result.revisedDocument}
          </div>
        </div>
      )}
    </>
  );
}

// ─── QC Tab ───────────────────────────────────────────────────────────────────

const QCTab = ({ initialDocument = '', initialType = 'rfq', _onUseDraft }) => {
  const [docText, setDocText] = useState(initialDocument);
  const [docType, setDocType] = useState(initialType);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!docText.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await reviewDocument(docText, docType);
      setResult(data);
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          {['rfq', 'proposal', 'sop', 'email', 'contract'].map(t => (
            <button key={t} onClick={() => setDocType(t)} style={{
              padding: '4px 10px', borderRadius: '20px', border: '1px solid',
              borderColor: docType === t ? '#2E6B4F' : '#E2E8F0',
              background: docType === t ? '#2E6B4F' : '#fff',
              color: docType === t ? '#fff' : '#64748B',
              fontSize: '11px', fontWeight: 600, cursor: 'pointer',
              textTransform: 'uppercase', letterSpacing: '0.05em',
              fontFamily: "'DM Mono', monospace",
            }}>
              {t}
            </button>
          ))}
        </div>

        <textarea
          value={docText}
          onChange={e => setDocText(e.target.value)}
          placeholder="Paste your document here — RFQ email, proposal section, SOP, or contract…"
          style={{
            width: '100%', minHeight: '140px', borderRadius: '8px',
            border: '1px solid #E2E8F0', padding: '10px 12px',
            fontSize: '13px', fontFamily: 'inherit', resize: 'vertical',
            outline: 'none', lineHeight: '1.5', boxSizing: 'border-box',
            color: '#1A1A2E',
          }}
          onFocus={e => e.target.style.borderColor = '#2E6B4F'}
          onBlur={e => e.target.style.borderColor = '#E2E8F0'}
        />

        <button onClick={run} disabled={!docText.trim() || loading} style={{
          marginTop: '10px', width: '100%', padding: '10px',
          borderRadius: '8px', border: 'none', cursor: 'pointer',
          background: docText.trim() && !loading ? '#1B3A5C' : '#E2E8F0',
          color: docText.trim() && !loading ? '#fff' : '#94A3B8',
          fontSize: '13px', fontWeight: 600, transition: 'all 0.15s',
          fontFamily: 'inherit',
        }}>
          {loading ? 'Reviewing…' : 'Run QC Review'}
        </button>

        {result && !result.error && (
          <div style={{ marginTop: '14px' }}>
            <QCResultView result={result} onUseDraft={(draft) => setDocText(draft)} />
          </div>
        )}

        {result?.error && (
          <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '8px', background: '#DC262611', border: '1px solid #DC262633', color: '#DC2626', fontSize: '13px' }}>
            Error: {result.error}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── SOP Tab ──────────────────────────────────────────────────────────────────

const SOPTab = ({ onSOPGenerated }) => {
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: "I'll create a complete SOP for you.\n\nTell me the process — what are we documenting?",
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [savedSOP, setSavedSOP] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    const newMessages = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const reply = await generateSOP(newMessages);
      const assistantMsg = { role: 'assistant', content: reply };
      setMessages(prev => [...prev, assistantMsg]);
      // Detect if this is the final SOP (contains the SOP structure)
      if (reply.includes('SOP TITLE:') || reply.includes('PURPOSE\n')) {
        setSavedSOP(reply);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const save = () => {
    if (savedSOP && onSOPGenerated) {
      onSOPGenerated(savedSOP);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {messages.map((m, i) => <MessageBubble key={i} message={m} />)}
        {loading && <TypingIndicator />}
        {savedSOP && (
          <div style={{
            padding: '10px 12px', borderRadius: '8px',
            background: '#2E6B4F11', border: '1px solid #2E6B4F33',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '13px', color: '#2E6B4F', fontWeight: 600 }}>SOP ready to save</span>
            <button onClick={save} style={{
              padding: '5px 12px', borderRadius: '6px',
              background: '#2E6B4F', color: '#fff', border: 'none',
              cursor: 'pointer', fontSize: '12px', fontWeight: 600,
            }}>
              Save to Library
            </button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div style={{
        padding: '10px 12px 12px', borderTop: '1px solid #E2E8F0',
        display: 'flex', gap: '8px', alignItems: 'flex-end', background: '#fff',
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Describe the process…"
          rows={1}
          style={{
            flex: 1, resize: 'none', border: '1px solid #E2E8F0', borderRadius: '8px',
            padding: '9px 12px', fontSize: '13.5px', fontFamily: 'inherit',
            outline: 'none', lineHeight: '1.5', maxHeight: '100px', overflowY: 'auto',
            color: '#1A1A2E',
          }}
          onFocus={e => e.target.style.borderColor = '#2E6B4F'}
          onBlur={e => e.target.style.borderColor = '#E2E8F0'}
        />
        <button onClick={send} disabled={!input.trim() || loading} style={{
          width: '36px', height: '36px', borderRadius: '8px', border: 'none',
          cursor: 'pointer',
          background: input.trim() && !loading ? '#2E6B4F' : '#E2E8F0',
          color: input.trim() && !loading ? '#fff' : '#94A3B8',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s', flexShrink: 0,
        }}>
          <Icon name="send" size={14} />
        </button>
      </div>
    </div>
  );
};

// ─── Troubleshoot Tab ─────────────────────────────────────────────────────────

const TroubleTab = () => {
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: "Describe the problem — I'll diagnose the root cause using the APB framework and give you a fix.\n\nWhat's not working the way it should?",
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    const newMessages = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const reply = await troubleshoot(newMessages);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const problems = [
    'Losing jobs on price',
    'Clients surprised by price at signing',
    'Spending too much time on free quotes',
    'Cash flow keeps tightening',
    'Team not following process',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {messages.map((m, i) => <MessageBubble key={i} message={m} />)}
        {loading && <TypingIndicator />}
        {messages.length === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {problems.map(p => (
              <button key={p} onClick={() => setInput(p)} style={{
                padding: '8px 12px', borderRadius: '8px', textAlign: 'left',
                border: '1px solid #E2E8F0', background: '#fff',
                color: '#1A1A2E', fontSize: '13px', cursor: 'pointer',
                transition: 'all 0.15s', fontFamily: 'inherit',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#1B3A5C'; e.currentTarget.style.background = '#F0F4F8'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = '#fff'; }}
              >
                {p}
              </button>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div style={{
        padding: '10px 12px 12px', borderTop: '1px solid #E2E8F0',
        display: 'flex', gap: '8px', alignItems: 'flex-end', background: '#fff',
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Describe the problem…"
          rows={1}
          style={{
            flex: 1, resize: 'none', border: '1px solid #E2E8F0', borderRadius: '8px',
            padding: '9px 12px', fontSize: '13.5px', fontFamily: 'inherit',
            outline: 'none', lineHeight: '1.5', maxHeight: '100px', overflowY: 'auto',
            color: '#1A1A2E',
          }}
          onFocus={e => e.target.style.borderColor = '#2E6B4F'}
          onBlur={e => e.target.style.borderColor = '#E2E8F0'}
        />
        <button onClick={send} disabled={!input.trim() || loading} style={{
          width: '36px', height: '36px', borderRadius: '8px', border: 'none',
          cursor: 'pointer',
          background: input.trim() && !loading ? '#2E6B4F' : '#E2E8F0',
          color: input.trim() && !loading ? '#fff' : '#94A3B8',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s', flexShrink: 0,
        }}>
          <Icon name="send" size={14} />
        </button>
      </div>
    </div>
  );
};

// ─── Panel Shell ──────────────────────────────────────────────────────────────

const BlueprintPanel = ({
  defaultTab = 'chat',
  jobContext,
  documentContext,
  documentType,
  onSOPGenerated,
  _onIssueFound,
  onClose,
  onMinimize,
  onHeaderMouseDown,
  isWidget = false,
  hubContext = null,
}) => {
  const [activeTab, setActiveTab] = useState(defaultTab);

  const tabs = [
    { id: 'chat',      icon: 'chat',    label: 'Chat' },
    { id: 'qc',        icon: 'qc',      label: 'Doc QC' },
    { id: 'sop',       icon: 'sop',     label: 'SOP' },
    { id: 'trouble',   icon: 'trouble', label: 'Fix' },
  ];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#fff',
      borderRadius: isWidget ? '16px 16px 0 0' : '12px',
      overflow: 'hidden',
      boxShadow: isWidget ? '0 -4px 32px rgba(27,58,92,0.15)' : '0 2px 16px rgba(27,58,92,0.08)',
      border: '1px solid #E2E8F0',
    }}>
      {/* Header — drag handle in widget mode */}
      <div
        onMouseDown={isWidget ? onHeaderMouseDown : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 14px 0',
          background: '#1B3A5C',
          cursor: isWidget ? 'grab' : 'default',
          userSelect: isWidget ? 'none' : 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '7px',
            background: '#2E6B4F',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="blueprint" size={14} className="" style={{ color: '#fff' }} />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', letterSpacing: '0.02em' }}>Blueprint</div>
            <div style={{ fontSize: '10px', color: '#94A3B8', fontFamily: "'DM Mono', monospace", letterSpacing: '0.05em' }}>
              APB · Blue Leaf Hub
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {onMinimize && (
            <button
              type="button"
              onClick={onMinimize}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#94A3B8', padding: '4px', borderRadius: '6px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'color 0.15s',
                marginRight: '4px',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; }}
              title="Minimise"
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M5 12h14" />
              </svg>
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#94A3B8', padding: '4px', borderRadius: '6px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; }}
              title="Close"
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        background: '#1B3A5C',
        borderBottom: '1px solid #E2E8F0',
        paddingTop: '4px',
      }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: '3px', padding: '8px 4px 8px', border: 'none', cursor: 'pointer',
            background: 'none',
            color: activeTab === t.id ? '#fff' : '#64748B',
            borderBottom: activeTab === t.id ? '2px solid #2E6B4F' : '2px solid transparent',
            transition: 'all 0.15s',
          }}>
            <Icon name={t.icon} size={14} />
            <span style={{ fontSize: '10px', fontWeight: activeTab === t.id ? 700 : 500, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
              {t.label}
            </span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'chat' && <ChatTab jobContext={jobContext} hubContext={hubContext} />}
        {activeTab === 'qc' && <QCTab initialDocument={documentContext} initialType={documentType} />}
        {activeTab === 'sop' && <SOPTab onSOPGenerated={onSOPGenerated} />}
        {activeTab === 'trouble' && <TroubleTab />}
      </div>
    </div>
  );
};

// ─── Main Export: BlueprintAgent ──────────────────────────────────────────────

export default function BlueprintAgent({
  mode = 'widget',
  defaultTab = 'chat',
  jobContext = null,
  hubContext = null,
  documentContext = '',
  documentType = 'rfq',
  onSOPGenerated,
  onIssueFound,
  onScoreReady,
}) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem("blueprint_open") === "true"; } catch { return false; }
  });
  const [minimized, setMinimized] = useState(() => {
    try { return localStorage.getItem("blueprint_minimized") === "true"; } catch { return false; }
  });
  const [panelPos, setPanelPos] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("blueprint_pos") || "null");
      return saved || { bottom: 80, right: 20 };
    } catch { return { bottom: 80, right: 20 }; }
  });
  const dragRef = useRef(null);
  const posRef = useRef(panelPos);

  const handleSetOpen = (val) => {
    setOpen(val);
    try { localStorage.setItem("blueprint_open", String(val)); } catch { /* ignore */ }
  };
  const handleSetMinimized = (val) => {
    setMinimized(val);
    try { localStorage.setItem("blueprint_minimized", String(val)); } catch { /* ignore */ }
  };

  const handleHeaderMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button')) return;
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startBottom: panelPos.bottom,
      startRight: panelPos.right,
    };

    const onMove = (ev) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      const margin = 8;
      const maxBottom = window.innerHeight - PANEL_HEIGHT - margin;
      const maxRight = window.innerWidth - PANEL_WIDTH - margin;
      const bottom = Math.max(margin, Math.min(maxBottom, dragRef.current.startBottom - dy));
      const right = Math.max(margin, Math.min(maxRight, dragRef.current.startRight - dx));
      setPanelPos({ bottom, right });
      posRef.current = { bottom, right };
    };

    const onUp = () => {
      dragRef.current = null;
      try { localStorage.setItem("blueprint_pos", JSON.stringify(posRef.current)); } catch { /* ignore */ }
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [panelPos.bottom, panelPos.right]);

  // ── inline-qc mode: invisible, auto-fires on documentContext change ──
  useEffect(() => {
    if (mode !== 'inline-qc' || !documentContext?.trim()) return;
    const timer = setTimeout(async () => {
      try {
        const result = await reviewDocument(documentContext, documentType);
        if (onScoreReady) onScoreReady(result.score, result.issues || []);
        if (onIssueFound && result.issues) result.issues.forEach(onIssueFound);
      } catch { /* silent fail in inline mode */ }
    }, 800);
    return () => clearTimeout(timer);
  }, [mode, documentContext, documentType, onIssueFound, onScoreReady]);

  if (mode === 'inline-qc') return null;

  // ── panel mode: always visible, no toggle ──
  if (mode === 'panel') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <BlueprintPanel
          defaultTab={defaultTab}
          jobContext={jobContext}
          hubContext={hubContext}
          documentContext={documentContext}
          documentType={documentType}
          onSOPGenerated={onSOPGenerated}
          onIssueFound={onIssueFound}
        />
      </div>
    );
  }

  // ── widget mode: floating button + slide-up panel ──
  return (
    <>
      {/* CSS */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes typingPulse {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes panelIn {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .blueprint-fab:hover {
          transform: scale(1.06);
          box-shadow: 0 8px 28px rgba(27,58,92,0.28) !important;
        }
      `}</style>

      {/* Floating panel — always mounted; visibility via CSS only */}
      <div
        style={{
          position: 'fixed',
          bottom: `${panelPos.bottom}px`,
          right: `${panelPos.right}px`,
          width: `${PANEL_WIDTH}px`,
          height: `${PANEL_HEIGHT}px`,
          zIndex: 9998,
          display: open && !minimized ? 'block' : 'none',
          animation: open && !minimized ? 'panelIn 0.25s ease' : 'none',
        }}
      >
        <BlueprintPanel
          defaultTab={defaultTab}
          jobContext={jobContext}
          hubContext={hubContext}
          documentContext={documentContext}
          documentType={documentType}
          onSOPGenerated={onSOPGenerated}
          onIssueFound={onIssueFound}
          onClose={() => handleSetOpen(false)}
          onMinimize={() => handleSetMinimized(true)}
          onHeaderMouseDown={handleHeaderMouseDown}
          isWidget
        />
      </div>

      {/* FAB */}
      <button
        onClick={() => {
          handleSetOpen(!open);
          handleSetMinimized(false);
        }}
        className="blueprint-fab"
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          width: '52px',
          height: '52px',
          borderRadius: '14px',
          border: 'none',
          cursor: 'pointer',
          background: open ? '#1B3A5C' : '#2E6B4F',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(27,58,92,0.22)',
          zIndex: 9999,
          transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
        title={open ? 'Close Blueprint' : 'Open Blueprint — AI Operations Manager'}
      >
        <Icon name={open ? 'close' : 'blueprint'} size={22} />
      </button>
    </>
  );
}
