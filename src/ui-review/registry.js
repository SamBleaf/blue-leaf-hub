/**
 * UI Review Mode — tiny route registry + resolver (review-only).
 *
 * Fixture files register handlers with route(method, pattern, respond). Patterns use
 * Express-style :params, e.g. "/api/sales/leads/:id". resolveReview() matches a request
 * URL+method and returns the handler's result (a plain JS body), or undefined if unmatched.
 */

const handlers = [];

/**
 * @param {string} method  GET|POST|PATCH|PUT|DELETE|ANY
 * @param {string} pattern e.g. "/api/sales/leads/:id"  or "/rest/v1/:table"
 * @param {(ctx:{path:string,method:string,params:object,url:URL,opts:object})=>any} respond
 */
export function route(method, pattern, respond) {
  const keys = [];
  // Escape regex specials EXCEPT ':' (used for :params), then turn :param → capture group.
  const rxStr = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:([A-Za-z0-9_]+)/g, (_, k) => {
    keys.push(k);
    return "([^/]+)";
  });
  handlers.push({ method: method.toUpperCase(), rx: new RegExp("^" + rxStr + "/?$"), keys, respond });
}

export function resolveReview(url, opts = {}) {
  const method = String(opts.method || "GET").toUpperCase();
  let parsed;
  try { parsed = new URL(url, "http://ui-review.local"); } catch { return undefined; }
  const path = parsed.pathname;
  for (const h of handlers) {
    if (h.method !== "ANY" && h.method !== method) continue;
    const m = h.rx.exec(path);
    if (!m) continue;
    const params = {};
    h.keys.forEach((k, i) => { try { params[k] = decodeURIComponent(m[i + 1]); } catch { params[k] = m[i + 1]; } });
    let bodyJson = null;
    try { bodyJson = opts.body ? JSON.parse(opts.body) : null; } catch { /* not json */ }
    return h.respond({ path, method, params, url: parsed, opts, bodyJson });
  }
  return undefined;
}
