'use strict';

// func / sub definitions, register-name headers, and dotted local labels.
//
//   func applyDamage: player: Player @ r3, amount: i32 @ r4
//       lwz r5, player.health     // player -> r3, .health -> 0x10(r3)
//       subf r5, r4, r5           // amount -> r4
//   .clamp:                       // local label, scoped to applyDamage
//       cmpwi r5, 0
//       bge .store
//       li r5, 0
//   .store:
//       stw r5, player.health
//       blr
//
// grammar matches struct fields: `name : type @ where`, where is a register.
// a func scope runs from its func/sub line to the next func/sub (or EOF): its
// param names and its dotted locals belong to it, and clear at the next func.
//
// line-preserving so assembler errors still map. func/sub strip to a label,
// params resolve in the body, dotted locals get unique names per scope.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { collectTypes } = require('./struct-preprocessor.js');

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

// parse a `func name [@ addr]: params -> ret` header, or null if not one.
// the trailing `:` is what tells a func header apart from the `sub` mnemonic.
// an optional `@ addr` before the colon places the function at that address,
// mirroring `struct Name @ addr { ... }`.
function parseFuncHeader(code) {
  const m = code.match(/^\s*(func|sub)\s+([A-Za-z_]\w*)\s*(?:@\s*(0[xX][0-9a-fA-F]+|\d+)\s*)?:\s*(.*)$/i);
  if (!m) return null;
  const addr = m[3] || null;
  let rest = m[4].trim();
  let ret = null;
  const arrow = rest.indexOf('->');
  if (arrow >= 0) {
    ret = rest.slice(arrow + 2).trim() || null;
    rest = rest.slice(0, arrow).trim();
  }
  const params = [];
  if (rest) {
    for (const seg of rest.split(',')) {
      const pm = seg.trim().match(/^([A-Za-z_]\w*)\s*:\s*([A-Za-z_]\w*(?:\s*\[\s*\d+\s*\])?)\s*@\s*([A-Za-z]+\d+)$/);
      if (pm) params.push({ name: pm[1], type: pm[2].replace(/\s+/g, ''), reg: pm[3].toLowerCase() });
    }
  }
  return { keyword: m[1].toLowerCase(), name: m[2], addr, params, ret };
}

function localDefName(code) {
  const m = code.match(/^\s*\.([A-Za-z_]\w*)\s*:/);
  return m ? m[1] : null;
}

// a `global name: Type @ reg` binding, visible in every func
function parseGlobalDecl(code) {
  const m = code.match(/^\s*global\s+([A-Za-z_]\w*)\s*:\s*([A-Za-z_]\w*(?:\s*\[\s*\d+\s*\])?)\s*@\s*([A-Za-z]+\d+)\s*$/i);
  if (!m) return null;
  return { name: m[1], type: m[2].replace(/\s+/g, ''), reg: m[3].toLowerCase() };
}

// a `param name: Type @ reg` line, the body form of a func header param
function parseParamLine(code) {
  const m = code.match(/^\s*param\s+([A-Za-z_]\w*)\s*:\s*([A-Za-z_]\w*(?:\s*\[\s*\d+\s*\])?)\s*@\s*([A-Za-z]+\d+)\s*$/i);
  if (!m) return null;
  return { name: m[1], type: m[2].replace(/\s+/g, ''), reg: m[3].toLowerCase() };
}

// param may only appear at the top of a func/sub, before any instruction.
// returns the first offender, or ok.
function validateFuncs(text) {
  const lines = String(text || '').split('\n');
  let paramOk = false; // in a func's top region
  let inStruct = false;
  const errors = [];
  for (let i = 0; i < lines.length; i++) {
    const ci = findCommentIndex(lines[i]);
    const code = ci >= 0 ? lines[i].slice(0, ci) : lines[i];
    const codeTrim = code.trim();
    if (inStruct) {
      if (code.includes('}')) inStruct = false;
      paramOk = false;
      continue;
    }
    if (/^struct\b/i.test(codeTrim)) {
      const opens = (code.match(/\{/g) || []).length;
      const closes = (code.match(/\}/g) || []).length;
      if (opens > closes) inStruct = true;
      paramOk = false;
      continue;
    }
    if (parseFuncHeader(codeTrim)) { paramOk = true; continue; }
    if (parseParamLine(codeTrim)) {
      if (!paramOk) {
        const col = code.length - code.replace(/^\s+/, '').length; // indent = start of "param"
        errors.push({ message: 'param must be at the top of a func/sub, before any instruction', line: i + 1, col, length: 5 });
      }
      continue;
    }
    if (codeTrim) paramOk = false; // any real line ends the param region
  }
  if (errors.length) return { ok: false, message: errors[0].message, line: errors[0].line, col: errors[0].col, length: errors[0].length, errors };
  return { ok: true };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// strip func/sub headers, resolve their register params in the body, and give
// each scope's dotted locals unique global names. extraTypeText seeds imported
// struct types so typed params (`p: ImportedType @ r3`) resolve too.
function preprocessFuncs(fullText, extraTypeText) {
  const text = String(fullText || '');
  const { types } = collectTypes(extraTypeText ? `${text}\n${extraTypeText}` : text);
  const lines = text.split('\n');

  // pass 1: split into scopes (scope 0 = the top region before any func).
  // collect each scope's params, its dotted locals, and the file's globals.
  const scopeOf = new Array(lines.length).fill(0);
  const scopes = [{ params: new Map(), locals: new Map() }];
  const globals = new Map();
  let cur = 0;
  let inStruct = false;
  let localCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const ci = findCommentIndex(lines[i]);
    const code = ci >= 0 ? lines[i].slice(0, ci) : lines[i];
    const codeTrim = code.trim();

    if (inStruct) {
      scopeOf[i] = cur;
      if (code.includes('}')) inStruct = false;
      continue;
    }
    if (/^struct\b/i.test(codeTrim)) {
      const opens = (code.match(/\{/g) || []).length;
      const closes = (code.match(/\}/g) || []).length;
      if (opens > closes) inStruct = true;
      scopeOf[i] = cur;
      continue;
    }

    const gd = parseGlobalDecl(codeTrim);
    if (gd) {
      globals.set(gd.name, gd);
      scopeOf[i] = cur;
      continue;
    }

    const fh = parseFuncHeader(codeTrim);
    if (fh) {
      const params = new Map();
      for (const p of fh.params) params.set(p.name, p);
      scopes.push({ params, locals: new Map() });
      cur = scopes.length - 1;
      scopeOf[i] = cur;
      continue;
    }

    const pm = parseParamLine(codeTrim);
    if (pm) {
      scopes[cur].params.set(pm.name, pm);
      scopeOf[i] = cur;
      continue;
    }

    scopeOf[i] = cur;
    const loc = localDefName(codeTrim);
    if (loc && !scopes[cur].locals.has(loc)) {
      scopes[cur].locals.set(loc, `__loc${localCount++}__`);
    }
  }

  // pass 2: rewrite. one output line per input line.
  inStruct = false;
  const out = lines.map((line, i) => {
    const ci = findCommentIndex(line);
    const code = ci >= 0 ? line.slice(0, ci) : line;
    const comment = ci >= 0 ? line.slice(ci) : '';
    const codeTrim = code.trim();
    const scope = scopes[scopeOf[i]];

    if (inStruct) {
      if (code.includes('}')) inStruct = false;
      return line;
    }
    if (/^struct\b/i.test(codeTrim)) {
      const opens = (code.match(/\{/g) || []).length;
      const closes = (code.match(/\}/g) || []).length;
      if (opens > closes) inStruct = true;
      return line;
    }

    // func/sub header -> plain label, dropping the register signature.
    // an inline address becomes `address <addr> <name>`, one line, so the
    // assembler places the code there and binds the label in one shot.
    const fh = parseFuncHeader(codeTrim);
    if (fh) {
      if (fh.addr) return `address ${fh.addr} ${fh.name}${comment ? ' ' + comment : ''}`;
      return `${fh.name}:${comment ? ' ' + comment : ''}`;
    }

    // global / param decls emit nothing, strip them (keep the line for mapping)
    if (parseGlobalDecl(codeTrim) || parseParamLine(codeTrim)) return comment;

    let c = code;

    // dotted locals first (defs + refs), so param substitution can't touch them.
    // a leading dot with no identifier before it is a local; owner.field is not.
    c = c.replace(/(?<![\w.$])\.([A-Za-z_]\w*)/g, (m, nm) =>
      scope.locals.has(nm) ? scope.locals.get(nm) : m
    );

    // params shadow globals, so resolve them first. field access then bare name.
    for (const p of [...scope.params.values(), ...globals.values()]) {
      if (types.has(p.type)) {
        const t = types.get(p.type);
        c = c.replace(new RegExp(`\\b${escapeRe(p.name)}\\.([A-Za-z_]\\w*)\\b`, 'g'), (m, fld) =>
          t.fields.has(fld) ? `${t.fields.get(fld).offset}(${p.reg})` : m
        );
      }
      c = c.replace(new RegExp(`\\b${escapeRe(p.name)}\\b`, 'g'), p.reg);
    }

    return c + comment;
  });

  return out.join('\n');
}

// reverse of the local renaming: __locN__ -> .name. mirrors pass 1's numbering
function localRenameMap(fullText) {
  const lines = String(fullText || '').split('\n');
  const map = new Map();
  const scopeLocals = [new Set()];
  let cur = 0;
  let inStruct = false;
  let localCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const ci = findCommentIndex(lines[i]);
    const code = ci >= 0 ? lines[i].slice(0, ci) : lines[i];
    const codeTrim = code.trim();
    if (inStruct) {
      if (code.includes('}')) inStruct = false;
      continue;
    }
    if (/^struct\b/i.test(codeTrim)) {
      const opens = (code.match(/\{/g) || []).length;
      const closes = (code.match(/\}/g) || []).length;
      if (opens > closes) inStruct = true;
      continue;
    }
    if (parseGlobalDecl(codeTrim)) continue;
    if (parseFuncHeader(codeTrim)) {
      scopeLocals.push(new Set());
      cur = scopeLocals.length - 1;
      continue;
    }
    if (parseParamLine(codeTrim)) continue;
    const loc = localDefName(codeTrim);
    if (loc && !scopeLocals[cur].has(loc)) {
      scopeLocals[cur].add(loc);
      map.set(`__loc${localCount++}__`, `.${loc}`);
    }
  }
  return map;
}

// func signatures for the outline / hover, in source order.
function parseFuncs(text) {
  const lines = String(text || '').split('\n');
  const funcs = [];
  let inStruct = false;
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const ci = findCommentIndex(lines[i]);
    const code = ci >= 0 ? lines[i].slice(0, ci) : lines[i];
    const codeTrim = code.trim();
    if (inStruct) {
      if (code.includes('}')) inStruct = false;
      continue;
    }
    if (/^struct\b/i.test(codeTrim)) {
      const opens = (code.match(/\{/g) || []).length;
      const closes = (code.match(/\}/g) || []).length;
      if (opens > closes) inStruct = true;
      continue;
    }
    const fh = parseFuncHeader(codeTrim);
    if (fh) {
      cur = { name: fh.name, params: [...fh.params], ret: fh.ret, addr: fh.addr, locals: [], line: i + 1 };
      funcs.push(cur);
      continue;
    }
    const pm = parseParamLine(codeTrim);
    if (pm && cur) {
      if (!cur.params.some((p) => p.name === pm.name)) cur.params.push(pm);
      continue;
    }
    const loc = localDefName(codeTrim);
    if (loc && cur && !cur.locals.includes(loc)) cur.locals.push(loc);
  }
  return funcs;
}

// global bindings for the panel
function parseGlobals(text) {
  const lines = String(text || '').split('\n');
  const out = [];
  let inStruct = false;
  for (const line of lines) {
    const ci = findCommentIndex(line);
    const code = ci >= 0 ? line.slice(0, ci) : line;
    const codeTrim = code.trim();
    if (inStruct) {
      if (code.includes('}')) inStruct = false;
      continue;
    }
    if (/^struct\b/i.test(codeTrim)) {
      const opens = (code.match(/\{/g) || []).length;
      const closes = (code.match(/\}/g) || []).length;
      if (opens > closes) inStruct = true;
      continue;
    }
    const gd = parseGlobalDecl(codeTrim);
    if (gd) out.push({ name: gd.name, type: gd.type, reg: gd.reg });
  }
  return out;
}

module.exports = { preprocessFuncs, localRenameMap, parseFuncs, parseFuncHeader, parseGlobals, validateFuncs };
