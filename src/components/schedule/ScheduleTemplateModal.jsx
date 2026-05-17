import { useState } from "react";

export default function ScheduleTemplateModal({ templates = [], onClose, onLoad, busy }) {
  const [selectedId, setSelectedId] = useState(templates.find((t) => t.is_default)?.id || templates[0]?.id || "");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const selected = templates.find((t) => t.id === selectedId);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-3xl rounded-card border border-hairline bg-surface p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-primary">Load schedule template</h2>
            <p className="mt-1 text-sm text-muted">Choose a template and project start date. Task offsets become real schedule dates.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-page">Close</button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => setSelectedId(template.id)}
              className={`rounded-lg border p-3 text-left ${selectedId === template.id ? "border-primary bg-primary/5" : "border-hairline bg-page"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-ink">{template.name}</h3>
                {template.is_default ? <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-bold text-accent">Default</span> : null}
              </div>
              <p className="mt-1 text-xs text-muted">{template.description || "Reusable schedule template"}</p>
              <p className="mt-2 text-xs font-semibold text-primary">{Array.isArray(template.tasks) ? template.tasks.length : 0} tasks</p>
            </button>
          ))}
        </div>

        <label className="mt-5 block text-xs font-semibold text-muted">
          Project start date
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 w-full max-w-xs rounded-lg border border-hairline px-2 py-2 text-sm" />
        </label>

        {selected ? (
          <div className="mt-4 max-h-40 overflow-y-auto rounded-lg border border-hairline bg-page p-3 text-xs text-muted">
            {(selected.tasks || []).slice(0, 12).map((task) => (
              <p key={task.temp_id || task.id || task.name} className="border-b border-hairline py-1 last:border-b-0">
                <span className="font-semibold text-ink">{task.name}</span> · day {task.offset_from_project_start} · {task.duration_days}d
              </p>
            ))}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-semibold text-muted">Cancel</button>
          <button type="button" disabled={busy || !selectedId || !startDate} onClick={() => onLoad(selectedId, startDate)} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Loading..." : "Load template"}
          </button>
        </div>
      </div>
    </div>
  );
}
