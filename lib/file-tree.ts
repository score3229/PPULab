// pure helpers that turn the flat file list + folder assignments into a tree
// for the files rail. no storage here, just shaping data.

import type { FolderState } from "@/lib/file-store";

export interface TreeFolder {
  path: string; // full path, e.g. "Skyrim/patches"
  name: string; // last segment, e.g. "patches"
  folders: TreeFolder[];
  files: string[];
}

export interface FileTree {
  root: string[]; // files with no folder
  folders: TreeFolder[]; // top-level folders
}

// add a path and every ancestor prefix to a set
function addWithAncestors(set: Set<string>, path: string) {
  if (!path) return;
  const parts = path.split("/");
  let cur = "";
  for (const seg of parts) {
    cur = cur ? `${cur}/${seg}` : seg;
    set.add(cur);
  }
}

// every folder path in play, from explicit dirs and from file assignments
function collectPaths(names: string[], state: FolderState): Set<string> {
  const paths = new Set<string>();
  for (const d of state.dirs) addWithAncestors(paths, d);
  for (const name of names) addWithAncestors(paths, state.assign[name] || "");
  return paths;
}

export function buildFileTree(names: string[], state: FolderState): FileTree {
  const paths = collectPaths(names, state);

  const nodes = new Map<string, TreeFolder>();
  for (const p of paths) {
    nodes.set(p, { path: p, name: p.slice(p.lastIndexOf("/") + 1), folders: [], files: [] });
  }

  const topFolders: TreeFolder[] = [];
  for (const p of paths) {
    const node = nodes.get(p)!;
    const slash = p.lastIndexOf("/");
    const parent = slash === -1 ? null : nodes.get(p.slice(0, slash));
    if (parent) parent.folders.push(node);
    else topFolders.push(node);
  }

  const root: string[] = [];
  for (const name of names) {
    const folder = state.assign[name] || "";
    const node = folder ? nodes.get(folder) : null;
    if (node) node.files.push(name);
    else root.push(name);
  }

  const cmp = (a: string, b: string) => a.localeCompare(b);
  const sortNode = (n: TreeFolder) => {
    n.folders.sort((a, b) => cmp(a.name, b.name));
    n.files.sort(cmp);
    n.folders.forEach(sortNode);
  };
  topFolders.sort((a, b) => cmp(a.name, b.name));
  topFolders.forEach(sortNode);
  root.sort(cmp);

  return { root, folders: topFolders };
}

// flat, sorted list of all folder paths, for the "move to" menu
export function allFolderPaths(names: string[], state: FolderState): string[] {
  return Array.from(collectPaths(names, state)).sort((a, b) => a.localeCompare(b));
}
