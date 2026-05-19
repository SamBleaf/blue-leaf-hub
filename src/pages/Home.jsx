import { Link } from "react-router-dom";
const SECTIONS = [
  {
    id: "tender",
    title: "Tender Manager",
    description: "RFQs, subcontractors, quotes, tenders, and cost intelligence — active today.",
    href: "/tender-manager/home",
    active: true,
    modules: ["Home", "RFQ Engine", "Subcontractors", "Quote Tracker", "Tender Manager", "Cost Intelligence"]
  },
  {
    id: "operations_manager",
    title: "Operations Manager",
    description: "Schedule, WHS compliance, site diary, and project management for active builds.",
    href: "/operations",
    active: true,
    modules: ["Projects", "Schedule", "WHS", "Site Diary"]
  },
  {
    id: "finance_manager",
    title: "Finance Manager",
    description: "Invoice inbox, approval queue, WIPAA calculator, and job financials.",
    href: "/finance",
    active: true,
    modules: ["Financial Inbox", "Approval Queue", "WIPAA Calculator", "Job Financials"]
  },
  {
    id: "sales_marketing",
    title: "Sales Manager",
    description: "APB-coached pipeline with qualifying scorecard, activity timeline, and Blueprint insights at every stage.",
    href: "/sales",
    active: true,
    modules: ["Pipeline", "Lead Detail", "Qualifying Scorecard", "Blueprint Coaching"]
  },
  {
    id: "client_portal",
    title: "Client Portal",
    description: "Client logins, selections, variations, and document sharing — coming soon.",
    href: null,
    comingSoon: true
  }
];

export default function Home() {
  return (
    <div className="space-y-8">
      <div className="rounded-card border border-hairline bg-gradient-to-br from-primary to-[#102542] p-8 text-white shadow-lg">
        <h1 className="text-3xl font-semibold tracking-tight">Blue Leaf Hub</h1>
        <p className="mt-3 max-w-2xl text-sm text-white/85">
          Central operating system organised by department.{" "}
          <span className="font-semibold text-accent">Tender Manager</span>,{" "}
          <span className="font-semibold text-accent">Operations Manager</span>, and{" "}
          <span className="font-semibold text-accent">Finance Manager</span> are live today;{" "}
          <span className="whitespace-nowrap">Sales Manager</span> and{" "}
          <span className="whitespace-nowrap">Client Portal</span> are on the roadmap.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map((card) => {
          const inner = (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="text-lg font-semibold text-primary">{card.title}</h2>
                {card.comingSoon ? (
                  <span className="rounded-full border border-warning/60 bg-warning/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
                    Coming soon
                  </span>
                ) : (
                  <span className="rounded-full border border-accent/40 bg-accent/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                    Active
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-muted">{card.description}</p>
              {card.modules ? (
                <ul className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
                  {card.modules.map((m) => (
                    <li key={m} className="rounded-md border border-hairline bg-page px-2 py-1">
                      {m}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          );

          if (card.href && !card.comingSoon) {
            return (
              <Link
                key={card.id}
                to={card.href}
                className="rounded-card border border-hairline bg-surface p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40"
              >
                {inner}
              </Link>
            );
          }

          return (
            <div
              key={card.id}
              className="rounded-card border border-dashed border-hairline bg-surface/80 p-6 opacity-90"
            >
              {inner}
            </div>
          );
        })}
      </section>
    </div>
  );
}
