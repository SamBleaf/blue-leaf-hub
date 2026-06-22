import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getSupabase, supabaseConfigured } from "../../lib/supabaseClient";
import { Card, Loading, Empty, PageTitle } from "../clientportal/clientPortalUi.jsx";

export default function FieldWHS() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabaseConfigured()) { setLoading(false); return; }
    getSupabase().from("projects").select("id, address").order("created_at", { ascending: false }).limit(50)
      .then(({ data }) => { setProjects(data || []); setLoading(false); });
  }, []);

  if (loading) return <div className="space-y-4"><PageTitle>Safety</PageTitle><Loading label="Loading sites…" /></div>;

  return (
    <div className="space-y-4">
      <PageTitle sub="WHS plans, checklists and incidents per site">Safety</PageTitle>
      {projects.length === 0 ? (
        <Empty title="No active sites" />
      ) : (
        <Card title="Your sites">
          <div className="space-y-1.5">
            {projects.map((p) => (
              <Link
                key={p.id}
                to={`/operations/${p.id}/whs`}
                className="flex items-center justify-between gap-2 rounded-lg border border-hairline bg-page/50 px-3 py-3 hover:bg-page transition-colors"
              >
                <span className="text-sm text-ink truncate">{p.address}</span>
                <span className="text-xs font-medium text-primary shrink-0">WHS →</span>
              </Link>
            ))}
          </div>
        </Card>
      )}
      <p className="text-[11px] text-muted text-center">In-app WHS document generation is coming to the field app (Workstream C).</p>
    </div>
  );
}
