"use client";

// call graph via React Flow: functions are nodes, bl calls are edges. built
// from source client-side (no analyze api), imported funcs resolved through the
// import label map so cross-file calls show tagged with their file.

import { useCallback, useEffect, useRef, useState } from "react";
import { ReactFlow, Background, Controls, MiniMap, MarkerType, Handle, Position, BaseEdge, getSmoothStepPath, useNodesState, useEdgesState } from "@xyflow/react";
import type { Node, Edge, EdgeProps, NodeMouseHandler } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ELK from "elkjs/lib/elk.bundled.js";
import { buildCallGraph } from "@/lib/call-graph";
import { resolveImports } from "@/lib/import-resolver";
import * as store from "@/lib/file-store";
import { RefreshCw } from "lucide-react";
import Tooltip from "@/components/Tooltip";

const elk = new ELK();

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

const KIND: Record<CallNodeKind, { c: string; tag: string; dashed: boolean }> = {
  entry: { c: "#38bdf8", tag: "entry", dashed: false },
  local: { c: "#3b7dd8", tag: "", dashed: false },
  imported: { c: "#a78bfa", tag: "import", dashed: true },
  external: { c: "#5a6a7a", tag: "", dashed: true },
};

function FuncNode({ data }: { data: { node: CallNode; index?: number; hasIn?: boolean; hasOut?: boolean } }) {
  const n = data.node;
  const k = KIND[n.kind];
  const delay = Math.min((data.index || 0) * 45, 350);
  const animation =
    n.kind === "entry"
      ? `cfg-node-in 320ms ease-out ${delay}ms both, cfg-entry-pulse 2.6s ease-in-out ${delay + 320}ms infinite`
      : `cfg-node-in 320ms ease-out ${delay}ms both`;
  const style: React.CSSProperties = {
    borderColor: k.c,
    borderStyle: k.dashed ? "dashed" : "solid",
    boxShadow: `0 0 0 1px ${k.c}22, 0 6px 18px rgba(0,0,0,0.45)`,
    animation,
  };
  (style as Record<string, string>)["--glow"] = k.c;
  return (
    // handles live on this stable wrapper, only the card inside animates, so
    // react flow measures handle positions against an untransformed element
    <div className="relative h-full w-full">
      {data.hasIn !== false && <Handle type="target" position={Position.Top} style={{ background: k.c, width: 7, height: 7, border: "none" }} />}
      <div className="cfg-block flex h-full w-full flex-col justify-center rounded-md border bg-[#0b1220] px-3 py-1.5" style={style}>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] font-bold" style={{ color: k.c }}>
            {n.label}
          </span>
          {k.tag && (
            <span className="ml-auto rounded px-1 text-[8.5px] font-bold uppercase tracking-wide" style={{ background: `${k.c}22`, color: k.c }}>
              {k.tag}
            </span>
          )}
        </div>
        {n.sub && <div className="mt-0.5 font-mono text-[10px] text-text-muted">{n.sub}</div>}
      </div>
      {data.hasOut !== false && <Handle type="source" position={Position.Bottom} style={{ background: k.c, width: 7, height: 7, border: "none" }} />}
    </div>
  );
}

function FlowEdge({ id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, data }: EdgeProps) {
  const color = ((style as React.CSSProperties)?.stroke as string) || "#4a7dc8";
  // recursion loops out the right side, like the flow graph
  let path: string;
  if (source === target) {
    const w = ((data as { w?: number } | undefined)?.w) || 150;
    const r = 11;
    const yBot = sourceY + 24;
    const yTop = targetY - 24;
    const lx = sourceX + w / 2 + 30;
    path = [
      `M ${sourceX},${sourceY}`,
      `L ${sourceX},${yBot - r}`,
      `Q ${sourceX},${yBot} ${sourceX + r},${yBot}`,
      `L ${lx - r},${yBot}`,
      `Q ${lx},${yBot} ${lx},${yBot - r}`,
      `L ${lx},${yTop + r}`,
      `Q ${lx},${yTop} ${lx - r},${yTop}`,
      `L ${targetX + r},${yTop}`,
      `Q ${targetX},${yTop} ${targetX},${yTop + r}`,
      `L ${targetX},${targetY}`,
    ].join(" ");
  } else {
    [path] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 10 });
  }
  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      <circle r="2.7" fill={color} opacity="0" style={{ filter: `drop-shadow(0 0 3px ${color})` }}>
        <animateMotion dur="2.6s" repeatCount="indefinite" path={path} />
        <animate attributeName="opacity" from="0" to="1" begin="0.08s" dur="0.2s" fill="freeze" />
      </circle>
    </>
  );
}

const nodeTypes = { fn: FuncNode };
const edgeTypes = { flow: FlowEdge };

function sizeNode(n: CallNode) {
  const head = n.label.length + (KIND[n.kind].tag ? 8 : 0);
  const cols = Math.max(head, n.sub ? n.sub.length : 0, 6);
  const w = clamp(Math.round(cols * 7) + 28, 130, 360);
  return { w, h: n.sub ? 46 : 34 };
}

async function layout(data: CallGraphData): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const sizes = new Map<string, { w: number; h: number }>();
  const children = data.nodes.map((n) => {
    const s = sizeNode(n);
    sizes.set(n.id, s);
    return { id: n.id, width: s.w, height: s.h };
  });

  const laid = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.spacing.nodeNode": "40",
      "elk.layered.spacing.nodeNodeBetweenLayers": "58",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    },
    children,
    edges: data.edges.map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })),
  });

  const pos = new Map<string, { x: number; y: number }>();
  for (const ch of laid.children || []) pos.set(ch.id, { x: ch.x || 0, y: ch.y || 0 });

  // only show a handle an edge uses, no dangling dot on entry/leaf funcs
  const hasIn = new Set(data.edges.map((e) => e.to));
  const hasOut = new Set(data.edges.map((e) => e.from));

  const rfNodes: Node[] = data.nodes.map((n, i) => {
    const p = pos.get(n.id) || { x: 0, y: 0 };
    const s = sizes.get(n.id)!;
    return { id: n.id, type: "fn", position: p, data: { node: n, index: i, hasIn: hasIn.has(n.id), hasOut: hasOut.has(n.id) }, style: { width: s.w, height: s.h } };
  });

  const rfEdges: Edge[] = data.edges.map((e) => ({
    id: e.id,
    source: e.from,
    target: e.to,
    type: "flow",
    data: { w: sizes.get(e.from)?.w ?? 150 },
    style: { stroke: "#4a7dc8", strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#4a7dc8", width: 14, height: 14 },
  }));

  return { nodes: rfNodes, edges: rfEdges };
}

export default function CallGraph({ getAsm, onJump }: { getAsm: () => string; onJump?: (line: number) => void }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "empty">("loading");
  const reqId = useRef(0);

  const run = useCallback(async () => {
    const id = ++reqId.current;
    setStatus("loading");
    const text = getAsm();
    const imp = resolveImports(text, (n) => store.getFile(n)?.asm ?? null);
    const importedFrom = new Map<string, string>();
    for (const [name, info] of imp.labels) importedFrom.set(name, info.from);

    const data = buildCallGraph(text, importedFrom);
    if (id !== reqId.current) return;
    if (!data.nodes.length) {
      setNodes([]);
      setEdges([]);
      setStatus("empty");
      return;
    }
    const built = await layout(data);
    if (id !== reqId.current) return;
    setNodes(built.nodes);
    setEdges(built.edges);
    setStatus("ready");
  }, [getAsm, setNodes, setEdges]);

  useEffect(() => {
    const t = setTimeout(run, 0);
    return () => clearTimeout(t);
  }, [run]);

  const onNodeClick = useCallback<NodeMouseHandler>(
    (_e, node) => {
      const n = (node.data as { node?: CallNode })?.node;
      if (n && n.line && onJump) onJump(n.line);
    },
    [onJump]
  );

  return (
    <div className="absolute inset-0 bg-[#080b11]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2.5}
        nodesConnectable={false}
        nodesDraggable
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1a2332" gap={22} size={1} />
        <Controls showInteractive={false} className="!border-border !bg-card-bg" />
        <MiniMap
          pannable
          zoomable
          maskColor="rgba(8,11,17,0.6)"
          style={{ background: "#0b1220", border: "1px solid #273240" }}
          nodeColor={(n) => KIND[(n.data as { node?: CallNode })?.node?.kind || "local"]?.c || "#3b7dd8"}
        />
      </ReactFlow>

      <Tooltip label="rebuild the call graph" placement="bottom">
        <button
          onClick={run}
          className="absolute right-2 top-2 z-10 flex items-center gap-1.5 rounded border border-border bg-card-bg px-2.5 py-1 text-[11px] font-semibold text-text-secondary hover:text-text-primary"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </Tooltip>

      {status === "empty" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-text-muted">
          no functions to graph. define a func to see its calls
        </div>
      )}
    </div>
  );
}
