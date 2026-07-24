// Quote Inbox (step 9b) — a first-class home for inbound subcontractor quotes the matcher couldn't
// auto-tie to a job. Promotes the triage that was buried in the Quote Tracker's Unmatched tab.
// Matching here dual-writes the new submission model (see /api/unmatched-quotes/resolve).
import UnmatchedQuotesPanel from "../components/tender/UnmatchedQuotesPanel.jsx";

export default function QuoteInbox() {
  return (
    <div className="space-y-5 pb-24">
      <header>
        <h1 className="page-title text-2xl">Quote Inbox</h1>
        <p className="mt-0.5 text-sm text-muted">Inbound subcontractor quotes that need matching to a job &amp; trade.</p>
      </header>
      <UnmatchedQuotesPanel />
    </div>
  );
}
