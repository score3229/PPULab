"use client";

// the PS3 PPU workstation: editor, assemble, output, save/load, structs,
// cross-file imports, disassembler and a control-flow graph.
// split view supports one or two editor groups side by side.

import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from "react";
import OutputPane from "@/components/OutputPane";
import SaveModal from "@/components/SaveModal";
import DeleteModal from "@/components/DeleteModal";
import StructBuilder from "@/components/StructBuilder";
import ImportModal from "@/components/ImportModal";
import EditorGroup from "@/components/EditorGroup";
import Tooltip from "@/components/Tooltip";
import type { GroupModel, GroupHandle, AssembleOutput } from "@/components/EditorGroup";
import { TabModel, SCRATCH_ID, tabLabel, isBuffer, discardTabDraft } from "@/lib/tabs";
import type { OutputFormat } from "@/lib/output-formats";
import { disassembleHex, parseBase } from "@/lib/disassemble-client";
import { tokenizeAsmLine } from "@/lib/asm-highlight";
import { parseStructs } from "@/lib/struct-preprocessor";
import { parseFuncs, parseGlobals } from "@/lib/func-preprocessor";
import { parseImports } from "@/lib/import-resolver";
import { exportLibrary, exportFile, readImportFile, planImport, applyImport } from "@/lib/library-io";
import * as store from "@/lib/file-store";
import type { FileEntry, FolderState } from "@/lib/file-store";
import { buildFileTree, allFolderPaths } from "@/lib/file-tree";
import type { TreeFolder } from "@/lib/file-tree";
import {
  Cpu,
  Play,
  BookOpen,
  Boxes,
  Folder,
  FolderPlus,
  ChevronRight,
  Pencil,
  FileCode2,
  Plus,
  Save,
  Trash2,
  PanelRight,
  X,
  ArrowLeftRight,
  CornerDownLeft,
  Hash,
  Download,
  Upload,
} from "lucide-react";

// resize divider

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function VDivider({ onDrag }: { onDrag: (dx: number) => void }) {
  const last = useRef(0);
  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    last.current = e.clientX;
    const move = (ev: PointerEvent) => {
      onDrag(ev.clientX - last.current);
      last.current = ev.clientX;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };
  return (
    <div onPointerDown={down} className="group relative z-20 w-[7px] shrink-0 cursor-col-resize self-stretch">
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-all group-hover:w-[2px] group-hover:bg-accent" />
    </div>
  );
}

// files-rail tree (folders + files). drag a file onto a folder to move it,
// right-click for a menu. everything is keyed by the plain file name.
interface RailCtx {
  currentFile: string;
  collapsed: Set<string>;
  dropTarget: string | null;
  openFile: (name: string) => void;
  toggleFolder: (path: string) => void;
  onFileDragStart: (name: string) => void;
  onFileDragEnd: () => void;
  onFolderDragOver: (e: React.DragEvent, path: string) => void;
  onFolderDrop: (e: React.DragEvent, path: string) => void;
  onFileMenu: (e: React.MouseEvent, name: string) => void;
  onFolderMenu: (e: React.MouseEvent, path: string) => void;
}

function FileRow({ name, depth, ctx }: { name: string; depth: number; ctx: RailCtx }) {
  const active = name === ctx.currentFile;
  return (
    <button
      draggable
      onDragStart={() => ctx.onFileDragStart(name)}
      onDragEnd={ctx.onFileDragEnd}
      onClick={() => ctx.openFile(name)}
      onContextMenu={(e) => ctx.onFileMenu(e, name)}
      style={{ paddingLeft: 8 + depth * 14 }}
      className={`flex w-full items-center gap-2 rounded py-1.5 pr-2 text-left transition-colors ${
        active ? "bg-accent/15 text-text-primary shadow-[inset_2px_0_0] shadow-accent" : "text-text-secondary hover:bg-white/[0.03]"
      }`}
    >
      <FileCode2 size={14} className="shrink-0 text-text-muted" />
      <span className="flex min-w-0 items-center font-mono text-[12.5px]">
        <span className="truncate">{name}</span>
        <span className="shrink-0 opacity-50">.s</span>
      </span>
    </button>
  );
}

function FolderNode({ node, depth, ctx }: { node: TreeFolder; depth: number; ctx: RailCtx }) {
  const collapsed = ctx.collapsed.has(node.path);
  const isDrop = ctx.dropTarget === node.path;
  return (
    <div>
      <button
        onClick={() => ctx.toggleFolder(node.path)}
        onContextMenu={(e) => ctx.onFolderMenu(e, node.path)}
        onDragOver={(e) => ctx.onFolderDragOver(e, node.path)}
        onDrop={(e) => ctx.onFolderDrop(e, node.path)}
        style={{ paddingLeft: 8 + depth * 14 }}
        className={`flex w-full items-center gap-1.5 rounded py-1.5 pr-2 text-left transition-colors ${
          isDrop ? "bg-accent/20 ring-1 ring-inset ring-accent/50 text-text-primary" : "text-text-secondary hover:bg-white/[0.03]"
        }`}
      >
        <ChevronRight size={13} className={`shrink-0 text-text-muted transition-transform ${collapsed ? "" : "rotate-90"}`} />
        <Folder size={13} className="shrink-0 text-[#e3b341]" />
        <span className="truncate text-[12.5px] font-medium">{node.name}</span>
        <span className="ml-auto shrink-0 pl-1 text-[10px] text-text-muted/60">{node.files.length + node.folders.length}</span>
      </button>
      {!collapsed && (
        <div>
          {node.folders.map((f) => (
            <FolderNode key={f.path} node={f} depth={depth + 1} ctx={ctx} />
          ))}
          {node.files.map((n) => (
            <FileRow key={n} name={n} depth={depth + 1} ctx={ctx} />
          ))}
        </div>
      )}
    </div>
  );
}

// thin loading bar at the top of the window while an assemble is in flight.
// overlaid (fixed) so it never shifts layout, driven purely by the `active`
// prop via CSS: it eases a fill while active, then snaps to full and fades when
// it clears, so even an instant assemble reads as a quick fill-and-complete.
function TopProgress({ active }: { active: boolean }) {
  return (
    <div aria-hidden className={`tp-track ${active ? "on" : ""}`}>
      <div className="tp-bar" />
    </div>
  );
}

// group model helpers

// rough live instruction count: skip blanks, comments, labels, directives,
// and struct blocks/fields. exact word count comes from the assemble note.
function countInstructions(text: string): number {
  let n = 0;
  let inStruct = false;
  for (const raw of String(text || "").split("\n")) {
    const cut = [raw.indexOf("//"), raw.indexOf("#"), raw.indexOf(";")].filter((i) => i >= 0);
    const code = (cut.length ? raw.slice(0, Math.min(...cut)) : raw).trim();
    if (!code) continue;
    if (inStruct) {
      if (code.includes("}")) inStruct = false;
      continue;
    }
    if (/^struct\b/i.test(code)) {
      if (!code.includes("}")) inStruct = true;
      continue;
    }
    if (/^(address|hook|set|unset|clearset|import)\b/i.test(code)) continue;
    if (/^[A-Za-z_.$][\w.$]*\s*[:@]/.test(code)) continue; // label or struct field
    if (/^[{}]/.test(code)) continue;
    n++;
  }
  return n;
}

// a fresh scratch group, used when everything else has closed
function scratchGroup(id: string, reloadKey: number): GroupModel {
  return { id, tabs: [{ id: SCRATCH_ID, file: null }], active: SCRATCH_ID, reloadKey };
}

// struct panel address/offset display, matched to the editor + output style:
// addresses padded to 8 hex digits uppercase, offsets uppercase (kept short)
function fmtAddr(s: string): string {
  const n = parseInt(s, 16);
  if (!Number.isFinite(n)) return s;
  return "0x" + (n >>> 0).toString(16).toUpperCase().padStart(8, "0");
}
function fmtOff(s: string): string {
  return "0x" + s.replace(/^0x/i, "").toUpperCase();
}

// drop empty groups and repair any invalid active tab / active group. with
// nothing open anywhere, collapse to a single empty group (the splash)
function normalize(groups: GroupModel[], activeId: string): { groups: GroupModel[]; activeId: string } {
  let gs = groups.filter((g) => g.tabs.length > 0);
  if (gs.length === 0) {
    const base = groups[0];
    gs = [{ id: base ? base.id : "g0", tabs: [], active: "", reloadKey: base ? base.reloadKey : 0 }];
    return { groups: gs, activeId: gs[0].id };
  }
  gs = gs.map((g) => (g.tabs.some((t) => t.id === g.active) ? g : { ...g, active: g.tabs[g.tabs.length - 1].id }));
  let aid = activeId;
  if (!gs.some((g) => g.id === aid)) aid = gs[0].id;
  return { groups: gs, activeId: aid };
}

interface RestoreResult {
  groups: GroupModel[];
  activeId: string;
  splitRatio: number;
  maxTabId: number; // highest tN id in use, so the id counter reseeds past it
  maxBufSeq: number; // highest untitled-N display index in use
}

// a tab as it comes out of a stored layout, before ids are finalized. `keepId`
// is a reused id (buffers must keep theirs to find their draft), null means
// "assign a fresh id". `wanted` is the original active token for remapping.
interface RawTab {
  file: string | null;
  keepId: string | null;
  n?: number;
  wanted: string; // the id/name this tab is stored under, to match stored active
}

// rebuild the open-tab layout from the store. drops tabs whose file is gone
// or buffers with no content, dedupes, caps at two groups, migrates the
// string-only layout. falls back to the single last-open file.
function restoreGroups(): RestoreResult | null {
  const layout = store.getLayout();
  let maxTabId = 0;
  let maxBufSeq = 0;
  const bumpId = (id: string) => {
    const m = /^t(\d+)$/.exec(id);
    if (m) maxTabId = Math.max(maxTabId, Number(m[1]));
  };

  // normalize one stored tab (object or bare string) into a RawTab, or null
  const readTab = (rt: unknown): RawTab | null => {
    if (typeof rt === "string") {
      if (rt === "") return { file: null, keepId: SCRATCH_ID, wanted: "" };
      if (store.getFile(rt)) return { file: rt, keepId: null, wanted: rt };
      return null; // untitled:N buffers and stale names are dropped
    }
    if (rt && typeof rt === "object") {
      const o = rt as { id?: unknown; file?: unknown; n?: unknown };
      const file = typeof o.file === "string" ? o.file : null;
      const id = typeof o.id === "string" ? o.id : "";
      if (file != null) {
        if (!store.getFile(file)) return null;
        if (id) bumpId(id);
        return { file, keepId: id || null, wanted: id || file };
      }
      if (id === SCRATCH_ID) return { file: null, keepId: SCRATCH_ID, wanted: SCRATCH_ID };
      // a throwaway buffer survives only if it still has stored content
      if (id && store.getBuffer(id) != null) {
        bumpId(id);
        const n = typeof o.n === "number" ? o.n : undefined;
        if (n) maxBufSeq = Math.max(maxBufSeq, n);
        return { file: null, keepId: id, n, wanted: id };
      }
    }
    return null;
  };

  if (layout && Array.isArray(layout.groups) && layout.groups.length) {
    // dedupe files, scratch, and reused ids across every group so a corrupted
    // layout can never bring back two tabs that share an id
    const seenFile = new Set<string>();
    const seenId = new Set<string>();
    let sawScratch = false;
    const built = layout.groups
      .slice(0, 2)
      .map((g) => {
        const rawList = Array.isArray((g as { tabs?: unknown }).tabs) ? ((g as { tabs: unknown[] }).tabs) : [];
        const raws: RawTab[] = [];
        for (const rt of rawList) {
          const r = readTab(rt);
          if (!r) continue;
          if (r.keepId && seenId.has(r.keepId)) continue;
          if (r.file != null) {
            if (seenFile.has(r.file)) continue;
            seenFile.add(r.file);
          } else if (r.keepId === SCRATCH_ID) {
            if (sawScratch) continue;
            sawScratch = true;
          }
          if (r.keepId) seenId.add(r.keepId);
          raws.push(r);
        }
        return { raws, wantedActive: typeof (g as { active?: unknown }).active === "string" ? (g as { active: string }).active : "" };
      })
      .filter((g) => g.raws.length > 0);

    if (built.length) {
      // seed after readTab has bumped maxTabId past every reused id, so freshly
      // assigned ids and later nextTabId() calls can never collide with them
      let seed = maxTabId;
      const groups: GroupModel[] = built.map((g, i) => {
        const tabs: TabModel[] = g.raws.map((r) => {
          const id = r.keepId ?? `t${(seed += 1)}`;
          return r.n ? { id, file: r.file, n: r.n } : { id, file: r.file };
        });
        // remap the stored active token onto the finalized ids
        let active = "";
        const wantedIdx = g.raws.findIndex((r) => r.wanted === g.wantedActive);
        if (wantedIdx >= 0) active = tabs[wantedIdx].id;
        else active = tabs[tabs.length - 1].id;
        return { id: `g${i}`, tabs, active, reloadKey: 0 };
      });
      maxTabId = seed;
      let idx = typeof layout.activeGroupIndex === "number" ? layout.activeGroupIndex : 0;
      if (idx < 0 || idx >= groups.length) idx = 0;
      const r = layout.splitRatio;
      const splitRatio = typeof r === "number" && r >= 0.2 && r <= 0.8 ? r : 0.5;
      return { groups, activeId: groups[idx].id, splitRatio, maxTabId, maxBufSeq };
    }
  }

  const last = store.getLastOpen();
  if (last && store.getFile(last)) {
    const tab: TabModel = { id: "t1", file: last };
    return { groups: [{ id: "g0", tabs: [tab], active: "t1", reloadKey: 0 }], activeId: "g0", splitRatio: 0.5, maxTabId: 1, maxBufSeq: 0 };
  }
  return null;
}

// disassembler tool overlay

function DisasmOverlay({ onClose, onPromote }: { onClose: () => void; onPromote: (text: string) => void }) {
  const [hex, setHex] = useState("");
  const [base, setBase] = useState("");
  const [out, setOut] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setErr("");
    setOut("");
    const res = await disassembleHex(hex, parseBase(base));
    if (res.ok) setOut(res.out);
    else setErr(res.error);
    setBusy(false);
  };

  const label = "flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.09em] text-text-muted";

  // color the disassembly like the editor / graph. very large dumps skip the
  // per-token spans and render plain so the modal stays responsive.
  const outLines = useMemo(() => (out ? out.split("\n") : []), [out]);
  const colorize = outLines.length > 0 && outLines.length <= 4000;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex h-[min(760px,90vh)] w-[min(1100px,96vw)] flex-col overflow-hidden rounded-lg border border-border-hover bg-card-bg shadow-2xl">
        <div className="flex h-[42px] shrink-0 items-center justify-between border-b border-border bg-surface px-3">
          <span className="flex items-center gap-2 text-xs font-semibold text-text-primary">
            <ArrowLeftRight size={14} className="text-accent" /> Disassembler
          </span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
              <Hash size={11} /> Base
              <input
                value={base}
                onChange={(e) => setBase(e.target.value)}
                placeholder="0x0"
                spellCheck={false}
                className="w-28 rounded border border-border bg-input-bg px-2 py-1 font-mono text-[11px] text-[#56d4dd] outline-none focus:border-border-hover"
              />
            </label>
            <button
              onClick={run}
              disabled={busy}
              className="flex items-center gap-1.5 rounded bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
            >
              <ArrowLeftRight size={13} /> Disassemble
            </button>
            <button onClick={onClose} className="rounded p-1 text-text-muted hover:text-text-primary">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-2.5 p-2.5">
          <div className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card-bg">
            <div className={`h-[34px] border-b border-border bg-surface px-2.5 ${label}`}>
              <span className="h-3 w-[3px] rounded-sm bg-[#56d4dd]" /> Input · Hex
            </div>
            <textarea
              value={hex}
              onChange={(e) => setHex(e.target.value)}
              spellCheck={false}
              placeholder="paste be32 hex almost any way, words or bytes, 0x / \x / $, objdump, hexdump, memory dumps with addresses ..."
              className="flex-1 resize-none bg-input-bg p-2.5 font-mono text-[12.5px] leading-[1.6] text-text-secondary outline-none"
            />
          </div>
          <div className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card-bg">
            <div className="flex h-[34px] items-center justify-between border-b border-border bg-surface px-2.5">
              <span className={label}>
                <span className="h-3 w-[3px] rounded-sm bg-[#79c0ff]" /> Output · PowerPC ASM
              </span>
              <button
                onClick={() => out && onPromote(out)}
                disabled={!out}
                className="flex items-center gap-1.5 rounded border border-border bg-btn-secondary px-2.5 py-1 text-[11px] font-semibold text-text-secondary hover:text-text-primary disabled:opacity-40"
              >
                <CornerDownLeft size={12} /> Promote to file
              </button>
            </div>
            <pre className="flex-1 overflow-auto whitespace-pre bg-input-bg p-2.5 font-mono text-[12.5px] leading-[1.55] text-text-primary">
              {err ? (
                <span className="text-error">{err}</span>
              ) : colorize ? (
                outLines.map((line, i) => (
                  <Fragment key={i}>
                    {tokenizeAsmLine(line).map((s, j) => (
                      <span key={j} style={{ color: s.color }}>{s.text}</span>
                    ))}
                    {"\n"}
                  </Fragment>
                ))
              ) : (
                out
              )}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

// page

export default function Workstation() {
  const [groups, setGroups] = useState<GroupModel[]>([scratchGroup("g0", 0)]);
  const [activeGroupId, setActiveGroupId] = useState("g0");
  const [splitRatio, setSplitRatio] = useState(0.5);

  const [rawOutput, setRawOutput] = useState("");
  const [asmSource, setAsmSource] = useState("");
  const [note, setNote] = useState("");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("hex_lines");
  const [assembling, setAssembling] = useState(false);

  const [fileNames, setFileNames] = useState<string[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [disasmOpen, setDisasmOpen] = useState(false);
  const [structBuilderOpen, setStructBuilderOpen] = useState(false);
  const [importPlan, setImportPlan] = useState<{ files: Record<string, FileEntry>; fresh: string[]; existing: string[]; folders?: Record<string, string> } | null>(null);
  const [importDrag, setImportDrag] = useState(false);
  const [flash, setFlash] = useState("");

  // files rail folders
  const [folderState, setFolderState] = useState<FolderState>({ assign: {}, dirs: [], collapsed: [] });
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [railMenu, setRailMenu] = useState<
    | { kind: "file"; name: string; x: number; y: number }
    | { kind: "folder"; path: string; x: number; y: number }
    | null
  >(null);
  const [folderPrompt, setFolderPrompt] = useState<{ title: string; initial: string; confirm: string; submit: (v: string) => void } | null>(null);

  const [outputOpen, setOutputOpen] = useState(true);
  const [structsOpen, setStructsOpen] = useState(true);
  const [filesW, setFilesW] = useState(224);
  const [structsW, setStructsW] = useState(288);
  const [outputW, setOutputW] = useState(360);

  const [dragging, setDragging] = useState(false);
  const [activeText, setActiveText] = useState("");
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  // gates layout persistence until the session has been restored on mount
  const [sessionReady, setSessionReady] = useState(false);

  // refs so callbacks always read the latest without re-binding
  const groupsRef = useRef(groups);
  const activeGroupIdRef = useRef(activeGroupId);
  const handles = useRef<Map<string, GroupHandle>>(new Map());
  const drag = useRef<{ fromGroup: string; tabId: string } | null>(null);
  const idc = useRef(0);
  const tabIdc = useRef(0); // mints unique tab ids (tN)
  const bufSeq = useRef(0); // display index for untitled buffers (untitled-N)
  const rowRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragFile = useRef<string | null>(null); // file name being dragged in the rail
  const dropDepth = useRef(0); // dragenter/leave depth for the os-file drop overlay
  const folderInputRef = useRef<HTMLInputElement>(null);

  // mint a tab id that is not already live in any group, whatever the counter
  const nextTabId = useCallback(() => {
    let id: string;
    do {
      id = `t${(tabIdc.current += 1)}`;
    } while (groupsRef.current.some((g) => g.tabs.some((t) => t.id === id)));
    return id;
  }, []);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);
  useEffect(() => {
    activeGroupIdRef.current = activeGroupId;
    // when focus moves to another group, refresh the structs panel from it
    const h = handles.current.get(activeGroupId);
    if (h) setActiveText(h.getText());
  }, [activeGroupId]);

  const nextId = useCallback(() => `g${++idc.current + 100}`, []);

  const refreshNames = useCallback(() => {
    setFileNames(store.listNames());
    setFolderState(store.loadFolderState());
  }, []);

  // rail tree derived from the file list + folder assignments
  const folderTree = useMemo(() => buildFileTree(fileNames, folderState), [fileNames, folderState]);
  const collapsedSet = useMemo(() => new Set(folderState.collapsed), [folderState.collapsed]);
  const folderList = useMemo(() => allFolderPaths(fileNames, folderState), [fileNames, folderState]);

  const moveToFolder = useCallback(
    (name: string, folder: string) => {
      store.setFileFolder(name, folder);
      refreshNames();
    },
    [refreshNames]
  );

  const toggleFolder = useCallback(
    (path: string) => {
      store.toggleFolderCollapsed(path);
      refreshNames();
    },
    [refreshNames]
  );

  // active group's active tab, used for save/delete/status
  const activeGroup = groups.find((g) => g.id === activeGroupId) || groups[0];
  const activeTab = activeGroup?.tabs.find((t) => t.id === activeGroup.active) || null;
  const currentFile = activeTab?.file ?? ""; // saved name, "" for any unsaved tab
  const scratchActive = activeTab != null && activeTab.file == null && activeTab.id === SCRATCH_ID;

  // nothing open: the structs panel + status counts read empty, no stale data
  const noTab = activeTab == null;
  const shownText = noTab ? "" : activeText;

  // restore last session on mount: files list, format, and the open-tab layout.
  // microtask not a timer, a backgrounded reopened tab throttles timers
  useEffect(() => {
    queueMicrotask(() => {
      refreshNames();
      const fmt = store.getOutFmt();
      if (fmt) setOutputFormat(fmt as OutputFormat);
      const restored = restoreGroups();
      if (restored) {
        setGroups(restored.groups);
        setActiveGroupId(restored.activeId);
        setSplitRatio(restored.splitRatio);
        // seed the counters past anything restored so new ids never collide
        tabIdc.current = restored.maxTabId;
        bufSeq.current = restored.maxBufSeq;
      }
      setSessionReady(true);
    });
  }, [refreshNames]);

  // remember the open tabs, order, active tab, and split for next session.
  // gated on sessionReady so the default never clobbers a saved layout first.
  useEffect(() => {
    if (!sessionReady) return;
    const idx = Math.max(0, groups.findIndex((g) => g.id === activeGroupId));
    store.setLayout({
      groups: groups.map((g) => ({ tabs: g.tabs, active: g.active })),
      activeGroupIndex: idx,
      splitRatio,
    });
  }, [sessionReady, groups, activeGroupId, splitRatio]);

  const registerHandle = useCallback((id: string, h: GroupHandle | null) => {
    if (h) handles.current.set(id, h);
    else handles.current.delete(id);
  }, []);

  const handleAssembled = useCallback((out: AssembleOutput) => {
    setRawOutput(out.rawOutput);
    setNote(out.note);
    setAsmSource(out.asmSource);
  }, []);

  const handleAssemble = useCallback(() => {
    const g = groupsRef.current.find((x) => x.id === activeGroupIdRef.current);
    if (!g || g.tabs.length === 0) return; // nothing open
    setOutputOpen(true); // assembling into a hidden panel is pointless, reveal it
    handles.current.get(activeGroupIdRef.current)?.assemble();
  }, []);

  // return focus to the active editor (after a modal/save closes). deferred so it
  // lands after the overlay unmounts; CodeMirror keeps the cursor where it was.
  const focusActive = useCallback(() => {
    setTimeout(() => handles.current.get(activeGroupIdRef.current)?.focus(), 0);
  }, []);

  // open a saved file from the files rail: focus it if already open, else add a
  // new tab to the target group (defaults to active). a file lives in one group.
  const openFile = useCallback((file: string, targetId?: string) => {
    const gs = groupsRef.current;
    const owner = gs.find((g) => g.tabs.some((t) => t.file === file));
    if (owner) {
      const existing = owner.tabs.find((t) => t.file === file)!;
      setActiveGroupId(owner.id);
      setGroups((prev) => prev.map((g) => (g.id === owner.id ? { ...g, active: existing.id } : g)));
      return;
    }
    const aid = targetId || activeGroupIdRef.current;
    const tab: TabModel = { id: nextTabId(), file };
    setActiveGroupId(aid);
    setGroups((prev) => prev.map((g) => (g.id === aid ? { ...g, tabs: [...g.tabs, tab], active: tab.id } : g)));
  }, [nextTabId]);

  // open the durable "(unsaved)" scratch: focus it if already open, else add it
  const openScratch = useCallback((targetId?: string) => {
    const gs = groupsRef.current;
    const owner = gs.find((g) => g.tabs.some((t) => t.id === SCRATCH_ID));
    if (owner) {
      setActiveGroupId(owner.id);
      setGroups((prev) => prev.map((g) => (g.id === owner.id ? { ...g, active: SCRATCH_ID } : g)));
      return;
    }
    const aid = targetId || activeGroupIdRef.current;
    setActiveGroupId(aid);
    setGroups((prev) => prev.map((g) => (g.id === aid ? { ...g, tabs: [...g.tabs, { id: SCRATCH_ID, file: null }], active: SCRATCH_ID } : g)));
  }, []);

  // "+" / New: always add a fresh untitled buffer to the target group, focus it.
  // never focuses an existing tab, so it keeps opening new tabs as expected.
  const newTabIn = useCallback((targetId: string) => {
    const tab: TabModel = { id: nextTabId(), file: null, n: (bufSeq.current += 1) };
    setActiveGroupId(targetId);
    setGroups((prev) => prev.map((g) => (g.id === targetId ? { ...g, tabs: [...g.tabs, tab], active: tab.id } : g)));
  }, [nextTabId]);

  // click a tab already living in a group, just focus it
  const focusTab = useCallback((groupId: string, tabId: string) => {
    setActiveGroupId(groupId);
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, active: tabId } : g)));
  }, []);

  const closeTab = useCallback((groupId: string, tabId: string) => {
    const gs = groupsRef.current;
    const g = gs.find((x) => x.id === groupId);
    if (!g) return;
    const tab = g.tabs.find((t) => t.id === tabId);
    if (tab) discardTabDraft(tab); // throwaway buffers drop their content
    const idx = g.tabs.findIndex((t) => t.id === tabId);
    const nextTabs = g.tabs.filter((t) => t.id !== tabId);
    const nextActive =
      g.active === tabId ? (nextTabs.length ? nextTabs[Math.min(idx, nextTabs.length - 1)].id : "") : g.active;
    const proposed = gs.map((x) => (x.id === groupId ? { ...x, tabs: nextTabs, active: nextActive } : x));
    const res = normalize(proposed, activeGroupIdRef.current);
    setGroups(res.groups);
    setActiveGroupId(res.activeId);
  }, []);

  const handleSave = useCallback(
    (name: string) => {
      const h = handles.current.get(activeGroupIdRef.current);
      const text = h?.getText() || "";
      store.saveFile(name, text);
      store.setLastOpen(name);
      refreshNames();
      const aid = activeGroupIdRef.current;
      const g0 = groupsRef.current.find((g) => g.id === aid);
      const saved = g0?.tabs.find((t) => t.id === g0.active) || null;
      if (!saved) {
        setSaveOpen(false);
        return;
      }
      // saving a throwaway buffer discards its buffer draft, it lives in the file
      if (isBuffer(saved)) store.clearBuffer(saved.id);
      // saving the scratch mints a new id so the reserved scratch id stays free
      const newId = saved.id === SCRATCH_ID ? nextTabId() : saved.id;
      setGroups((prev) =>
        prev.map((g) => {
          if (g.id !== aid) return g;
          const tabs = g.tabs
            .map((t) => (t.id === saved.id ? { id: newId, file: name } : t))
            .filter((t) => t.id === newId || t.file !== name); // drop any older tab of the same file
          return { ...g, tabs, active: newId, reloadKey: g.reloadKey + 1 };
        })
      );
      setSaveOpen(false);
      focusActive();
    },
    [refreshNames, nextTabId, focusActive]
  );

  // ctrl+s: write straight to the current file if it already has a name, else
  // fall back to the Save As modal (an untitled/scratch tab needs a name first).
  const handleSmartSave = useCallback(() => {
    const aid = activeGroupIdRef.current;
    const g = groupsRef.current.find((x) => x.id === aid);
    const tab = g?.tabs.find((t) => t.id === g.active) || null;
    if (!tab || tab.file == null) {
      setSaveOpen(true);
      return;
    }
    const text = handles.current.get(aid)?.getText() || "";
    store.saveFile(tab.file, text);
    store.setLastOpen(tab.file);
    refreshNames();
    setFlash(`saved ${tab.file}`);
    focusActive();
  }, [refreshNames, focusActive]);

  const handleDelete = useCallback(() => {
    const aid = activeGroupIdRef.current;
    const g = groupsRef.current.find((x) => x.id === aid);
    const tab = g?.tabs.find((t) => t.id === g.active) || null;
    const file = tab?.file;
    if (!tab || !file) return;
    store.deleteFile(file);
    store.clearDraft(file);
    store.setLastOpen("");
    refreshNames();
    closeTab(aid, tab.id);
    setDeleteOpen(false);
    focusActive();
  }, [refreshNames, closeTab, focusActive]);

  const handleFormat = useCallback((fmt: OutputFormat) => {
    setOutputFormat(fmt);
    store.setOutFmt(fmt);
  }, []);

  // write the built struct block into the active editor
  const handleInsertStruct = useCallback((snippet: string) => {
    handles.current.get(activeGroupIdRef.current)?.insertStruct(snippet);
  }, []);

  // export the whole saved library to a JSON file on disk
  const handleExport = useCallback(() => {
    const n = exportLibrary();
    setFlash(n ? `exported ${n} function${n === 1 ? "" : "s"}` : "library is empty");
  }, []);

  // a picked file becomes an import plan (new vs existing) for the modal
  const handleImportPick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be picked again later
    if (!file) return;
    const res = await readImportFile(file);
    if (res.kind === "error") {
      setFlash(`import failed, ${res.message}`);
      return;
    }
    const plan = planImport(res.files);
    setImportPlan({ files: res.files, fresh: plan.fresh, existing: plan.existing, folders: res.folders });
  }, []);

  // dropped files reuse the import plan/confirm flow, merged into one plan
  const importDroppedFiles = useCallback(async (list: FileList) => {
    const accepted = Array.from(list).filter((f) => /\.(s|json|txt)$/i.test(f.name));
    if (!accepted.length) {
      setFlash("import needs a .s or .json file");
      return;
    }
    const merged: Record<string, FileEntry> = {};
    let folders: Record<string, string> | undefined;
    const bad: string[] = [];
    for (const f of accepted) {
      const res = await readImportFile(f);
      if (res.kind === "error") {
        bad.push(f.name);
        continue;
      }
      Object.assign(merged, res.files);
      if (res.folders) folders = { ...(folders || {}), ...res.folders };
    }
    if (!Object.keys(merged).length) {
      setFlash(`import failed${bad.length ? `, ${bad.join(", ")}` : ""}`);
      return;
    }
    const plan = planImport(merged);
    setImportPlan({ files: merged, fresh: plan.fresh, existing: plan.existing, folders });
  }, []);

  // whole-window os-file drop. rail drags carry no files, so they're ignored
  useEffect(() => {
    const hasFiles = (e: DragEvent) =>
      !dragFile.current && !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dropDepth.current++;
      setImportDrag(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dropDepth.current = Math.max(0, dropDepth.current - 1);
      if (dropDepth.current === 0) setImportDrag(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes("Files")) return;
      e.preventDefault();
      dropDepth.current = 0;
      setImportDrag(false);
      if (e.dataTransfer.files.length) importDroppedFiles(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [importDroppedFiles]);

  const handleImportConfirm = useCallback(
    (overwrite: boolean) => {
      if (!importPlan) return;
      const s = applyImport(importPlan.files, overwrite, importPlan.folders);
      refreshNames();
      setImportPlan(null);
      const parts: string[] = [];
      if (s.added) parts.push(`${s.added} added`);
      if (s.overwritten) parts.push(`${s.overwritten} overwritten`);
      if (s.skipped) parts.push(`${s.skipped} skipped`);
      setFlash(`import done, ${parts.join(", ") || "nothing changed"}`);
      focusActive();
    },
    [importPlan, refreshNames, focusActive]
  );

  // auto-clear the toast
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(""), 3200);
    return () => clearTimeout(t);
  }, [flash]);

  // live structs + function outline parsed from whichever file is focused
  const structs = parseStructs(shownText);
  const funcs = parseFuncs(shownText);

  // global-scope bindings: the `global` keyword plus any set/loadstruct before
  // the first func. func-local ones are left out (they belong to their func).
  const firstFuncLine = funcs.length ? funcs[0].line : Infinity;
  const globalBindings = (() => {
    const seen = new Set<string>();
    const out: { name: string; type: string; reg: string }[] = [];
    const add = (g: { name: string; type: string; reg: string }) => {
      const k = `${g.name}@${g.reg}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push(g);
      }
    };
    parseGlobals(shownText).forEach(add);
    structs.instances.filter((i) => i.line < firstFuncLine).forEach(add);
    return out;
  })();

  // jump the active editor to a source line (outline click)
  const goToLine = useCallback((line: number) => {
    handles.current.get(activeGroupIdRef.current)?.goToLine(line);
  }, []);

  // struct types pulled in from directly imported files, shown read-only
  const importedTypes: (StructTypeView & { from: string })[] = [];
  {
    const seen = new Set(structs.types.map((t) => t.name));
    for (const { name } of parseImports(shownText)) {
      const f = store.getFile(name);
      if (!f) continue;
      for (const t of parseStructs(f.asm).types) {
        if (seen.has(t.name)) continue;
        seen.add(t.name);
        importedTypes.push({ ...t, from: name });
      }
    }
  }

  // disassembled text becomes the unsaved scratch in the active group
  const handlePromote = useCallback((text: string) => {
    setDisasmOpen(false);
    store.setDraft("", text); // the scratch reads from the (unsaved) key
    const gs = groupsRef.current;
    const owner = gs.find((g) => g.tabs.some((t) => t.id === SCRATCH_ID));
    const targetId = owner ? owner.id : activeGroupIdRef.current;
    setActiveGroupId(targetId);
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== targetId) return g;
        const has = g.tabs.some((t) => t.id === SCRATCH_ID);
        const tabs = has ? g.tabs : [...g.tabs, { id: SCRATCH_ID, file: null }];
        return { ...g, tabs, active: SCRATCH_ID, reloadKey: g.reloadKey + 1 };
      })
    );
    focusActive();
  }, [focusActive]);

  // drag / split coordination

  const onTabDragEnd = useCallback(() => {
    drag.current = null;
    setDragging(false);
  }, []);

  const reorderInGroup = useCallback((groupId: string, fromId: string, toIdx: number) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        const tab = g.tabs.find((t) => t.id === fromId);
        if (!tab) return g;
        const arr = g.tabs.filter((t) => t.id !== fromId);
        arr.splice(clamp(toIdx, 0, arr.length), 0, tab);
        return { ...g, tabs: arr, active: fromId };
      })
    );
  }, []);

  const moveToGroup = useCallback((fromId: string, fromGroupId: string, toGroupId: string, toIdx: number) => {
    const gs = groupsRef.current;
    const moving = gs.find((g) => g.id === fromGroupId)?.tabs.find((t) => t.id === fromId);
    if (!moving) return;
    let proposed = gs.map((g) => (g.id === fromGroupId ? { ...g, tabs: g.tabs.filter((t) => t.id !== fromId) } : g));
    proposed = proposed.map((g) => {
      if (g.id !== toGroupId) return g;
      const arr = g.tabs.filter((t) => t.id !== fromId);
      arr.splice(clamp(toIdx, 0, arr.length), 0, moving);
      return { ...g, tabs: arr, active: fromId };
    });
    const res = normalize(proposed, toGroupId);
    setGroups(res.groups);
    setActiveGroupId(res.activeId);
  }, []);

  const onStripDrop = useCallback(
    (toGroupId: string, toIdx: number) => {
      const d = drag.current;
      if (!d) return;
      if (d.fromGroup === toGroupId) reorderInGroup(toGroupId, d.tabId, toIdx);
      else moveToGroup(d.tabId, d.fromGroup, toGroupId, toIdx);
      drag.current = null;
      setDragging(false);
    },
    [reorderInGroup, moveToGroup]
  );

  const onSplitDrop = useCallback(
    (targetGroupId: string, side: "left" | "right") => {
      const d = drag.current;
      if (!d) return;
      const gs = groupsRef.current;
      if (gs.length >= 2) {
        // already split, drop just moves the tab into the target group
        const target = gs.find((g) => g.id === targetGroupId);
        if (target) moveToGroup(d.tabId, d.fromGroup, targetGroupId, target.tabs.length);
      } else {
        // single group, peel the tab off into a new group beside it
        const src = gs[0];
        const moving = src.tabs.find((t) => t.id === d.tabId);
        if (moving && src.tabs.length > 1) {
          const remaining = src.tabs.filter((t) => t.id !== d.tabId);
          const srcActive = src.active === d.tabId ? remaining[remaining.length - 1].id : src.active;
          const srcGroup = { ...src, tabs: remaining, active: srcActive };
          const newGroup: GroupModel = { id: nextId(), tabs: [moving], active: moving.id, reloadKey: 0 };
          setGroups(side === "left" ? [newGroup, srcGroup] : [srcGroup, newGroup]);
          setActiveGroupId(newGroup.id);
          setSplitRatio(0.5);
        }
      }
      drag.current = null;
      setDragging(false);
    },
    [moveToGroup, nextId]
  );

  const adjustSplit = useCallback((dx: number) => {
    const w = rowRef.current?.clientWidth || 1;
    setSplitRatio((r) => clamp(r + dx / w, 0.2, 0.8));
  }, []);

  // shortcuts: save, assemble, tab management
  useEffect(() => {
    const modalOpen = saveOpen || deleteOpen || disasmOpen || structBuilderOpen || importPlan != null;
    const h = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        if (saveOpen) return;
        e.preventDefault();
        if (e.shiftKey) setSaveOpen(true); // save as
        else handleSmartSave(); // save to the existing file, or prompt if unnamed
        return;
      }
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        handleAssemble();
        return;
      }

      if (modalOpen) return;
      const g = groupsRef.current.find((x) => x.id === activeGroupIdRef.current);

      // ctrl+alt+w close tab (ctrl+w is reserved, left to close the chrome tab)
      if (mod && e.altKey && !e.shiftKey && e.code === "KeyW") {
        if (g && g.tabs.length > 0) {
          e.preventDefault();
          closeTab(g.id, g.active);
        }
        return;
      }
      // ctrl+alt+n new tab (plain ctrl+n is reserved by the browser)
      if (mod && e.altKey && !e.shiftKey && e.code === "KeyN") {
        e.preventDefault();
        newTabIn(activeGroupIdRef.current);
        return;
      }
      // ctrl+tab / ctrl+pagedown cycle forward, +shift / pageup cycle back
      const cycleFwd = (e.ctrlKey && e.key === "Tab" && !e.shiftKey) || (e.ctrlKey && e.key === "PageDown");
      const cycleBack = (e.ctrlKey && e.key === "Tab" && e.shiftKey) || (e.ctrlKey && e.key === "PageUp");
      if (cycleFwd || cycleBack) {
        if (g && g.tabs.length > 1) {
          e.preventDefault();
          const n = g.tabs.length;
          const i = g.tabs.findIndex((t) => t.id === g.active);
          const j = (((i + (cycleBack ? -1 : 1)) % n) + n) % n;
          focusTab(g.id, g.tabs[j].id);
        }
        return;
      }
      // ctrl+1..8 jump to the nth tab, ctrl+9 the last
      if (mod && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        if (g && g.tabs.length) {
          e.preventDefault();
          const d = Number(e.key);
          const idx = d === 9 ? g.tabs.length - 1 : Math.min(d - 1, g.tabs.length - 1);
          focusTab(g.id, g.tabs[idx].id);
        }
        return;
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [saveOpen, deleteOpen, disasmOpen, structBuilderOpen, importPlan, handleAssemble, handleSmartSave, closeTab, newTabIn, focusTab]);

  const barTitle = "uppercase tracking-[0.09em] text-[10px] font-semibold text-text-muted";

  // shared handlers/state for the rail tree rows
  const railCtx: RailCtx = {
    currentFile,
    collapsed: collapsedSet,
    dropTarget,
    openFile: (name) => openFile(name),
    toggleFolder,
    onFileDragStart: (name) => {
      dragFile.current = name;
    },
    onFileDragEnd: () => {
      dragFile.current = null;
      setDropTarget(null);
    },
    onFolderDragOver: (e, path) => {
      if (!dragFile.current) return;
      e.preventDefault();
      e.stopPropagation();
      setDropTarget(path);
    },
    onFolderDrop: (e, path) => {
      e.preventDefault();
      e.stopPropagation();
      const n = dragFile.current;
      dragFile.current = null;
      setDropTarget(null);
      if (n) moveToFolder(n, path);
    },
    onFileMenu: (e, name) => {
      e.preventDefault();
      setRailMenu({ kind: "file", name, x: e.clientX, y: e.clientY });
    },
    onFolderMenu: (e, path) => {
      e.preventDefault();
      setRailMenu({ kind: "folder", path, x: e.clientX, y: e.clientY });
    },
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-base-bg text-text-primary">
      <TopProgress active={assembling} />
      {/* header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-3 py-2">
        <div className="flex items-center gap-2">
          <Cpu size={17} className="text-accent" />
          <span className="font-bold tracking-tight">PS3 PPU Lab</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Tooltip label={`${outputOpen ? "hide" : "show"} the output panel`} placement="bottom">
            <button
              onClick={() => setOutputOpen((v) => !v)}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold border ${
                outputOpen
                  ? "border-accent/50 bg-accent/15 text-accent"
                  : "border-border bg-btn-secondary text-text-secondary hover:text-text-primary"
              }`}
            >
              <PanelRight size={13} /> Output
            </button>
          </Tooltip>
          <Tooltip label={`${structsOpen ? "hide" : "show"} the structs panel`} placement="bottom">
            <button
              onClick={() => setStructsOpen((v) => !v)}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold border ${
                structsOpen
                  ? "border-accent/50 bg-accent/15 text-accent"
                  : "border-border bg-btn-secondary text-text-secondary hover:text-text-primary"
              }`}
            >
              <Boxes size={13} /> Structs
            </button>
          </Tooltip>
          <button
            onClick={handleAssemble}
            disabled={assembling || noTab}
            className="flex items-center gap-1.5 rounded bg-accent px-3.5 py-1.5 text-sm font-semibold text-white shadow-[0_2px_12px_rgba(47,129,247,0.35)] hover:bg-accent-hover disabled:opacity-50"
          >
            <Play size={13} fill="currentColor" />
            Assemble
          </button>
          <Tooltip label="open the docs in a new tab" placement="bottom">
            <a
              href="/docs"
              target="ppulab-docs"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded border border-border bg-btn-secondary px-2.5 py-1.5 text-[11px] font-semibold text-text-secondary hover:text-text-primary"
            >
              <BookOpen size={13} /> Docs
            </a>
          </Tooltip>
        </div>
      </header>

      {/* body */}
      <div className="flex min-h-0 flex-1">
        {/* files rail */}
        <aside className="flex shrink-0 flex-col" style={{ width: filesW }}>
          <div className={`flex h-[38px] items-center gap-2 border-b border-border bg-surface px-2 ${barTitle}`}>
            <Folder size={13} /> Files
            <Tooltip label="new folder" placement="bottom">
              <button
                onClick={() => setFolderPrompt({ title: "New folder", initial: "", confirm: "Create", submit: (v) => store.createFolder(v) })}
                className="ml-auto flex items-center justify-center rounded p-1 text-text-muted hover:bg-white/[0.05] hover:text-text-primary"
              >
                <FolderPlus size={14} />
              </button>
            </Tooltip>
          </div>
          <div className="flex-1 overflow-auto p-1.5">
            <button
              onClick={() => openScratch()}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left ${
                scratchActive ? "bg-accent/15 text-text-primary shadow-[inset_2px_0_0] shadow-accent" : "text-text-secondary hover:bg-white/[0.03]"
              }`}
            >
              <FileCode2 size={14} className="shrink-0 text-text-muted" />
              <span className="truncate font-mono text-[12.5px]">(unsaved)</span>
            </button>
            {/* folders + files. dropping on this wrapper (outside any folder) moves a file to the root */}
            <div
              onDragOver={(e) => {
                if (dragFile.current) {
                  e.preventDefault();
                  setDropTarget("__root__");
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const n = dragFile.current;
                dragFile.current = null;
                setDropTarget(null);
                if (n) moveToFolder(n, "");
              }}
              className={`rounded ${dropTarget === "__root__" ? "bg-accent/10 ring-1 ring-inset ring-accent/40" : ""}`}
            >
              {folderTree.folders.map((f) => (
                <FolderNode key={f.path} node={f} depth={0} ctx={railCtx} />
              ))}
              {folderTree.root.map((n) => (
                <FileRow key={n} name={n} depth={0} ctx={railCtx} />
              ))}
            </div>

            <div className="mt-3 mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.09em] text-text-muted/70">Tools</div>
            <button
              onClick={() => setDisasmOpen(true)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-text-secondary hover:bg-white/[0.03]"
            >
              <ArrowLeftRight size={14} className="shrink-0 text-[#56d4dd]" />
              <span className="truncate text-[12.5px]">Disassemble hex</span>
            </button>

            {funcs.length > 0 && (
              <>
                <div className="mt-3 mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.09em] text-text-muted/70">Outline</div>
                {funcs.map((f) => (
                  <div key={`${f.name}-${f.line}`}>
                    <Tooltip
                      label={`${f.name}(${f.params.map((p) => `${p.name}: ${p.type}`).join(", ")})${f.ret ? ` -> ${f.ret}` : ""}`}
                      placement="right"
                    >
                      <button
                        onClick={() => goToLine(f.line)}
                        className="flex w-full items-baseline gap-1.5 rounded px-2 py-1 text-left hover:bg-white/[0.03]"
                      >
                        <span className="shrink-0 font-serif text-[12px] font-bold italic text-[#e3b341]">f</span>
                        <span className="truncate font-mono text-[12px] text-[#e3b341]">{f.name}</span>
                        {f.params.length > 0 && (
                          <span className="truncate font-mono text-[10px] text-text-muted">
                            {f.params.map((p) => p.name).join(", ")}
                          </span>
                        )}
                      </button>
                    </Tooltip>
                    {f.locals.map((l) => (
                      <div key={l} className="truncate pl-[26px] pr-2 py-0.5 font-mono text-[10.5px] text-[#6e7681]">
                        .{l}
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
          <div className="flex flex-col gap-1.5 border-t border-border p-2">
            <div className="flex gap-1.5">
              <button
                onClick={() => newTabIn(activeGroupIdRef.current)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded border border-border bg-btn-secondary py-1.5 text-[11px] font-semibold text-text-secondary hover:text-text-primary"
              >
                <Plus size={13} /> New
              </button>
              <Tooltip label="save (ctrl+s) · shift for save as" placement="top">
                <button
                  onClick={handleSmartSave}
                  className="flex items-center justify-center rounded border border-border bg-btn-secondary px-2.5 py-1.5 text-text-secondary hover:text-text-primary"
                >
                  <Save size={14} />
                </button>
              </Tooltip>
              <Tooltip label="delete this file" placement="top">
                <button
                  onClick={() => currentFile && setDeleteOpen(true)}
                  disabled={!currentFile}
                  className="flex items-center justify-center rounded border border-border bg-danger-bg px-2.5 py-1.5 text-danger-text disabled:opacity-40"
                >
                  <Trash2 size={14} />
                </button>
              </Tooltip>
            </div>
            <div className="flex gap-1.5">
              <Tooltip label="download the whole library as a file" placement="top">
                <button
                  onClick={handleExport}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded border border-border bg-btn-secondary py-1.5 text-[11px] font-semibold text-text-secondary hover:text-text-primary"
                >
                  <Download size={13} /> Export
                </button>
              </Tooltip>
              <Tooltip label="import a library, or drop a .s file anywhere" placement="top">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded border border-border bg-btn-secondary py-1.5 text-[11px] font-semibold text-text-secondary hover:text-text-primary"
                >
                  <Upload size={13} /> Import
                </button>
              </Tooltip>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.s,.txt,application/json,text/plain"
            className="hidden"
            onChange={handleImportPick}
          />
        </aside>
        <VDivider onDrag={(dx) => setFilesW((w) => clamp(w + dx, 170, 420))} />

        {/* editor groups */}
        <div ref={rowRef} className="flex min-h-0 min-w-0 flex-1">
          {groups.map((g, i) => (
            <Fragment key={g.id}>
              {i > 0 && <VDivider onDrag={adjustSplit} />}
              <div
                className="flex min-h-0 min-w-0 flex-col"
                style={{ flexBasis: 0, flexGrow: groups.length === 1 ? 1 : i === 0 ? splitRatio : 1 - splitRatio }}
              >
                <EditorGroup
                  group={g}
                  isActive={g.id === activeGroupId}
                  showFocus={groups.length > 1}
                  dragging={dragging}
                  onFocus={() => setActiveGroupId(g.id)}
                  onOpenTab={(tabId) => focusTab(g.id, tabId)}
                  onNewTab={() => newTabIn(g.id)}
                  onCloseTab={(tabId) => closeTab(g.id, tabId)}
                  onActiveFileChange={() => {}}
                  onTextChange={setActiveText}
                  onCursor={(line, col) => setCursor({ line, col })}
                  onAssembled={handleAssembled}
                  onAssemblingChange={setAssembling}
                  registerHandle={registerHandle}
                  onTabDragStart={(tabId) => {
                    drag.current = { fromGroup: g.id, tabId };
                    setDragging(true);
                  }}
                  onTabDragEnd={onTabDragEnd}
                  onStripDrop={(toIdx) => onStripDrop(g.id, toIdx)}
                  onSplitDrop={(side) => onSplitDrop(g.id, side)}
                />
              </div>
            </Fragment>
          ))}
        </div>

        {/* output panel (shared, shows the last assemble) */}
        {outputOpen && <VDivider onDrag={(dx) => setOutputW((w) => clamp(w - dx, 260, 620))} />}
        {outputOpen && (
          <div className="flex min-h-0 shrink-0 flex-col" style={{ width: outputW }}>
            <OutputPane rawOutput={rawOutput} asmSource={asmSource} format={outputFormat} onFormatChange={handleFormat} />
          </div>
        )}

        {/* structs dock */}
        {structsOpen && (
          <>
            <VDivider onDrag={(dx) => setStructsW((w) => clamp(w - dx, 200, 520))} />
            <aside className="flex shrink-0 flex-col" style={{ width: structsW }}>
              <div className={`flex h-[38px] items-center gap-2 border-b border-border bg-surface px-2 ${barTitle}`}>
                <Boxes size={13} /> Structs
                <Tooltip label="build a new struct" placement="bottom">
                  <button
                    onClick={() => setStructBuilderOpen(true)}
                    disabled={noTab}
                    className="ml-auto flex items-center gap-1 rounded border border-border bg-btn-secondary px-1.5 py-0.5 text-[10px] font-semibold text-text-secondary hover:text-text-primary disabled:opacity-40"
                  >
                    <Plus size={12} /> New
                  </button>
                </Tooltip>
              </div>
              <div className="flex-1 space-y-3 overflow-auto p-2.5">
                {structs.types.length === 0 && globalBindings.length === 0 && importedTypes.length === 0 ? (
                  <div className="text-xs leading-relaxed text-text-muted">
                    <p className="mb-2">no structs in this file yet.</p>
                    <p className="mb-1.5">hit New to build one, or type it in. offsets come from the field types:</p>
                    <pre className="whitespace-pre-wrap rounded border border-border bg-input-bg p-2 font-mono text-[11px] text-text-secondary">{`struct Player @ 0x016C7C30 {
    name   : string[16]
    health : i32
    posX   : f32
}
set r3, player as Player

lwz r4, player.health   # 0x10(r3)
lfs f1, player.posX     # 0x14(r3)`}</pre>
                  </div>
                ) : (
                  <>
                    {structs.types.map((t, i) => (
                      <div key={t.name} style={{ animationDelay: `${Math.min(i * 40, 240)}ms` }} className="list-in overflow-hidden rounded-md border border-border bg-card-bg">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-surface px-2.5 py-1.5">
                          <Boxes size={12} className="shrink-0 text-accent" />
                          <span className="whitespace-nowrap font-mono text-[12px] font-semibold text-text-primary">{t.name}</span>
                          {t.address && (
                            <span className="flex shrink-0 items-center gap-0.5 font-mono text-[10.5px] text-[#56d4dd]">
                              <Hash size={9} className="opacity-60" />
                              {fmtAddr(t.address)}
                            </span>
                          )}
                          {t.address && t.fields.some((f) => f.value) && (
                            <Tooltip label="emits data at its address in the output" placement="bottom">
                              <span className="shrink-0 rounded bg-[#7ee787]/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-[#7ee787]">
                                emits
                              </span>
                            </Tooltip>
                          )}
                          {t.packed && (
                            <Tooltip label="fields laid end to end, no alignment padding" placement="bottom">
                              <span className="shrink-0 rounded bg-[#c792ea]/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-[#c792ea]">
                                packed
                              </span>
                            </Tooltip>
                          )}
                          <span className="ml-auto shrink-0 whitespace-nowrap text-[10px] text-text-muted">
                            {t.fields.length} field{t.fields.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="p-1">
                          {t.fields.length === 0 ? (
                            <div className="px-2 py-1 text-[11px] text-text-muted">no fields</div>
                          ) : (
                            t.fields.map((f) => (
                              <div key={f.name} className="flex min-w-0 items-center gap-1.5 rounded px-2 py-1 hover:bg-white/[0.03]">
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#ffa657]" />
                                <span className="shrink-0 font-mono text-[11.5px] text-[#ffa657]">{f.name}</span>
                                {f.type && <span className="shrink-0 font-mono text-[10.5px] text-text-muted">:</span>}
                                {f.type && <span className="shrink-0 font-mono text-[10.5px] text-[#d2a8ff]">{f.type}</span>}
                                {f.value && (
                                  <Tooltip label={f.value} placement="top">
                                    <span className="min-w-0 truncate font-mono text-[10.5px] text-[#7ee787]">
                                      = {f.value}
                                    </span>
                                  </Tooltip>
                                )}
                                <span className="ml-auto flex shrink-0 items-center gap-1 font-mono text-[11px] text-[#56d4dd]">
                                  <Hash size={10} className="opacity-60" />
                                  {fmtOff(f.offset)}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                    {importedTypes.map((t) => (
                      <div key={`imp-${t.from}-${t.name}`} className="overflow-hidden rounded-md border border-dashed border-border bg-card-bg/60">
                        <div className="flex items-center gap-2 border-b border-border bg-surface px-2.5 py-1.5">
                          <Boxes size={12} className="text-text-muted" />
                          <span className="font-mono text-[12px] font-semibold text-text-secondary">{t.name}</span>
                          <span className="ml-auto text-[9.5px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                            import · {t.from}
                          </span>
                        </div>
                        <div className="p-1">
                          {t.fields.map((f) => (
                            <div key={f.name} className="flex min-w-0 items-center gap-1.5 rounded px-2 py-1">
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#ffa657]/60" />
                              <span className="truncate font-mono text-[11.5px] text-[#ffa657]/70">{f.name}</span>
                              {f.type && <span className="shrink-0 font-mono text-[10.5px] text-text-muted">:</span>}
                              {f.type && <span className="shrink-0 truncate font-mono text-[10.5px] text-[#d2a8ff]/70">{f.type}</span>}
                              <span className="ml-auto shrink-0 font-mono text-[11px] text-[#56d4dd]/70">{fmtOff(f.offset)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {globalBindings.length > 0 && (
                      <div className="overflow-hidden rounded-md border border-border bg-card-bg">
                        <div className="border-b border-border bg-surface px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-text-muted">
                          Globals
                        </div>
                        <div className="p-1">
                          {globalBindings.map((g, i) => (
                            <div key={`${g.name}-${i}`} className="flex items-center gap-1.5 rounded px-2 py-1">
                              <span className="font-mono text-[11.5px] text-[#ffa657]">{g.name}</span>
                              {g.name !== g.type && <span className="font-mono text-[10.5px] text-text-muted">:</span>}
                              {g.name !== g.type && <span className="font-mono text-[10.5px] text-[#d2a8ff]">{g.type}</span>}
                              <span className="ml-auto font-mono text-[11px] text-[#56d4dd]">{g.reg}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </aside>
          </>
        )}
      </div>

      {/* status bar */}
      <footer className="flex shrink-0 items-center gap-3 border-t border-border bg-surface px-3 py-1 font-mono text-[11px] text-text-muted">
        <span className="text-text-secondary">
          {activeTab ? tabLabel(activeTab) : "no file"}
          {activeTab?.file != null && <span className="opacity-50">.s</span>}
        </span>
        {groups.length > 1 && <span className="text-accent">split</span>}
        {!noTab && (
          <>
            <span className="text-border-hover">|</span>
            <span>Ln {cursor.line}, Col {cursor.col}</span>
            <span className="text-border-hover">|</span>
            <span>{countInstructions(shownText)} instr</span>
            <span>{shownText.split("\n").length} lines</span>
          </>
        )}
        {note && (
          <>
            <span className="text-border-hover">|</span>
            <span className="text-success">{note}</span>
          </>
        )}
        <span className="ml-auto text-text-secondary">PPC64 · Cell PPU</span>
      </footer>

      <SaveModal open={saveOpen} defaultName={currentFile} existingNames={fileNames} onSave={handleSave} onCancel={() => { setSaveOpen(false); focusActive(); }} />
      <DeleteModal open={deleteOpen} name={currentFile} onConfirm={handleDelete} onCancel={() => { setDeleteOpen(false); focusActive(); }} />
      {disasmOpen && <DisasmOverlay onClose={() => { setDisasmOpen(false); focusActive(); }} onPromote={handlePromote} />}
      {structBuilderOpen && <StructBuilder onInsert={handleInsertStruct} onClose={() => { setStructBuilderOpen(false); focusActive(); }} />}
      {importPlan && (
        <ImportModal
          fresh={importPlan.fresh}
          existing={importPlan.existing}
          onCancel={() => { setImportPlan(null); focusActive(); }}
          onImport={handleImportConfirm}
        />
      )}

      {importDrag && (
        <div className="drop-overlay pointer-events-none fixed inset-0 z-[92] flex items-center justify-center bg-base-bg/70 backdrop-blur-[3px]">
          <div className="drop-card flex flex-col items-center gap-5 rounded-2xl border-2 border-dashed border-accent/55 bg-card-bg/85 px-20 py-14">
            <div className="drop-bob flex h-[68px] w-[68px] items-center justify-center rounded-2xl bg-accent/15 text-accent">
              <Download size={32} />
            </div>
            <div className="text-center">
              <div className="text-[17px] font-semibold text-text-primary">Drop to import</div>
              <div className="mt-1.5 font-mono text-[12.5px] text-text-muted">.s or .json</div>
            </div>
          </div>
        </div>
      )}

      {flash && (
        <div className="toast-in pointer-events-none fixed bottom-9 left-1/2 z-[90] -translate-x-1/2 rounded-md border border-border bg-card-bg px-3.5 py-2 text-xs text-text-secondary shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
          {flash}
        </div>
      )}

      {/* rail context menu: move a file, or manage a folder */}
      {railMenu && (
        <div
          className="fixed inset-0 z-[95]"
          onClick={() => setRailMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setRailMenu(null);
          }}
        >
          <div
            className="absolute min-w-[178px] max-w-[248px] overflow-hidden rounded-lg border border-border-hover bg-card-bg py-1 text-[12.5px] shadow-[0_14px_36px_rgba(0,0,0,0.6)]"
            style={{ left: Math.min(railMenu.x, window.innerWidth - 258), top: Math.min(railMenu.y, window.innerHeight - 300) }}
            onClick={(e) => e.stopPropagation()}
          >
            {railMenu.kind === "file" ? (
              <>
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">Move to</div>
                <div className="max-h-52 overflow-auto">
                  <button
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-text-secondary hover:bg-white/[0.05] hover:text-text-primary"
                    onClick={() => {
                      moveToFolder(railMenu.name, "");
                      setRailMenu(null);
                    }}
                  >
                    <Folder size={13} className="shrink-0 text-text-muted" /> Root
                  </button>
                  {folderList.map((p) => (
                    <button
                      key={p}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-text-secondary hover:bg-white/[0.05] hover:text-text-primary"
                      onClick={() => {
                        moveToFolder(railMenu.name, p);
                        setRailMenu(null);
                      }}
                    >
                      <Folder size={13} className="shrink-0 text-[#e3b341]" /> <span className="truncate">{p}</span>
                    </button>
                  ))}
                </div>
                <div className="my-1 h-px bg-border" />
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-text-secondary hover:bg-white/[0.05] hover:text-text-primary"
                  onClick={() => {
                    const name = railMenu.name;
                    setRailMenu(null);
                    setFolderPrompt({
                      title: "New folder",
                      initial: "",
                      confirm: "Create & move",
                      submit: (v) => {
                        store.createFolder(v);
                        store.setFileFolder(name, v);
                      },
                    });
                  }}
                >
                  <FolderPlus size={13} className="shrink-0 text-text-muted" /> New folder&hellip;
                </button>
                <div className="my-1 h-px bg-border" />
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-text-secondary hover:bg-white/[0.05] hover:text-text-primary"
                  onClick={() => {
                    const name = railMenu.name;
                    setRailMenu(null);
                    const f = store.getFile(name);
                    if (f) exportFile(name, f.asm);
                  }}
                >
                  <Download size={13} className="shrink-0 text-text-muted" /> Export .s
                </button>
              </>
            ) : (
              <>
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-text-secondary hover:bg-white/[0.05] hover:text-text-primary"
                  onClick={() => {
                    const path = railMenu.path;
                    setRailMenu(null);
                    setFolderPrompt({ title: "New subfolder", initial: "", confirm: "Create", submit: (v) => store.createFolder(`${path}/${v}`) });
                  }}
                >
                  <FolderPlus size={13} className="shrink-0 text-text-muted" /> New subfolder&hellip;
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-text-secondary hover:bg-white/[0.05] hover:text-text-primary"
                  onClick={() => {
                    const path = railMenu.path;
                    const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
                    const leaf = path.slice(path.lastIndexOf("/") + 1);
                    setRailMenu(null);
                    setFolderPrompt({
                      title: "Rename folder",
                      initial: leaf,
                      confirm: "Rename",
                      submit: (v) => store.renameFolder(path, parent ? `${parent}/${v}` : v),
                    });
                  }}
                >
                  <Pencil size={13} className="shrink-0 text-text-muted" /> Rename&hellip;
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-danger-text hover:bg-danger-bg"
                  onClick={() => {
                    store.removeFolder(railMenu.path);
                    refreshNames();
                    setRailMenu(null);
                  }}
                >
                  <Trash2 size={13} className="shrink-0" /> Delete folder
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* folder name prompt (create / rename) */}
      {folderPrompt && (
        <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/50 p-4" onClick={() => setFolderPrompt(null)}>
          <div className="w-full max-w-xs rounded-lg border border-border-hover bg-card-bg p-4 shadow-[0_20px_50px_rgba(0,0,0,0.6)]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2.5 text-[13px] font-semibold text-text-primary">{folderPrompt.title}</div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const v = folderInputRef.current?.value ?? "";
                if (store.normFolder(v)) {
                  folderPrompt.submit(v);
                  refreshNames();
                }
                setFolderPrompt(null);
              }}
            >
              <input
                key={`${folderPrompt.title}|${folderPrompt.initial}`}
                ref={folderInputRef}
                autoFocus
                defaultValue={folderPrompt.initial}
                placeholder="folder name"
                spellCheck={false}
                className="w-full rounded border border-border bg-input-bg px-2.5 py-1.5 font-mono text-[13px] text-text-primary outline-none focus:border-accent"
              />
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFolderPrompt(null)}
                  className="rounded px-3 py-1.5 text-[12px] text-text-secondary hover:text-text-primary"
                >
                  Cancel
                </button>
                <button type="submit" className="rounded bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-hover">
                  {folderPrompt.confirm}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
