'use strict';

// cross-file imports. `import combat` pulls in what a saved file exports,
// never its code bytes: struct types, register aliases, and function labels.
// a `bl otherFunc` only resolves if that file sets its own `address`.
// line-preserving: import lines comment out, label refs swap to their address
// in place, so error lines still map.

const { makeAssembler } = require('./ppc_assembler.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { preprocessFuncs } = require('./func-preprocessor.js');

function findCommentIndex(line) {
  const idxs = [];
  const a = line.indexOf('//');
  if (a >= 0) idxs.push(a);
  const b = line.indexOf('#');
  if (b >= 0) idxs.push(b);
  const c = line.indexOf(';');
  if (c >= 0) idxs.push(c);
  return idxs.length ? Math.min(...idxs) : -1;
}

function codeOf(line) {
  const ci = findCommentIndex(line);
  return ci >= 0 ? line.slice(0, ci) : line;
}

// `import X` / `import "X"` names, with the line each sits on (1-based)
function parseImports(text) {
  const out = [];
  const lines = String(text || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = codeOf(lines[i]).trim().match(/^import\s+(?:"([^"]+)"|(\S+))\s*$/i);
    if (m) out.push({ name: m[1] || m[2], line: i + 1 });
  }
  return out;
}

// label -> absolute address via the assembler's first pass.
// func/sub headers desugar to labels first (an inline `@ addr` becomes an
// address directive), so imported functions resolve as call targets.
// hasAddr false means no `address` set, so labels are not real call targets.
function fileLabels(src) {
  let pre;
  try {
    pre = preprocessFuncs(String(src));
  } catch {
    pre = String(src);
  }
  const hasAddr = /^\s*address\b/im.test(pre);
  const a = makeAssembler();
  try {
    a.scanLabels(pre.split(/\r?\n/));
  } catch {
    return { labels: new Map(), hasAddr };
  }
  return { labels: new Map(a.labels), hasAddr };
}

// a file's definitions: struct blocks and plain register aliases
function fileDefs(src) {
  const structText = (String(src).match(/struct\s+[A-Za-z_]\w*\s*(?:@\s*(?:0[xX][0-9a-fA-F]+|\d+)\s*)?(?:packed\s*)?\{[\s\S]*?\}/g) || []).join('\n');
  const aliases = [];
  for (const line of String(src).split('\n')) {
    const code = codeOf(line).trim();
    if (/\bas\b/i.test(code)) continue; // typed instance set, stays with its file
    const m = code.match(/^set\s+(r\d+)\s*,\s*([A-Za-z_.$][\w.$]*)\s*$/i);
    if (m) aliases.push({ reg: m[1].toLowerCase(), name: m[2] });
    const m2 = code.match(/^set\s+([A-Za-z_.$][\w.$]*)\s*,\s*(r\d+)\s*$/i);
    if (m2) aliases.push({ reg: m2[2].toLowerCase(), name: m2[1] });
  }
  return { structText, aliases };
}

// resolve every import in `text`. loadFile(name) returns the file's source or
// null if it does not exist. returns the pieces the assemble pipeline needs.
function resolveImports(text, loadFile, opts) {
  const maxDepth = (opts && opts.maxDepth) || 8;
  const visited = new Set();
  const missing = [];
  const noAddress = new Set();
  const labels = new Map(); // name -> { addr, from, hasAddr }
  const aliases = [];
  let structText = '';

  function walk(name, depth) {
    if (visited.has(name) || depth > maxDepth) return;
    visited.add(name);
    const src = loadFile(name);
    if (src == null) return; // missing handled at the top level below
    const fl = fileLabels(src);
    if (fl.labels.size > 0 && !fl.hasAddr) noAddress.add(name);
    for (const [k, v] of fl.labels) if (!labels.has(k)) labels.set(k, { addr: v, from: name, hasAddr: fl.hasAddr });
    const defs = fileDefs(src);
    if (defs.structText) structText += (structText ? '\n' : '') + defs.structText;
    for (const a of defs.aliases) aliases.push(a);
    for (const dep of parseImports(src)) walk(dep.name, depth + 1);
  }

  for (const imp of parseImports(text)) {
    if (loadFile(imp.name) == null) missing.push(imp);
    else walk(imp.name, 1);
  }

  // local labels win, never rewrite a name the current file defines itself
  const local = fileLabels(text).labels;

  const lines = text.split('\n');
  const out = lines.map((line) => {
    const ci = findCommentIndex(line);
    const code = ci >= 0 ? line.slice(0, ci) : line;
    const comment = ci >= 0 ? line.slice(ci) : '';
    const trimmed = code.trim();
    // comment out import lines, the backend does not need them
    if (/^import\b/i.test(trimmed)) return '# ' + line;
    // leave definitions and directives alone
    if (/^(struct|set|unset|clearset)\b/i.test(trimmed)) return line;

    const toks = code.split(/(\s+|,|\(|\)|\[|\]|\+|-)/);
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (!t || /^\s+$/.test(t)) continue;
      if (labels.has(t) && !local.has(t)) {
        const info = labels.get(t);
        if (info.hasAddr) toks[i] = '0x' + (info.addr >>> 0).toString(16);
      }
    }
    return toks.join('') + comment;
  });

  return {
    text: out.join('\n'),
    structText,
    aliasSeed: aliases,
    labels,
    missing,
    noAddress: [...noAddress],
  };
}

module.exports = { resolveImports, parseImports, fileLabels, fileDefs };
