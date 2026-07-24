"use client";

// one editor group: tab strip + editor + local assemble/error/draft.
// the workstation shows one or two side by side. each owns its own CodeMirror
// and drafts so two files edit at once.

import { useState, useRef, useEffect, useCallback, Fragment } from "react";
import dynamic from "next/dynamic";
import type { EditorHandle } from "@/components/Editor";
import { assembleAsm, type AssembleError } from "@/lib/assemble-client";
import * as store from "@/lib/file-store";
import { TabModel, tabLabel, tabDirty, loadTabText, saveTabDraft } from "@/lib/tabs";
import { FileCode2, Plus, X, Code2, Network, AlertTriangle, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import Tooltip from "@/components/Tooltip";

const PPUEditor = dynamic(() => import("@/components/Editor"), { ssr: false });
const CfgGraph = dynamic(() => import("@/components/CfgGraph"), { ssr: false });
const CallGraph = dynamic(() => import("@/components/CallGraph"), { ssr: false });

// group model + imperative handle

export interface GroupModel {
  id: string;
  tabs: TabModel[]; // open tabs in order
  active: string; // the focused tab's id
  reloadKey: number; // bump to force a reload from the store (e.g. after promote)
}

export interface GroupHandle {
  assemble: () => void;
  getText: () => string;
  setText: (t: string) => void;
  focus: () => void;
  clearError: () => void;
  insertStruct: (snippet: string) => void;
  goToLine: (line: number) => void;
}

export interface AssembleOutput {
  rawOutput: string;
  note: string;
  asmSource: string;
}

// label positions for ctrl-click jump

function findCommentIndex(line: string): number {
  const idxs: number[] = [];
  const a = line.indexOf("//");
  if (a >= 0) idxs.push(a);
  const b = line.indexOf("#");
  if (b >= 0) idxs.push(b);
  const c = line.indexOf(";");
  if (c >= 0) idxs.push(c);
  return idxs.length ? Math.min(...idxs) : -1;
}

function buildLabelPositions(fullText: string) {
  const map = new Map<string, { line: number; index: number; length: number }>();
  const lines = String(fullText || "").split("\n");
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ci = findCommentIndex(line);
    const code = ci >= 0 ? line.slice(0, ci) : line;
    const m = code.match(/^\s*([A-Za-z_.$][\w.$]*):/);
    if (m) {
      const name = m[1];
      map.set(name, { line: i + 1, index: offset + code.indexOf(name), length: name.length });
    }
    offset += line.length + 1;
  }
  return map;
}

// props

interface EditorGroupProps {
  group: GroupModel;
  isActive: boolean;
  showFocus: boolean; // accent the tab strip to mark the focused pane (split only)
  dragging: boolean; // a tab drag is in progress somewhere
  onFocus: () => void;
  onOpenTab: (tabId: string) => void;
  onNewTab: () => void;
  onCloseTab: (tabId: string) => void;
  onActiveFileChange: (file: string | null) => void;
  onTextChange: (text: string) => void;
  onCursor: (line: number, col: number) => void;
  onAssembled: (out: AssembleOutput) => void;
  onAssemblingChange: (busy: boolean) => void;
  registerHandle: (id: string, h: GroupHandle | null) => void;
  // drag / split coordination, all bound to this group by the parent
  onTabDragStart: (tabId: string) => void;
  onTabDragEnd: () => void;
  onStripDrop: (toIdx: number) => void;
  onSplitDrop: (side: "left" | "right") => void;
}

export default function EditorGroup({
  group,
  isActive,
  showFocus,
  dragging,
  onFocus,
  onOpenTab,
  onNewTab,
  onCloseTab,
  onActiveFileChange,
  onTextChange,
  onCursor,
  onAssembled,
  onAssemblingChange,
  registerHandle,
  onTabDragStart,
  onTabDragEnd,
  onStripDrop,
  onSplitDrop,
}: EditorGroupProps) {
  const editorRef = useRef<EditorHandle>(null);
  const [errList, setErrList] = useState<AssembleError[]>([]);
  const [errIdx, setErrIdx] = useState(0);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [splitSide, setSplitSide] = useState<"left" | "right" | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<"code" | "graph">("code");
  const [graphMode, setGraphMode] = useState<"flow" | "calls">("flow");

  const stripRef = useRef<HTMLDivElement>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // the tab object currently loaded in the editor, so drafts save to its own key
  const activeTab = group.tabs.find((t) => t.id === group.active) || null;
  const empty = group.tabs.length === 0;
  const activeTabRef = useRef<TabModel | null>(activeTab);
  const isActiveRef = useRef(isActive);
  const prevActive = useRef<string | null>(null);
  const prevKey = useRef<number>(-1);
  // label positions in a ref, read lazily on ctrl-click, no re-render per keystroke
  const labelsRef = useRef<Map<string, { line: number; index: number; length: number }>>(new Map());

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  // CodeMirror mounts async via dynamic import. the editor fires onReady once
  // its view exists, that drives the load below (no fixed-timer race on refresh)

  // load content whenever the active tab (or a forced reload) changes
  useEffect(() => {
    if (!ready) return;
    const ed = editorRef.current;
    if (!ed || !activeTab) return;
    const activeChanged = prevActive.current !== group.active;
    const keyChanged = prevKey.current !== group.reloadKey;
    if (!activeChanged && !keyChanged) return;
    // flush the tab being left so its edits survive
    if (activeChanged && prevActive.current !== null) {
      const leaving = group.tabs.find((t) => t.id === prevActive.current);
      if (leaving) saveTabDraft(leaving, ed.getText());
    }
    const text = loadTabText(activeTab);
    ed.setText(text);
    ed.clearError();
    labelsRef.current = buildLabelPositions(text);
    if (activeTab.file) store.setLastOpen(activeTab.file);
    onActiveFileChange(activeTab.file);
    if (isActiveRef.current) onTextChange(text);
    prevActive.current = group.active;
    prevKey.current = group.reloadKey;
    // clear stale error banner from the prior tab
    queueMicrotask(() => setErrList([]));
  }, [ready, group.active, group.reloadKey, group.tabs, activeTab, onActiveFileChange, onTextChange]);

  const scheduleDraft = useCallback(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    const tab = activeTabRef.current;
    draftTimer.current = setTimeout(() => {
      const text = editorRef.current?.getText() || "";
      if (tab) saveTabDraft(tab, text);
      // feed the live text to the structs panel once typing settles
      if (isActiveRef.current) onTextChange(text);
    }, 250);
  }, [onTextChange]);

  const onChange = useCallback(
    (text: string) => {
      editorRef.current?.clearError();
      setErrList([]);
      labelsRef.current = buildLabelPositions(text);
      scheduleDraft();
    },
    [scheduleDraft]
  );

  // insert a snippet at the top of this group's file (structs panel action)
  const insertStruct = useCallback(
    (snippet: string) => {
      const ed = editorRef.current;
      if (!ed) return;
      const cur = ed.getText();
      const next = cur.trim() ? `${snippet}\n\n${cur}` : `${snippet}\n`;
      ed.setText(next);
      ed.clearError();
      setErrList([]);
      labelsRef.current = buildLabelPositions(next);
      if (activeTabRef.current) saveTabDraft(activeTabRef.current, next);
      if (isActiveRef.current) onTextChange(next);
      ed.focus();
    },
    [onTextChange]
  );

  const labelResolver = useCallback((name: string) => labelsRef.current.get(name) || null, []);

  const doAssemble = useCallback(async () => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.clearError();
    setErrList([]);
    onAssemblingChange(true);

    const text = ed.getText();
    const res = await assembleAsm(text);

    if (res.ok) {
      onAssembled({ rawOutput: res.out, note: res.note, asmSource: res.source });
    } else {
      onAssembled({ rawOutput: "", note: "", asmSource: text });
      // one or many: the assembler reports every bad line at once
      const list = res.errors && res.errors.length ? res.errors : [res.error];
      setErrList(list);
      setErrIdx(0);
      ed.setErrors(list.map((x) => ({ line: x.line ?? 0, col: x.col ?? null, length: x.length ?? null, message: x.message })));
      // jump to the first error, cursor on the token
      const first = list[0];
      if (first.line) {
        ed.focus();
        ed.scrollToLine(first.line, first.col ?? undefined);
      }
    }
    onAssemblingChange(false);
  }, [onAssembled, onAssemblingChange]);

  // step through the collected errors, jumping to each. only ever called from
  // an onClick, so the scroll/focus side effects are safe here
  const gotoErr = useCallback(
    (idx: number) => {
      const n = errList.length;
      if (!n) return;
      const i = ((idx % n) + n) % n;
      setErrIdx(i);
      const e = errList[i];
      if (e.line) {
        editorRef.current?.scrollToLine(e.line, e.col ?? undefined);
        editorRef.current?.focus();
      }
    },
    [errList]
  );

  // expose the group's actions to the parent (header assemble, save, etc)
  useEffect(() => {
    registerHandle(group.id, {
      assemble: doAssemble,
      getText: () => editorRef.current?.getText() || "",
      setText: (t: string) => editorRef.current?.setText(t),
      focus: () => editorRef.current?.focus(),
      clearError: () => {
        editorRef.current?.clearError();
        setErrList([]);
      },
      insertStruct,
      goToLine: (line: number) => {
        editorRef.current?.scrollToLine(line);
        editorRef.current?.focus();
      },
    });
    return () => registerHandle(group.id, null);
  }, [group.id, doAssemble, insertStruct, registerHandle]);

  // tab overflow: edge fades + dropdown
  const [tabOverflow, setTabOverflow] = useState({ left: false, right: false });
  const [tabMenuOpen, setTabMenuOpen] = useState(false);

  const updateTabOverflow = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    setTabOverflow({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
  }, []);

  useEffect(() => {
    updateTabOverflow();
    const el = stripRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateTabOverflow);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateTabOverflow, group.tabs.length]);

  // keep the active tab in view, last tab scrolls to the end so + shows.
  // next frame so the strip is measured after it turns scrollable.
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      const active = el.querySelector<HTMLElement>('[data-active="true"]');
      if (!active) return;
      const tabs = el.querySelectorAll("[data-tabbtn]");
      if (tabs.length && tabs[tabs.length - 1] === active) el.scrollLeft = el.scrollWidth;
      else active.scrollIntoView({ inline: "nearest", block: "nearest" });
    });
    return () => cancelAnimationFrame(id);
  }, [group.active]);

  // insertion index from the pointer x over this group's tab strip
  const tabIndexAt = useCallback((clientX: number) => {
    const strip = stripRef.current;
    if (!strip) return group.tabs.length;
    const btns = Array.from(strip.querySelectorAll<HTMLElement>("[data-tabbtn]"));
    for (let i = 0; i < btns.length; i++) {
      const r = btns[i].getBoundingClientRect();
      if (clientX < r.left + r.width / 2) return i;
    }
    return btns.length;
  }, [group.tabs.length]);

  return (
    <div className="flex h-full min-w-0 flex-col" onMouseDownCapture={onFocus}>
      {/* tab strip, top accent marks the focused pane when split */}
      <div
        className={`flex h-[38px] items-stretch border-b border-border bg-surface px-2 ${
          showFocus && isActive ? "shadow-[inset_0_2px_0_0_var(--color-accent)]" : ""
        }`}
      >
        <div className="relative flex min-w-0 flex-1">
        <div
          ref={stripRef}
          className="no-scrollbar flex w-full items-end gap-0.5 overflow-x-auto"
          onScroll={updateTabOverflow}
          onWheel={(e) => {
            const el = e.currentTarget;
            if (el.scrollWidth > el.clientWidth) el.scrollLeft += e.deltaY || e.deltaX;
          }}
          onDragOver={(e) => {
            if (!dragging) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDropIdx(tabIndexAt(e.clientX));
          }}
          onDragLeave={() => setDropIdx(null)}
          onDrop={(e) => {
            e.preventDefault();
            onStripDrop(tabIndexAt(e.clientX));
            setDropIdx(null);
          }}
        >
          {group.tabs.map((tab, i) => {
            const on = tab.id === group.active;
            const dirty = tabDirty(tab);
            return (
              <Fragment key={tab.id}>
                {dropIdx === i && <span className="mb-[3px] w-[2px] self-stretch rounded bg-accent" />}
                <div
                  data-tabbtn
                  data-active={on ? "true" : undefined}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    onTabDragStart(tab.id);
                  }}
                  onDragEnd={() => {
                    onTabDragEnd();
                    setDropIdx(null);
                  }}
                  onClick={() => onOpenTab(tab.id)}
                  className={`group flex h-[30px] shrink-0 cursor-default items-center gap-2 rounded-t-md border-t-2 px-3.5 text-xs transition-all ${
                    on ? "border-accent bg-card-bg text-text-primary" : "border-transparent text-text-muted hover:bg-white/[0.03]"
                  }`}
                  style={on ? { boxShadow: "inset 1px 0 0 var(--color-border), inset -1px 0 0 var(--color-border)" } : undefined}
                >
                  <FileCode2 size={13} className="text-text-muted" />
                  <span className="font-mono">
                    {tabLabel(tab)}
                    {tab.file != null && <span className={on ? "opacity-65" : "opacity-45"}>.s</span>}
                  </span>
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    className="relative flex h-3 w-3 cursor-pointer items-center justify-center"
                  >
                    {dirty && (
                      <span className="absolute h-1.5 w-1.5 rounded-full transition-opacity group-hover:opacity-0" style={{ background: "#c2ccd6" }} />
                    )}
                    <X size={12} className="text-text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-text-primary" />
                  </span>
                </div>
              </Fragment>
            );
          })}
          {dropIdx === group.tabs.length && <span className="mb-[3px] w-[2px] self-stretch rounded bg-accent" />}
          <button
            onClick={onNewTab}
            className="mb-[3px] ml-0.5 flex items-center rounded p-1 text-text-muted hover:bg-white/[0.05] hover:text-text-secondary"
          >
            <Plus size={15} />
          </button>
        </div>
          <div className={`pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-surface to-transparent transition-opacity duration-150 ${tabOverflow.left ? "opacity-100" : "opacity-0"}`} />
          <div className={`pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface to-transparent transition-opacity duration-150 ${tabOverflow.right ? "opacity-100" : "opacity-0"}`} />
        </div>
        {(tabOverflow.left || tabOverflow.right) && (
          <div className="relative flex items-center self-center">
            <Tooltip label="all open tabs" placement="bottom">
              <button
                onClick={() => setTabMenuOpen((v) => !v)}
                className="flex items-center rounded p-1 text-text-muted hover:bg-white/[0.05] hover:text-text-secondary"
              >
                <ChevronDown size={15} />
              </button>
            </Tooltip>
            {tabMenuOpen && (
              <>
                <div className="fixed inset-0 z-[40]" onClick={() => setTabMenuOpen(false)} />
                <div className="absolute right-0 top-full z-[41] mt-1 max-h-72 w-56 overflow-auto rounded-lg border border-border-hover bg-card-bg py-1 shadow-[0_14px_36px_rgba(0,0,0,0.6)]">
                  {group.tabs.map((tab) => {
                    const on = tab.id === group.active;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          onOpenTab(tab.id);
                          setTabMenuOpen(false);
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] ${
                          on ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-white/[0.05] hover:text-text-primary"
                        }`}
                      >
                        <FileCode2 size={12} className="shrink-0 text-text-muted" />
                        <span className="min-w-0 truncate">{tabLabel(tab)}</span>
                        {tab.file != null && <span className="shrink-0 font-mono text-[11px] opacity-50">.s</span>}
                        {tabDirty(tab) && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "#c2ccd6" }} />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
        {/* code / graph toggle for this pane */}
        {!empty && (
          <div className="flex items-center gap-0.5 self-center rounded-md border border-border bg-input-bg p-0.5">
            <button
              onClick={() => setView("code")}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${
                view === "code" ? "bg-accent/20 text-accent" : "text-text-muted hover:text-text-secondary"
              }`}
            >
              <Code2 size={12} /> Code
            </button>
            <button
              onClick={() => setView("graph")}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${
                view === "graph" ? "bg-accent/20 text-accent" : "text-text-muted hover:text-text-secondary"
              }`}
            >
              <Network size={12} /> Graph
            </button>
          </div>
        )}
      </div>

      {/* editor + drop-to-split zones, flush like the other panels */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {empty && (
          <div className="splash-in absolute inset-0 z-[25] flex flex-col items-center justify-center gap-5 bg-card-bg px-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface">
              <FileCode2 size={30} className="text-text-muted" strokeWidth={1.5} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-text-secondary">No file open</p>
              <p className="text-xs text-text-muted">pick one from the sidebar, or start something new</p>
            </div>
            <button
              onClick={onNewTab}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              <Plus size={14} /> New file
            </button>
            <div className="mt-1 flex flex-col gap-1.5 text-[11px] text-text-muted">
              {[
                ["new file", ["Ctrl", "Alt", "N"]],
                ["close tab", ["Ctrl", "Alt", "W"]],
                ["switch tabs", ["Ctrl", "1-9"]],
              ].map(([label, keys]) => (
                <div key={label as string} className="flex items-center justify-center gap-2">
                  <span className="w-16 text-right">{label}</span>
                  <span className="flex gap-1">
                    {(keys as string[]).map((k) => (
                      <kbd key={k} className="rounded border border-border bg-input-bg px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
                        {k}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {!empty && view === "graph" && (
          <div className="absolute inset-0 z-[20] overflow-hidden bg-[#080b11]">
            {graphMode === "flow" ? (
              <CfgGraph getAsm={() => editorRef.current?.getText() || ""} />
            ) : (
              <CallGraph
                getAsm={() => editorRef.current?.getText() || ""}
                onJump={(line) => {
                  setView("code");
                  setTimeout(() => editorRef.current?.scrollToLine(line), 0);
                }}
              />
            )}
            <div className="absolute left-2 top-2 z-10 flex items-center gap-0.5 rounded-md border border-border bg-card-bg p-0.5">
              <button
                onClick={() => setGraphMode("flow")}
                className={`rounded px-2 py-0.5 text-[10.5px] font-semibold ${
                  graphMode === "flow" ? "bg-accent/20 text-accent" : "text-text-muted hover:text-text-secondary"
                }`}
              >
                Flow
              </button>
              <button
                onClick={() => setGraphMode("calls")}
                className={`rounded px-2 py-0.5 text-[10.5px] font-semibold ${
                  graphMode === "calls" ? "bg-accent/20 text-accent" : "text-text-muted hover:text-text-secondary"
                }`}
              >
                Calls
              </button>
            </div>
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card-bg">
          <div className="relative min-h-0 flex-1">
            <div className="ws-fill-editor absolute inset-0">
              <PPUEditor
                ref={editorRef}
                onChange={onChange}
                labelResolver={labelResolver}
                onReady={() => setReady(true)}
                onCursor={(line, col) => {
                  if (isActiveRef.current) onCursor(line, col);
                }}
              />
            </div>
            {errList.length > 0 && (() => {
              const cur = errList[Math.min(errIdx, errList.length - 1)];
              const many = errList.length > 1;
              return (
                <div className="err-in absolute bottom-3 left-1/2 z-[6] flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-lg border border-danger-border bg-danger-bg/95 py-2 pl-3 pr-2 shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur">
                  <AlertTriangle size={15} className="shrink-0 text-danger-text" />
                  <span className="shrink-0 text-[12px] font-semibold text-danger-text">
                    {errList.length} error{many ? "s" : ""}
                  </span>
                  {many && (
                    <div className="flex shrink-0 items-center gap-0.5 text-danger-text">
                      <Tooltip label="previous error" placement="top">
                        <button onClick={() => gotoErr(errIdx - 1)} className="rounded p-0.5 hover:bg-danger-text/15">
                          <ChevronLeft size={14} />
                        </button>
                      </Tooltip>
                      <span className="min-w-[2.4rem] text-center text-[11px] tabular-nums opacity-80">
                        {errIdx + 1}/{errList.length}
                      </span>
                      <Tooltip label="next error" placement="top">
                        <button onClick={() => gotoErr(errIdx + 1)} className="rounded p-0.5 hover:bg-danger-text/15">
                          <ChevronRight size={14} />
                        </button>
                      </Tooltip>
                    </div>
                  )}
                  <span className="h-4 w-px shrink-0 bg-danger-text/25" />
                  {cur.line != null && (
                    <Tooltip label="jump to the error" placement="top">
                      <button
                        onClick={() => {
                          if (cur.line) {
                            editorRef.current?.scrollToLine(cur.line, cur.col ?? undefined);
                            editorRef.current?.focus();
                          }
                        }}
                        className="shrink-0 rounded bg-danger-text/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-danger-text hover:bg-danger-text/25"
                      >
                        Ln {cur.line}
                        {cur.col != null ? `:${cur.col + 1}` : ""}
                      </button>
                    </Tooltip>
                  )}
                  <Tooltip label={cur.message} placement="top">
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-danger-text">
                      {cur.message}
                    </span>
                  </Tooltip>
                  <Tooltip label="dismiss" placement="top">
                    <button
                      onClick={() => {
                        editorRef.current?.clearError();
                        setErrList([]);
                      }}
                      className="shrink-0 rounded p-0.5 text-danger-text/70 hover:bg-danger-text/15 hover:text-danger-text"
                    >
                      <X size={14} />
                    </button>
                  </Tooltip>
                </div>
              );
            })()}
          </div>
        </div>

        {/* split targets, only while a tab is being dragged */}
        {dragging && (
          <div className="absolute inset-0 z-[30] flex">
            <div
              className={`flex-1 rounded-l-md transition-colors ${splitSide === "left" ? "bg-accent/25" : "bg-transparent"}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setSplitSide("left");
              }}
              onDragLeave={() => setSplitSide(null)}
              onDrop={(e) => {
                e.preventDefault();
                setSplitSide(null);
                onSplitDrop("left");
              }}
            />
            <div
              className={`flex-1 rounded-r-md transition-colors ${splitSide === "right" ? "bg-accent/25" : "bg-transparent"}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setSplitSide("right");
              }}
              onDragLeave={() => setSplitSide(null)}
              onDrop={(e) => {
                e.preventDefault();
                setSplitSide(null);
                onSplitDrop("right");
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
