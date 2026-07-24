"use client";

// control flow graph via React Flow, so nodes are real React components
// (full CSS, editor palette, syntax-colored listings). ELK does the layout.

import { useCallback, useEffect, useRef, useState } from "react";
import { ReactFlow, Background, Controls, MiniMap, MarkerType, Handle, Position, BaseEdge, getSmoothStepPath, useNodesState, useEdgesState } from "@xyflow/react";
import type { Node, Edge, EdgeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ELK from "elkjs/lib/elk.bundled.js";
import { analyzeAsm } from "@/lib/analyze-client";
import type { CfgGraphData, CfgBlock, CfgLine } from "@/lib/analyze-client";
import { tokenizeAsmLine } from "@/lib/asm-highlight";
import { RefreshCw, Loader2 } from "lucide-react";
import Tooltip from "@/components/Tooltip";

const elk = new ELK();

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

// per block-type accent, matches the editor's block colors
const BLOCK: Record<string, { c: string; tag: string }> = {
  entry: { c: "#38bdf8", tag: "entry" },
  cond: { c: "#fbbf24", tag: "cond" },
  jump: { c: "#a78bfa", tag: "jump" },
  exit: { c: "#f87171", tag: "ret" },
  normal: { c: "#3b7dd8", tag: "" },
};

function InstLine({ line }: { line: CfgLine }) {
  // same tokenizer + palette as the editor, identical colors
  const spans = tokenizeAsmLine(line.text || "");
  return (
    <div className="whitespace-pre">
      {spans.map((s, i) => (
        <span key={i} style={{ color: s.color }}>
          {s.text}
        </span>
      ))}
    </div>
  );
}

function BlockNode({ data }: { data: { block: CfgBlock; index?: number; hasIn?: boolean; hasOut?: boolean } }) {
  const b = data.block;
  const s = BLOCK[b.blockType] || BLOCK.normal;
  const shown = b.lines.slice(0, 18);
  const delay = Math.min((data.index || 0) * 45, 350);
  // fade+rise in on build, and a gentle breathing glow if this is the entry
  const animation =
    b.blockType === "entry"
      ? `cfg-node-in 320ms ease-out ${delay}ms both, cfg-entry-pulse 2.6s ease-in-out ${delay + 320}ms infinite`
      : `cfg-node-in 320ms ease-out ${delay}ms both`;
  const cardStyle: React.CSSProperties = {
    borderColor: s.c,
    boxShadow: `0 0 0 1px ${s.c}22, 0 6px 18px rgba(0,0,0,0.45)`,
    animation,
  };
  // expose the block color so hover/selected glows can use it
  (cardStyle as Record<string, string>)["--glow"] = s.c;
  return (
    // handles on the stable wrapper, only the card animates, so react flow
    // measures handle positions against an untransformed element
    <div className="relative h-full w-full">
      {data.hasIn !== false && <Handle type="target" position={Position.Top} style={{ background: s.c, width: 7, height: 7, border: "none" }} />}
      <div className="cfg-block flex h-full w-full flex-col overflow-hidden rounded-md border bg-[#0b1220]" style={cardStyle}>
        <div className="flex items-center gap-1.5 border-b px-2 py-1" style={{ borderColor: `${s.c}44` }}>
          <span className="font-mono text-[11px] font-bold" style={{ color: s.c }}>
            {b.header}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {b.condReturn && (
              <span className="rounded px-1 text-[8.5px] font-bold uppercase tracking-wide" style={{ background: "#f8717122", color: "#f87171" }}>
                ↩ ret
              </span>
            )}
            {b.condCtr && (
              <span className="rounded px-1 text-[8.5px] font-bold uppercase tracking-wide" style={{ background: "#a78bfa22", color: "#a78bfa" }}>
                ↪ ctr
              </span>
            )}
            {s.tag && (
              <span className="rounded px-1 text-[8.5px] font-bold uppercase tracking-wide" style={{ background: `${s.c}22`, color: s.c }}>
                {s.tag}
              </span>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-hidden px-2 py-1 font-mono text-[10.5px] leading-[1.55]">
          {shown.map((l, i) => (
            <InstLine key={i} line={l} />
          ))}
          {b.lines.length > 18 && <div className="text-text-muted">… +{b.lines.length - 18} more</div>}
        </div>
      </div>
      {data.hasOut !== false && <Handle type="source" position={Position.Bottom} style={{ background: s.c, width: 7, height: 7, border: "none" }} />}
    </div>
  );
}

function CallNode({ data }: { data: { label: string } }) {
  const cardStyle: React.CSSProperties = {
    borderColor: "#5a6a7a",
    background: "#0a0e18",
    color: "#8a9aaa",
    animation: "cfg-node-in 320ms ease-out both",
  };
  (cardStyle as Record<string, string>)["--glow"] = "#6a7a8a";
  return (
    <div className="relative h-full w-full">
      <Handle type="target" position={Position.Top} style={{ background: "#5a6a7a", width: 6, height: 6, border: "none" }} />
      <div className="cfg-block flex h-full w-full items-center justify-center rounded-md border border-dashed px-2 text-center font-mono text-[10px]" style={cardStyle}>
        {data.label}
      </div>
    </div>
  );
}

// edge with a dot that flows along the path in the control-flow direction
function FlowEdge({ id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, data }: EdgeProps) {
  const color = ((style as React.CSSProperties)?.stroke as string) || "#4a5a6a";
  const dur = ((data as { dur?: string } | undefined)?.dur) || "2.4s";
  // self-loop: an orthogonal loop out the bottom, round the right, into the top
  let path: string;
  if (source === target) {
    const w = ((data as { w?: number } | undefined)?.w) || 180;
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
        <animateMotion dur={dur} repeatCount="indefinite" path={path} />
        <animate attributeName="opacity" from="0" to="1" begin="0.08s" dur="0.2s" fill="freeze" />
      </circle>
    </>
  );
}

const nodeTypes = { block: BlockNode, call: CallNode };
const edgeTypes = { flow: FlowEdge };

// edge color echoes the source block's role: branch=amber, jump=purple, else grey
const EDGE: Record<string, { stroke: string; dash?: string; w: number; dur: string }> = {
  fallthrough: { stroke: "#4a5a6a", w: 1.4, dur: "2.6s" },
  branch: { stroke: "#fbbf24", w: 1.6, dur: "2.2s" },
  jump: { stroke: "#a78bfa", w: 1.8, dur: "1.7s" },
  call: { stroke: "#6a7a8a", dash: "5 4", w: 1.2, dur: "3s" },
};

const EDGE_LEGEND: [string, string, boolean][] = [
  ["fallthrough", "#4a5a6a", false],
  ["branch", "#fbbf24", false],
  ["jump", "#a78bfa", false],
  ["call", "#6a7a8a", true],
];

function sizeBlock(b: CfgBlock) {
  const headerLen = (b.header?.length || 6) + 8;
  const maxBody = b.lines.reduce((m, l) => Math.max(m, (l.text || "").length), 0);
  const cols = Math.max(headerLen, maxBody, 8);
  const w = clamp(Math.round(cols * 6.6) + 22, 190, 560);
  const shown = Math.min(b.lines.length, 18) + (b.lines.length > 18 ? 1 : 0);
  const h = 24 + shown * 17 + 8;
  return { w, h };
}

async function buildGraph(graph: CfgGraphData): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const sizes = new Map<string, { w: number; h: number }>();
  const children: { id: string; width: number; height: number }[] = [];

  for (const b of graph.blocks) {
    const s = sizeBlock(b);
    sizes.set(b.id, s);
    children.push({ id: b.id, width: s.w, height: s.h });
  }
  for (const c of graph.callNodes || []) {
    const w = clamp((c.label?.length || 4) * 6.6 + 20, 120, 260);
    sizes.set(c.id, { w, h: 40 });
    children.push({ id: c.id, width: w, height: 40 });
  }

  const ids = new Set(children.map((c) => c.id));
  const edges = (graph.edges || []).filter((e) => ids.has(e.from) && ids.has(e.to));

  // only show a handle an edge uses, no dangling dot on entry/ret
  const hasIn = new Set(edges.map((e) => e.to));
  const hasOut = new Set(edges.map((e) => e.from));

  const laid = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.spacing.nodeNode": "44",
      "elk.layered.spacing.nodeNodeBetweenLayers": "62",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    },
    children,
    edges: edges.map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })),
  });

  const pos = new Map<string, { x: number; y: number }>();
  for (const ch of laid.children || []) pos.set(ch.id, { x: ch.x || 0, y: ch.y || 0 });

  const rfNodes: Node[] = [];
  graph.blocks.forEach((b, i) => {
    const p = pos.get(b.id) || { x: 0, y: 0 };
    const s = sizes.get(b.id)!;
    rfNodes.push({ id: b.id, type: "block", position: p, data: { block: b, index: i, hasIn: hasIn.has(b.id), hasOut: hasOut.has(b.id) }, style: { width: s.w, height: s.h } });
  });
  for (const c of graph.callNodes || []) {
    if (!pos.has(c.id)) continue;
    const p = pos.get(c.id)!;
    const s = sizes.get(c.id)!;
    rfNodes.push({ id: c.id, type: "call", position: p, data: { label: c.label }, style: { width: s.w, height: s.h } });
  }

  const rfEdges: Edge[] = edges.map((e) => {
    const st = EDGE[e.type] || EDGE.fallthrough;
    return {
      id: e.id,
      source: e.from,
      target: e.to,
      type: "flow",
      data: { dur: st.dur, w: sizes.get(e.from)?.w ?? 180 },
      style: { stroke: st.stroke, strokeWidth: st.w, strokeDasharray: st.dash },
      markerEnd: { type: MarkerType.ArrowClosed, color: st.stroke, width: 14, height: 14 },
    };
  });

  return { nodes: rfNodes, edges: rfEdges };
}

export default function CfgGraph({ getAsm }: { getAsm: () => string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [err, setErr] = useState("");
  const reqId = useRef(0);

  const run = useCallback(async () => {
    const id = ++reqId.current;
    setStatus("loading");
    setErr("");
    const res = await analyzeAsm(getAsm());
    if (id !== reqId.current) return;
    if (!res.ok) {
      setErr(res.error);
      setStatus("error");
      return;
    }
    if (!res.graph.blocks || res.graph.blocks.length === 0) {
      setNodes([]);
      setEdges([]);
      setStatus("empty");
      return;
    }
    const built = await buildGraph(res.graph);
    if (id !== reqId.current) return;
    setNodes(built.nodes);
    setEdges(built.edges);
    setStatus("ready");
  }, [getAsm, setNodes, setEdges]);

  useEffect(() => {
    // defer so the analyze/layout kickoff isn't a synchronous effect setState
    const t = setTimeout(run, 0);
    return () => clearTimeout(t);
  }, [run]);

  return (
    <div className="absolute inset-0 bg-[#080b11]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
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
          nodeColor={(n) => (BLOCK[(n.data as { block?: CfgBlock })?.block?.blockType || "normal"]?.c || "#3b7dd8")}
        />
      </ReactFlow>

      <Tooltip label="re-analyze the control flow" placement="bottom">
        <button
          onClick={run}
          className="absolute right-2 top-2 z-10 flex items-center gap-1.5 rounded border border-border bg-card-bg px-2.5 py-1 text-[11px] font-semibold text-text-secondary hover:text-text-primary"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </Tooltip>

      {status === "ready" && (
        <div className="pointer-events-none absolute right-2 top-11 z-10 rounded-md border border-border bg-card-bg/85 px-2.5 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.4)] backdrop-blur-sm">
          <div className="mb-1 text-[8.5px] font-semibold uppercase tracking-[0.09em] text-text-muted">edges</div>
          {EDGE_LEGEND.map(([label, color, dashed]) => (
            <div key={label} className="flex items-center gap-2 py-[3px]">
              <svg width="22" height="4" className="shrink-0 overflow-visible">
                <line x1="1" y1="2" x2="21" y2="2" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeDasharray={dashed ? "3 3" : undefined} />
              </svg>
              <span className="text-[10px] text-text-secondary">{label}</span>
            </div>
          ))}
        </div>
      )}

      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex items-center gap-2 rounded border border-border bg-card-bg px-3 py-2 text-xs text-text-secondary">
            <Loader2 size={14} className="animate-spin text-accent" /> analyzing…
          </span>
        </div>
      )}
      {status === "empty" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-text-muted">
          nothing to graph yet, write some instructions
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-x-4 top-12 rounded border border-border bg-card-bg px-3 py-2 text-xs whitespace-pre-wrap text-error">{err}</div>
      )}
    </div>
  );
}
