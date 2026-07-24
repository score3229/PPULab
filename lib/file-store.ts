// storage layer for saved subroutines, drafts, and settings.
// localStorage keys and shapes are load-bearing. do not rename or reformat.

const LS_FILES = "ps3_ppu_lab:files";
// folder organization for the files rail. a separate additive key: file names
// (the identity everything else uses) never change, this only groups them.
const LS_FOLDERS = "ps3_ppu_lab:folders";
const LS_LAST_OPEN = "ps3_ppu_lab:lastOpen";
const LS_OUT_FMT = "ps3_ppu_lab:outFmt";
const LS_LAYOUT = "ps3_ppu_lab:layout";
const LS_DRAFT_PREFIX = "ps3_ppu_lab_draft:";
const LS_DRAFT_UNSAVED = "ps3_ppu_lab_draft:(unsaved)";
// unsaved throwaway buffers keyed by tab id, own namespace so a file draft and
// a buffer can never collide. cleared when the buffer tab is closed or saved.
const LS_BUFFER_PREFIX = "ps3_ppu_lab:buf:";

export interface FileEntry {
  asm: string;
  updatedAt: number;
}

// whole files object: { name: { asm, updatedAt } }
export function loadFiles(): Record<string, FileEntry> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(LS_FILES) || "{}") || {};
  } catch {
    return {};
  }
}

function writeFiles(obj: Record<string, FileEntry>) {
  localStorage.setItem(LS_FILES, JSON.stringify(obj));
}

// sorted list of saved names
export function listNames(): string[] {
  return Object.keys(loadFiles()).sort((a, b) => a.localeCompare(b));
}

export function getFile(name: string): FileEntry | null {
  return loadFiles()[name] || null;
}

// save one file without touching the others
export function saveFile(name: string, asm: string) {
  const files = loadFiles();
  files[name] = { asm, updatedAt: Date.now() };
  writeFiles(files);
  setDraft(name, asm);
}

// write a file directly, preserving a given timestamp (used by import).
// additive, never touches other entries.
export function putFile(name: string, asm: string, updatedAt?: number) {
  const files = loadFiles();
  files[name] = { asm, updatedAt: typeof updatedAt === "number" ? updatedAt : Date.now() };
  writeFiles(files);
  setDraft(name, asm);
}

export function deleteFile(name: string) {
  const files = loadFiles();
  delete files[name];
  writeFiles(files);
  clearDraft(name);
  // drop any folder assignment so it never lingers as an orphan
  const s = loadFolderState();
  if (s.assign[name] !== undefined) {
    delete s.assign[name];
    writeFolderState(s);
  }
}

// per-file draft key; unsaved work uses the sentinel key
export function draftKey(name: string): string {
  const n = (name || "").trim();
  return n ? LS_DRAFT_PREFIX + n : LS_DRAFT_UNSAVED;
}

export function getDraft(name: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(draftKey(name));
}

export function setDraft(name: string, text: string) {
  localStorage.setItem(draftKey(name), text);
}

export function clearDraft(name: string) {
  localStorage.removeItem(draftKey(name));
}

// unsaved throwaway buffer text, keyed by tab id (see LS_BUFFER_PREFIX)
export function getBuffer(id: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LS_BUFFER_PREFIX + id);
}

export function setBuffer(id: string, text: string) {
  localStorage.setItem(LS_BUFFER_PREFIX + id, text);
}

export function clearBuffer(id: string) {
  localStorage.removeItem(LS_BUFFER_PREFIX + id);
}

// last opened file name
export function getLastOpen(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(LS_LAST_OPEN) || "";
}

export function setLastOpen(name: string) {
  localStorage.setItem(LS_LAST_OPEN, name);
}

// selected output format
export function getOutFmt(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LS_OUT_FMT);
}

export function setOutFmt(fmt: string) {
  localStorage.setItem(LS_OUT_FMT, fmt);
}

// open-tab layout for the next session: which tabs are open, their order, the
// active tab per group, and the split. its own key, never touches files/drafts.
export interface LayoutTab {
  id: string;
  file: string | null;
  n?: number;
}

export interface LayoutGroup {
  tabs: LayoutTab[];
  active: string; // active tab id
}

export interface Layout {
  groups: LayoutGroup[];
  activeGroupIndex: number;
  splitRatio: number;
}

export function getLayout(): Layout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_LAYOUT);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || !Array.isArray(v.groups)) return null;
    return v as Layout;
  } catch {
    return null;
  }
}

export function setLayout(layout: Layout) {
  try {
    localStorage.setItem(LS_LAYOUT, JSON.stringify(layout));
  } catch {
    // storage full or blocked, layout memory is best-effort
  }
}

// ---- folders (files rail organization) --------------------------------------
// assign maps a file name to a folder path ("" or missing = root). dirs holds
// every known folder, including empty ones. collapsed remembers fold state.
export interface FolderState {
  assign: Record<string, string>;
  dirs: string[];
  collapsed: string[];
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function loadFolderState(): FolderState {
  if (typeof window === "undefined") return { assign: {}, dirs: [], collapsed: [] };
  try {
    const v = JSON.parse(localStorage.getItem(LS_FOLDERS) || "{}") || {};
    const assign: Record<string, string> = {};
    if (v.assign && typeof v.assign === "object") {
      for (const [k, val] of Object.entries(v.assign)) if (typeof val === "string") assign[k] = val;
    }
    return { assign, dirs: strArray(v.dirs), collapsed: strArray(v.collapsed) };
  } catch {
    return { assign: {}, dirs: [], collapsed: [] };
  }
}

function writeFolderState(s: FolderState) {
  try {
    localStorage.setItem(LS_FOLDERS, JSON.stringify(s));
  } catch {
    // best effort, folders are non-critical
  }
}

// tidy a folder path: trim segments, drop empties, no leading/trailing slash
export function normFolder(path: string): string {
  return String(path || "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("/");
}

// make sure a path and all of its ancestors are recorded in dirs
function ensureDirs(s: FolderState, path: string) {
  const parts = path.split("/");
  let cur = "";
  for (const p of parts) {
    cur = cur ? `${cur}/${p}` : p;
    if (!s.dirs.includes(cur)) s.dirs.push(cur);
  }
}

// move a file into a folder ("" = root). creates the folder if it is new.
export function setFileFolder(name: string, folder: string) {
  const s = loadFolderState();
  const f = normFolder(folder);
  if (f) {
    s.assign[name] = f;
    ensureDirs(s, f);
  } else {
    delete s.assign[name];
  }
  writeFolderState(s);
}

// create an empty folder up front
export function createFolder(path: string) {
  const f = normFolder(path);
  if (!f) return;
  const s = loadFolderState();
  ensureDirs(s, f);
  writeFolderState(s);
}

// rename a folder and everything nested under it
export function renameFolder(oldPath: string, newPath: string) {
  const from = normFolder(oldPath);
  const to = normFolder(newPath);
  if (!from || !to || from === to) return;
  const s = loadFolderState();
  const move = (p: string) => (p === from ? to : p.startsWith(from + "/") ? to + p.slice(from.length) : p);
  s.dirs = Array.from(new Set(s.dirs.map(move)));
  for (const name of Object.keys(s.assign)) s.assign[name] = move(s.assign[name]);
  s.collapsed = Array.from(new Set(s.collapsed.map(move)));
  ensureDirs(s, to);
  writeFolderState(s);
}

// remove a folder and its subfolders; the files inside fall back to root
export function removeFolder(path: string) {
  const p = normFolder(path);
  if (!p) return;
  const s = loadFolderState();
  const under = (x: string) => x === p || x.startsWith(p + "/");
  s.dirs = s.dirs.filter((d) => !under(d));
  s.collapsed = s.collapsed.filter((d) => !under(d));
  for (const name of Object.keys(s.assign)) if (under(s.assign[name])) delete s.assign[name];
  writeFolderState(s);
}

export function toggleFolderCollapsed(path: string) {
  const p = normFolder(path);
  if (!p) return;
  const s = loadFolderState();
  const i = s.collapsed.indexOf(p);
  if (i >= 0) s.collapsed.splice(i, 1);
  else s.collapsed.push(p);
  writeFolderState(s);
}
