// client-side analyze flow for the graph.
// runs the same front-end passes as assemble so the cfg shows resolved
// instructions, then calls the analyze api.

import { preprocessForBackend } from "@/lib/assemble-client";
import { localRenameMap } from "@/lib/func-preprocessor";

export interface CfgLine {
  addr: number;
  text: string;
  kind: string;
  targetAddr?: number;
  targetLabel?: string;
  srcLine?: number;
}

export interface CfgBlock {
  id: string;
  start: number;
  end: number;
  header: string;
  blockType: string;
  condReturn?: boolean;
  condCtr?: boolean;
  lines: CfgLine[];
  label: string;
}

export interface CfgEdge {
  id: string;
  from: string;
  to: string;
  type: string;
  callTargetLabel?: string;
  callTargetAddr?: number;
  callSiteAddr?: number;
}

export interface CfgCallNode {
  id: string;
  label: string;
  addr: number | null;
}

export interface CfgGraphData {
  blocks: CfgBlock[];
  edges: CfgEdge[];
  callNodes: CfgCallNode[];
}

export type AnalyzeResult = { ok: true; graph: CfgGraphData } | { ok: false; error: string };

// swap __locN__ back to the source name across every string the graph shows
function restoreLocalNames(graph: CfgGraphData, map: Map<string, string>): void {
  const fix = (s: string | undefined) => (s ? s.replace(/__loc\d+__/g, (m) => map.get(m) || m) : s);
  for (const b of graph.blocks || []) {
    b.header = fix(b.header) ?? b.header;
    b.label = fix(b.label) ?? b.label;
    for (const ln of b.lines || []) {
      ln.text = fix(ln.text) ?? ln.text;
      if (ln.targetLabel) ln.targetLabel = fix(ln.targetLabel);
    }
  }
  for (const c of graph.callNodes || []) c.label = fix(c.label) ?? c.label;
}

export async function analyzeAsm(asmText: string): Promise<AnalyzeResult> {
  const pre = preprocessForBackend(asmText);
  if (!pre.ok) {
    return { ok: false, error: pre.error.line ? `Line ${pre.error.line}: ${pre.error.message}` : pre.error.message };
  }
  try {
    const r = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ asm: pre.asm }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) {
      return { ok: false, error: (j?.error && j.error.message) || "Analyze failed" };
    }
    // preprocessor renamed .loop -> __locN__, restore the source names for display
    const localMap = localRenameMap(asmText);
    if (localMap.size) restoreLocalNames(j.graph, localMap);
    return { ok: true, graph: j.graph };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Request failed" };
  }
}
