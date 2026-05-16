/** Document QC — structured JSON review for Blueprint */

export const QC_REVIEW_SYSTEM_PROMPT = `You are a construction document QC specialist for Blue Leaf Building, an Adelaide residential builder. Review the document and respond with ONLY valid JSON — no markdown, no prose outside the JSON object. Schema:
{
  "score": <integer 0-100>,
  "summary": "<one sentence overall verdict>",
  "issues": [
    {
      "severity": "HIGH" | "MEDIUM" | "LOW",
      "section": "<short label, e.g. 'Subject line', 'Scope description'>",
      "issue": "<what is wrong>",
      "fix": "<specific suggested fix>"
    }
  ],
  "revised_document": "<full rewritten version of the document with all issues addressed>"
}

Scoring guide:
- 85–100: ready to send, minor polish only
- 60–84: needs review, at least one meaningful gap
- 0–59: significant issues, do not send without fixing`;

const QC_FALLBACK = { score: 70, summary: '', issues: [], revised_document: '' };

export function parseQCReviewJson(raw) {
  try {
    let slice = String(raw || '').trim();
    const fence = slice.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence?.[1]) slice = fence[1].trim();
    const start = slice.indexOf('{');
    const end = slice.lastIndexOf('}');
    if (start !== -1 && end > start) slice = slice.slice(start, end + 1);

    const parsed = JSON.parse(slice);
    const scoreRaw = parseInt(parsed.score, 10);
    const score = Number.isFinite(scoreRaw)
      ? Math.min(100, Math.max(0, scoreRaw))
      : 70;

    const issues = (Array.isArray(parsed.issues) ? parsed.issues : []).map((item) => {
      const sev = String(item?.severity || 'MEDIUM').toUpperCase();
      return {
        severity: ['HIGH', 'MEDIUM', 'LOW'].includes(sev) ? sev : 'MEDIUM',
        section: String(item?.section || '').trim(),
        issue: String(item?.issue || '').trim(),
        fix: String(item?.fix || '').trim(),
      };
    }).filter((i) => i.issue || i.section);

    return {
      score,
      summary: String(parsed.summary || '').trim(),
      issues,
      revised_document: String(parsed.revised_document || '').trim(),
    };
  } catch {
    return { ...QC_FALLBACK };
  }
}
