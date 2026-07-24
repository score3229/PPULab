'use strict';

// call graph: funcs are nodes, a bl to another func is an edge.
// built from source, before imports lower names to addresses.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseFuncs } = require('./func-preprocessor.js');

function stripComment(line) {
  const idxs = [line.indexOf('//'), line.indexOf('#'), line.indexOf(';')].filter((i) => i >= 0);
  const i = idxs.length ? Math.min(...idxs) : -1;
  return i >= 0 ? line.slice(0, i) : line;
}

function parseAddr(s) {
  const t = String(s).trim();
  if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t.slice(2), 16) >>> 0;
  if (/^\d+$/.test(t)) return parseInt(t, 10) >>> 0;
  return null;
}

function paramSig(params) {
  if (!params.length) return undefined;
  return params.map((p) => p.name).join(', ');
}

// register/link-indirect branches have no direct target
const INDIRECT = new Set(['blr', 'blrl', 'bctr', 'bctrl', 'bcctr', 'bclr', 'bclrl']);

// pull the target off a branch/call line. target is the last operand (skips a
// leading cr field on conditionals). isCall marks bl/bla.
function branchTarget(code) {
  const m = code.match(/^\s*(b[a-z]*[+-]?)\s+(.+)$/i);
  if (!m) return null;
  const mn = m[1].toLowerCase().replace(/[+-]$/, '');
  if (INDIRECT.has(mn)) return null;
  const ops = m[2].split(',').map((s) => s.trim()).filter(Boolean);
  const target = ops[ops.length - 1];
  return target ? { target, isCall: mn === 'bl' || mn === 'bla' } : null;
}

// text -> { nodes, edges }. importedFrom maps an imported func name to the file
// it came from, so cross-file calls resolve to a tagged node.
function buildCallGraph(text, importedFrom) {
  const funcs = parseFuncs(text);
  if (!funcs.length) return { nodes: [], edges: [] };

  const lines = String(text).split('\n');
  const byName = new Map(funcs.map((f) => [f.name, f]));
  const byAddr = new Map();
  for (const f of funcs) {
    const a = f.addr ? parseAddr(f.addr) : null;
    if (a != null) byAddr.set(a, f);
  }

  const nodes = new Map();
  const localId = (name) => `fn:${name}`;
  for (const f of funcs) {
    nodes.set(localId(f.name), { id: localId(f.name), label: f.name, kind: 'local', sub: paramSig(f.params), line: f.line });
  }

  const seen = new Set();
  const edges = [];
  const addEdge = (from, to) => {
    if (from === to) return;
    const id = `${from}::${to}`;
    if (seen.has(id)) return;
    seen.add(id);
    edges.push({ id, from, to });
  };

  // known funcs (local or imported) always edge. a plain branch to a local
  // label or raw address stays intra-function, so only bl/bla reach those.
  const resolve = (target, isCall) => {
    const name = target.replace(/,+$/, '').trim();
    if (!name) return null;
    if (byName.has(name)) return localId(name);
    const addr = parseAddr(name);
    if (addr != null) {
      const lf = byAddr.get(addr);
      if (lf) return localId(lf.name);
      if (!isCall) return null;
      const id = `addr:${addr}`;
      if (!nodes.has(id)) nodes.set(id, { id, label: `0x${addr.toString(16).toUpperCase()}`, kind: 'external', sub: 'game func' });
      return id;
    }
    if (importedFrom && importedFrom.has(name)) {
      const id = `imp:${name}`;
      if (!nodes.has(id)) nodes.set(id, { id, label: name, kind: 'imported', sub: `from ${importedFrom.get(name)}` });
      return id;
    }
    if (!isCall) return null;
    const id = `ext:${name}`;
    if (!nodes.has(id)) nodes.set(id, { id, label: name, kind: 'external' });
    return id;
  };

  const sorted = [...funcs].sort((a, b) => a.line - b.line);
  for (let i = 0; i < sorted.length; i++) {
    const f = sorted[i];
    const end = i + 1 < sorted.length ? sorted[i + 1].line : lines.length + 1;
    const fromId = localId(f.name);
    for (let ln = f.line; ln < end; ln++) {
      const bt = branchTarget(stripComment(lines[ln - 1] || ''));
      if (!bt) continue;
      const to = resolve(bt.target, bt.isCall);
      if (to) addEdge(fromId, to);
    }
  }

  // a local func nobody calls is an entry point
  const incoming = new Set(edges.map((e) => e.to));
  for (const n of nodes.values()) {
    if (n.kind === 'local' && !incoming.has(n.id)) n.kind = 'entry';
  }

  return { nodes: [...nodes.values()], edges };
}

module.exports = { buildCallGraph };
