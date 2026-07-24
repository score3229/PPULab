// export / import the saved function library to a file.
// export writes a json bundle. import merges additively, collisions are the
// user's call, never wipes.

import * as store from "@/lib/file-store";
import type { FileEntry } from "@/lib/file-store";

export const LIBRARY_FORMAT = "ppulab-library";
export const LIBRARY_VERSION = 2;

export interface LibraryBundle {
  format: string;
  version: number;
  exportedAt: number;
  files: Record<string, FileEntry>;
  // v2+: optional file name -> folder path map. older readers ignore it, and
  // v1 bundles arrive with everything at the root.
  folders?: Record<string, string>;
}

function download(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function datestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// download the whole library as json, returns how many files went out
export function exportLibrary(): number {
  const files = store.loadFiles();
  const state = store.loadFolderState();
  // carry only the assignments for files being exported
  const folders: Record<string, string> = {};
  for (const name of Object.keys(files)) if (state.assign[name]) folders[name] = state.assign[name];
  const bundle: LibraryBundle = {
    format: LIBRARY_FORMAT,
    version: LIBRARY_VERSION,
    exportedAt: Date.now(),
    files,
    ...(Object.keys(folders).length ? { folders } : {}),
  };
  download(`ppulab-library-${datestamp()}.json`, JSON.stringify(bundle, null, 2), "application/json");
  return Object.keys(files).length;
}

// download a single function as raw asm, easy to share and re-import
export function exportFile(name: string, asm: string) {
  const safe = (name || "untitled").replace(/[^\w.\-]+/g, "_");
  download(`${safe}.s`, asm, "text/plain");
}

export type ParsedImport =
  | { kind: "files"; files: Record<string, FileEntry>; folders?: Record<string, string> }
  | { kind: "error"; message: string };

// read a chosen file into a name -> entry map. accepts the library json or a
// lone .s asm file (imported under its filename).
export async function readImportFile(file: File): Promise<ParsedImport> {
  const text = await file.text();
  const looksJson = file.name.toLowerCase().endsWith(".json") || /^\s*\{/.test(text);

  if (looksJson) {
    let obj: unknown;
    try {
      obj = JSON.parse(text);
    } catch {
      return { kind: "error", message: "not valid json" };
    }
    const bundle = obj as Partial<LibraryBundle>;
    if (!bundle || bundle.format !== LIBRARY_FORMAT || !bundle.files || typeof bundle.files !== "object") {
      return { kind: "error", message: "not a ppulab library file" };
    }
    const files: Record<string, FileEntry> = {};
    for (const [name, v] of Object.entries(bundle.files as Record<string, FileEntry>)) {
      if (name && v && typeof v.asm === "string") {
        files[name] = { asm: v.asm, updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : Date.now() };
      }
    }
    if (Object.keys(files).length === 0) return { kind: "error", message: "no functions in that file" };
    // optional folder assignments (v2+), only for files present in the bundle
    let folders: Record<string, string> | undefined;
    if (bundle.folders && typeof bundle.folders === "object") {
      folders = {};
      for (const [name, path] of Object.entries(bundle.folders)) {
        if (files[name] && typeof path === "string" && path) folders[name] = path;
      }
    }
    return { kind: "files", files, folders };
  }

  // plain asm -> a single file named after the source file
  const base = file.name.replace(/\.[^.]+$/, "").trim() || "imported";
  return { kind: "files", files: { [base]: { asm: text, updatedAt: Date.now() } } };
}

// split incoming names into new vs already-present
export function planImport(files: Record<string, FileEntry>): { fresh: string[]; existing: string[] } {
  const have = new Set(store.listNames());
  const fresh: string[] = [];
  const existing: string[] = [];
  for (const name of Object.keys(files)) (have.has(name) ? existing : fresh).push(name);
  return { fresh, existing };
}

export interface ImportSummary {
  added: number;
  overwritten: number;
  skipped: number;
}

// merge into the library. new names added, collisions replaced only if overwrite.
// folders (optional) apply to the files written.
export function applyImport(
  files: Record<string, FileEntry>,
  overwriteExisting: boolean,
  folders?: Record<string, string>
): ImportSummary {
  const have = new Set(store.listNames());
  const summary: ImportSummary = { added: 0, overwritten: 0, skipped: 0 };
  for (const [name, entry] of Object.entries(files)) {
    if (!name) continue;
    let wrote = false;
    if (have.has(name)) {
      if (overwriteExisting) {
        store.putFile(name, entry.asm, entry.updatedAt);
        summary.overwritten++;
        wrote = true;
      } else {
        summary.skipped++;
      }
    } else {
      store.putFile(name, entry.asm, entry.updatedAt);
      summary.added++;
      wrote = true;
    }
    if (wrote && folders && folders[name]) store.setFileFolder(name, folders[name]);
  }
  return summary;
}
