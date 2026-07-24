// tab model + all tab-scoped storage. a tab is an open editor, its identity is
// a stable opaque id, separate from the file it holds. file === null means an
// unsaved buffer. one place owns which localStorage key backs each tab so the
// rest of the app never sniffs names or touches draft keys directly.

import * as store from "./file-store";

// the one reserved id: the durable "(unsaved)" scratch shown in the files rail.
// its text lives in the `(unsaved)` draft key so it survives sessions.
export const SCRATCH_ID = "scratch";

export interface TabModel {
  id: string; // stable, unique within a session
  file: string | null; // saved file name, or null for an unsaved buffer
  n?: number; // display index for throwaway untitled buffers (untitled-N)
}

export function isScratch(tab: TabModel): boolean {
  return tab.file == null && tab.id === SCRATCH_ID;
}

// a throwaway buffer: unsaved and not the durable scratch. discarded on close.
export function isBuffer(tab: TabModel): boolean {
  return tab.file == null && tab.id !== SCRATCH_ID;
}

export function tabLabel(tab: TabModel): string {
  if (tab.file != null) return tab.file;
  if (tab.id === SCRATCH_ID) return "untitled";
  return tab.n ? `untitled-${tab.n}` : "untitled";
}

// text to show when the tab becomes active: live draft first, saved asm second
export function loadTabText(tab: TabModel): string {
  if (tab.file != null) {
    const d = store.getDraft(tab.file);
    if (typeof d === "string" && d.length) return d;
    return store.getFile(tab.file)?.asm || "";
  }
  if (tab.id === SCRATCH_ID) return store.getDraft("") || "";
  return store.getBuffer(tab.id) || "";
}

// persist the working text for a tab to its own key, never any other tab's
export function saveTabDraft(tab: TabModel, text: string): void {
  if (tab.file != null) store.setDraft(tab.file, text);
  else if (tab.id === SCRATCH_ID) store.setDraft("", text);
  else store.setBuffer(tab.id, text);
}

// drop a tab's working text. only throwaway buffers are discarded: saved files
// keep their draft for reopening, the scratch keeps its persistent text.
export function discardTabDraft(tab: TabModel): void {
  if (isBuffer(tab)) store.clearBuffer(tab.id);
}

// tab shows a dirty dot when its text differs from what is saved on disk
export function tabDirty(tab: TabModel): boolean {
  if (tab.file != null) {
    const saved = store.getFile(tab.file)?.asm ?? "";
    const d = store.getDraft(tab.file);
    return (d ?? saved) !== saved;
  }
  if (tab.id === SCRATCH_ID) return false; // scratch carries no dot, matches ""
  return (store.getBuffer(tab.id) ?? "") !== "";
}
