import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { phaseColor, phaseLabel } from "../../lib/scheduleUtils.js";

const NODE_W = 180;
const NODE_H = 60;
const COL_GAP = 220;
const ROW_GAP = 80;

function buildLayout(tasks) {
  // Build adjacency (taskId → [successor taskIds]) from task_dependencies + depends_on
  const allIds = new Set(tasks.map((t) => t.id));
  const preds = {}; // taskId → Set of predecessor ids
  for (const t of tasks) {
    preds[t.id] = new Set();
  }
  for (const t of tasks) {
    const deps = [
      ...(t.task_dependencies || []).map((d) => d.taskId),
      ...(t.depends_on || []),
    ];
    for (const predId of deps) {
      if (allIds.has(predId)) preds[t.id].add(predId);
    }
  }

  // Topological column assignment (longest path from roots)
  const col = {};
  const visited = new Set();

  function assignCol(id, depth) {
    if (col[id] === undefined || col[id] < depth) col[id] = depth;
    if (visited.has(id)) return;
    visited.add(id);
    for (const t of tasks) {
      if (preds[t.id]?.has(id)) assignCol(t.id, col[id] + 1);
    }
  }

  for (const t of tasks) {
    if (preds[t.id].size === 0) assignCol(t.id, 0);
  }
  // Assign remaining (disconnected tasks)
  for (const t of tasks) {
    if (col[t.id] === undefined) col[t.id] = 0;
  }

  // Row assignment within each column
  const colRows = {};
  const sorted = [...tasks].sort((a, b) => (col[a.id] || 0) - (col[b.id] || 0) || (a.start_date || "").localeCompare(b.start_date || ""));
  for (const t of sorted) {
    const c = col[t.id] || 0;
    if (!colRows[c]) colRows[c] = 0;
    t._row = colRows[c]++;
    t._col = c;
  }

  return { col, tasks: sorted };
}

function TaskNode({ data }) {
  const pct = Number(data.percent_complete) || 0;
  const color = phaseColor(data.phase);
  const isComplete = pct >= 100;
  const isOverdue = !isComplete && data.end_date && data.end_date < new Date().toISOString().slice(0, 10);

  const borderColor = isComplete ? "#86efac" : isOverdue ? "#ef4444" : color;

  return (
    <div
      onClick={() => data.onOpen(data.id)}
      style={{ borderColor, cursor: "pointer", width: NODE_W, minHeight: NODE_H }}
      className="rounded-lg border-2 bg-surface px-2 py-1.5 shadow-sm"
    >
      <p className="truncate text-xs font-semibold text-ink leading-tight">{data.label}</p>
      <p className="mt-0.5 truncate text-[10px] text-muted">{phaseLabel(data.phase, data.phaseLabels)}</p>
      <div className="mt-1.5 h-1 overflow-hidden rounded bg-hairline">
        <div className="h-full rounded" style={{ width: `${pct}%`, backgroundColor: isComplete ? "#86efac" : isOverdue ? "#ef4444" : color }} />
      </div>
      <p className="mt-0.5 text-[10px] text-muted">{pct}%{data.start_date ? ` · ${data.start_date}` : ""}</p>
    </div>
  );
}

const nodeTypes = { task: TaskNode };

export default function DependencyMap({ tasks = [], phaseLabels = {}, onOpenTask }) {
  const { tasks: laid } = useMemo(() => buildLayout([...tasks]), [tasks]);

  const initialNodes = useMemo(
    () =>
      laid.map((t) => ({
        id: t.id,
        type: "task",
        position: { x: (t._col || 0) * COL_GAP, y: (t._row || 0) * ROW_GAP },
        data: {
          id: t.id,
          label: t.name,
          phase: t.phase,
          phaseLabels,
          percent_complete: t.percent_complete,
          start_date: t.start_date,
          end_date: t.end_date,
          onOpen: onOpenTask,
        },
      })),
    [laid, phaseLabels, onOpenTask]
  );

  const initialEdges = useMemo(() => {
    const edges = [];
    const allIds = new Set(tasks.map((t) => t.id));
    for (const t of tasks) {
      for (const dep of t.task_dependencies || []) {
        if (allIds.has(dep.taskId)) {
          edges.push({
            id: `e-${dep.taskId}-${t.id}-${dep.type}`,
            source: dep.taskId,
            target: t.id,
            label: dep.type !== "FS" || dep.lag ? `${dep.type}${dep.lag ? `+${dep.lag}d` : ""}` : undefined,
            markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
            style: { stroke: "#94a3b8", strokeWidth: 1.5 },
            labelStyle: { fontSize: 10, fill: "#64748b" },
            labelBgStyle: { fill: "#f8f9fa", fillOpacity: 0.9 },
          });
        }
      }
      for (const predId of t.depends_on || []) {
        if (allIds.has(predId) && !(t.task_dependencies || []).some((d) => d.taskId === predId)) {
          edges.push({
            id: `e-${predId}-${t.id}`,
            source: predId,
            target: t.id,
            markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
            style: { stroke: "#cbd5e1", strokeWidth: 1.5, strokeDasharray: "4 3" },
          });
        }
      }
    }
    return edges;
  }, [tasks]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const onNodeClick = useCallback((_, node) => onOpenTask?.(node.id), [onOpenTask]);

  if (!tasks.length) {
    return (
      <div className="rounded-card border border-dashed border-hairline bg-page p-8 text-center">
        <p className="text-sm text-muted">No tasks to map.</p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-hairline bg-surface" style={{ height: 560 }}>
      <div className="flex items-center gap-3 border-b border-hairline px-3 py-2 text-xs text-muted">
        <span className="font-semibold text-ink">Dependency Map</span>
        <span>Solid arrows = typed dependencies · Dashed = legacy depends_on</span>
        <span className="ml-auto">Click a node to open the task</span>
      </div>
      <div style={{ height: 510 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.2}
          maxZoom={2}
        >
          <Background gap={20} color="#e5e7eb" />
          <Controls />
          <MiniMap nodeColor={(n) => phaseColor(n.data?.phase)} nodeStrokeWidth={2} />
        </ReactFlow>
      </div>
    </div>
  );
}
