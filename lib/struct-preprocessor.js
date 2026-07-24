'use strict';

// struct directives. name a memory layout with typed fields, reference offsets.
//
//   struct Player @ 0x016C7C30 {
//     name   : string[16]
//     health : i32
//   }
//   set r3, player as Player
//   player.health  -> 0x10(r3)   // typed instance, offset + base reg
//   Player.health  -> 0x10       // bare type, offset only
//
// field is `name [: type] [@ offset]`. type sets the size, @ overrides.
// runs before the alias pass. defs comment out in place so line numbers hold.

// field type -> byte size on the ps3 ppu (big endian, 64 bit)
const TYPE_SIZE = {
  i8: 1, u8: 1, s8: 1, byte: 1, bool: 1, char: 1,
  i16: 2, u16: 2, s16: 2, short: 2, half: 2,
  i32: 4, u32: 4, s32: 4, int: 4, word: 4, f32: 4, float: 4,
  i64: 8, u64: 8, s64: 8, long: 8, f64: 8, double: 8, ptr: 8, pointer: 8,
  vec: 16, vector: 16, u128: 16, qword: 16,
};

function parseNum(str) {
  const s = String(str).trim();
  if (/^0[xX]/.test(s)) return parseInt(s.slice(2), 16);
  return parseInt(s, 10);
}

function hex(n) {
  return "0x" + (n >>> 0).toString(16);
}

function alignUp(x, a) {
  return a <= 1 ? x : Math.ceil(x / a) * a;
}

// size + alignment for a field type string ("i32", "string[16]", or null)
function typeInfo(typeStr) {
  if (!typeStr) return { size: 4, align: 4, type: null };
  const arr = typeStr.match(/^(string|char|bytes)\s*\[\s*(\d+)\s*\]$/i);
  if (arr) return { size: parseInt(arr[2], 10) || 0, align: 1, type: `${arr[1].toLowerCase()}[${arr[2]}]` };
  const key = typeStr.toLowerCase();
  const size = TYPE_SIZE[key];
  if (size == null) return { size: 4, align: 4, type: key }; // unknown, treat as a word
  return { size, align: size >= 16 ? 16 : size, type: key };
}

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

function isGpr(tok) {
  return /^r([0-9]|[12][0-9]|3[01])$/i.test(tok);
}

function isIdent(tok) {
  return /^[A-Za-z_]\w*$/.test(tok);
}

// split a struct body into field segments on newlines and commas, but keep
// commas that sit inside a quoted string value (name : string[8] = "a, b").
function splitFields(body) {
  const segs = [];
  let cur = '';
  let q = null;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (q) {
      cur += c;
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '\n' || c === ',') { segs.push(cur); cur = ''; continue; }
    cur += c;
  }
  segs.push(cur);
  return segs;
}

// pull every `struct Name [@ addr] { ... }` block from the text, any order.
// offsets come from the field types unless an explicit @ overrides.
// a field may carry an initial value: `name [: type] [@ offset] [= value]`.
function collectTypes(text) {
  const types = new Map();
  const order = [];
  const re = /struct\s+([A-Za-z_]\w*)\s*(?:@\s*(0[xX][0-9a-fA-F]+|\d+)\s*)?(?:(packed)\s*)?\{([\s\S]*?)\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = m[1];
    const address = m[2] ? hex(parseNum(m[2])) : null;
    const packed = m[3] != null;
    const fields = new Map();
    const fieldOrder = [];
    let cursor = 0;
    const parts = splitFields(m[4]);
    for (const p of parts) {
      // name [: type] [@ offset] [= value]
      const fm = p.match(/^\s*([A-Za-z_]\w*)\s*(?::\s*([A-Za-z_]\w*(?:\s*\[\s*\d+\s*\])?))?\s*(?:@\s*(0[xX][0-9a-fA-F]+|\d+))?\s*(?:=\s*(.+?))?\s*$/);
      if (!fm) continue;
      if (!fm[2] && !fm[3] && !fm[4] && !/^\s*[A-Za-z_]\w*\s*$/.test(p)) continue;
      const info = typeInfo(fm[2]);
      // packed = end to end, aligned = padded. explicit @offset wins either way.
      const off = fm[3] != null ? parseNum(fm[3]) : packed ? cursor : alignUp(cursor, info.align);
      fields.set(fm[1], { offset: hex(off), type: info.type, size: info.size, value: fm[4] != null ? fm[4].trim() : null });
      fieldOrder.push(fm[1]);
      cursor = off + info.size;
    }
    types.set(name, { fields, order: fieldOrder, address, packed });
    order.push(name);
  }
  return { types, order };
}

// big-endian bytes for a field value, zero-filled to `size`. numbers (dec/hex,
// negatives wrap two's complement), floats (f32/f64), strings/char (ascii, null
// padded), bytes[n] (hex). an empty/absent value stays all zeros.
function valueBytes(typeStr, size, valueRaw) {
  const buf = new Uint8Array(size);
  if (valueRaw == null) return buf;
  const v = String(valueRaw).trim();
  if (v === '') return buf;

  const arr = /^(string|char|bytes)\s*\[\s*(\d+)\s*\]$/i.exec(typeStr || '');
  if (arr) {
    const kind = arr[1].toLowerCase();
    if (kind === 'bytes') {
      const hexs = v.replace(/^0[xX]/, '').replace(/[\s,_]/g, '');
      for (let i = 0, b = 0; b < size && i + 1 < hexs.length + 1; i += 2, b++) {
        const pair = hexs.slice(i, i + 2);
        if (!/^[0-9a-fA-F]{1,2}$/.test(pair)) break;
        buf[b] = parseInt(pair, 16) & 0xff;
      }
    } else {
      let s = v;
      const q = /^"([\s\S]*)"$/.exec(v) || /^'([\s\S]*)'$/.exec(v);
      if (q) s = q[1];
      for (let i = 0; i < s.length && i < size; i++) buf[i] = s.charCodeAt(i) & 0xff;
    }
    return buf;
  }

  const key = (typeStr || '').toLowerCase();
  if (key === 'f32' || key === 'float') {
    new DataView(buf.buffer).setFloat32(0, parseFloat(v) || 0, false);
    return buf;
  }
  if (key === 'f64' || key === 'double') {
    new DataView(buf.buffer).setFloat64(0, parseFloat(v) || 0, false);
    return buf;
  }

  // integer, big-endian, negatives wrap to two's complement over `size` bytes
  let neg = false;
  let t = v;
  if (t[0] === '+') t = t.slice(1);
  else if (t[0] === '-') { neg = true; t = t.slice(1); }
  let big;
  try { big = /^0[xX]/.test(t) ? BigInt(t) : BigInt(t || '0'); }
  catch { big = 0n; }
  if (neg) big = -big;
  const mod = 1n << BigInt(size * 8);
  big = ((big % mod) + mod) % mod;
  for (let i = size - 1; i >= 0; i--) { buf[i] = Number(big & 0xffn); big >>= 8n; }
  return buf;
}

// data blocks to lay down at each struct's address. only structs that have an
// address AND at least one field with a value emit, unset fields are zeroed so
// the layout stays intact. returns big-endian 32-bit words per struct.
function emitStructData(text) {
  const { types, order } = collectTypes(String(text || ''));
  const out = [];
  for (const name of order) {
    const t = types.get(name);
    if (!t || t.address == null) continue;
    let hasValue = false;
    for (const f of t.fields.values()) {
      if (f.value != null && f.value !== '') { hasValue = true; break; }
    }
    if (!hasValue) continue;

    let end = 0;
    for (const f of t.fields.values()) end = Math.max(end, parseNum(f.offset) + f.size);
    const padded = alignUp(end, 4);
    const buf = new Uint8Array(padded);
    for (const f of t.fields.values()) {
      if (f.value == null || f.value === '') continue;
      const bytes = valueBytes(f.type, f.size, f.value);
      const at = parseNum(f.offset);
      for (let i = 0; i < f.size && at + i < buf.length; i++) buf[at + i] = bytes[i];
    }
    const words = [];
    for (let i = 0; i < buf.length; i += 4) {
      words.push(((buf[i] << 24) | (buf[i + 1] << 16) | (buf[i + 2] << 8) | buf[i + 3]) >>> 0);
    }
    out.push({ name, address: parseNum(t.address), words, byteLen: end });
  }
  return out;
}

// a loadstruct line: `loadstruct r3, Player`. loads the struct base address into
// the register and binds the type to it so `Player.field` -> offset(reg).
function parseLoadStruct(code) {
  const m = code.match(/^\s*loadstruct\s+(r(?:[0-9]|[12][0-9]|3[01]))\s*,\s*([A-Za-z_]\w*)\s*$/i);
  if (!m) return null;
  return { reg: m[1].toLowerCase(), type: m[2] };
}

// a set line that types an instance: `set r3, player as Player`
// (register and `name as Type` may come in either order)
function parseTypedSet(code) {
  const m = code.match(/^\s*set\b(.*)$/i);
  if (!m) return null;
  const parts = m[1].split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  const asIdx = parts.findIndex((p) => /\bas\b/i.test(p));
  if (asIdx === -1) return null;
  const am = parts[asIdx].match(/^([A-Za-z_]\w*)\s+as\s+([A-Za-z_]\w*)$/i);
  if (!am) return null;
  const reg = parts[1 - asIdx];
  if (!isGpr(reg)) return null;
  return { reg: reg.toLowerCase(), name: am[1], type: am[2] };
}

// plain set/unset/clearset, used only to keep instance types in scope
function parseSetKind(code) {
  const m = code.match(/^\s*(set|unset|clearset)\b(.*)$/i);
  if (!m) return null;
  const kind = m[1].toLowerCase();
  const rest = (m[2] || '').trim();
  if (kind === 'unset') return { kind, name: rest.replace(/^[,\s]+|[,\s]+$/g, '').trim() };
  return { kind };
}

function resolveToken(tok, types, instType, instReg) {
  const dot = tok.indexOf('.');
  if (dot <= 0 || dot !== tok.lastIndexOf('.')) return tok;
  const a = tok.slice(0, dot);
  const b = tok.slice(dot + 1);
  if (!isIdent(a) || !isIdent(b)) return tok;
  // loadstruct binding -> offset(actual register), resolved here directly
  if (instReg && instReg.has(a)) {
    const t = types.get(instReg.get(a).type);
    if (t && t.fields.has(b)) return `${t.fields.get(b).offset}(${instReg.get(a).reg})`;
  }
  // typed instance -> offset(reg-alias), the alias pass turns the name into rX
  if (instType.has(a)) {
    const t = types.get(instType.get(a));
    if (t && t.fields.has(b)) return `${t.fields.get(b).offset}(${a})`;
  }
  // struct type -> bare offset constant
  if (types.has(a)) {
    const t = types.get(a);
    if (t.fields.has(b)) return t.fields.get(b).offset;
  }
  return tok;
}

// extraTypeText seeds the type map with imported struct blocks.
// only the current text's lines are emitted.
function preprocessStructs(fullText, extraTypeText) {
  const text = String(fullText || '');
  const { types } = collectTypes(extraTypeText ? `${text}\n${extraTypeText}` : text);
  const lines = text.split('\n');
  const instType = new Map(); // instance name -> type name, scoped like aliases
  const instReg = new Map(); // loadstruct binding: name -> { type, reg }

  let inStruct = false;
  const out = lines.map((line) => {
    const ci = findCommentIndex(line);
    const code = ci >= 0 ? line.slice(0, ci) : line;
    const comment = ci >= 0 ? line.slice(ci) : '';

    // inside a multi line struct block, comment through the closing brace
    if (inStruct) {
      if (code.includes('}')) inStruct = false;
      return '# ' + line;
    }

    const codeTrim = code.trim();

    // struct definition, comment out in place
    if (/^struct\b/i.test(codeTrim)) {
      const opens = (code.match(/\{/g) || []).length;
      const closes = (code.match(/\}/g) || []).length;
      if (opens > closes) inStruct = true;
      return '# ' + line;
    }

    // loadstruct: load the base address and bind the type to the register.
    // stays one line (load32) so error lines still map to the editor.
    const ls = parseLoadStruct(codeTrim);
    if (ls) {
      const t = types.get(ls.type);
      if (t && t.address != null) {
        instReg.set(ls.type, { type: ls.type, reg: ls.reg });
        return `load32 ${ls.reg}, ${t.address}${comment ? ' ' + comment : ''}`;
      }
      // unknown type or no address: leave it, the assembler will flag the line
      return line;
    }

    // typed set: record the type, rewrite to a plain set for the alias pass
    const ts = parseTypedSet(codeTrim);
    if (ts) {
      instType.set(ts.name, ts.type);
      return `set ${ts.reg}, ${ts.name}${comment ? ' ' + comment : ''}`;
    }

    // keep instance types in step with alias scope
    const sk = parseSetKind(codeTrim);
    if (sk) {
      if (sk.kind === 'clearset') { instType.clear(); instReg.clear(); }
      else if (sk.kind === 'unset' && sk.name) { instType.delete(sk.name); instReg.delete(sk.name); }
      else if (sk.kind === 'set') {
        const mm = codeTrim.match(/^set\s+([^,]+),\s*([^,]+)$/i);
        if (mm) {
          const left = mm[1].trim();
          const right = mm[2].trim();
          if (isIdent(left) && !isGpr(left)) instType.delete(left);
          if (isIdent(right) && !isGpr(right)) instType.delete(right);
        }
      }
      return line;
    }

    if (types.size === 0 && instType.size === 0 && instReg.size === 0) return line;

    const tokens = code.split(/(\s+|,|\(|\)|\[|\]|\+|-)/);
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (!t || /^\s+$/.test(t)) continue;
      if (t.indexOf('.') > 0) tokens[i] = resolveToken(t, types, instType, instReg);
    }
    return tokens.join('') + comment;
  });

  return out.join('\n');
}

// parse structs for the panel: types (name + fields) and typed instances
function parseStructs(fullText) {
  const text = String(fullText || '');
  const { types, order } = collectTypes(text);
  const typeList = order.map((name) => {
    const t = types.get(name);
    return {
      name,
      address: t.address,
      packed: !!t.packed,
      fields: t.order.map((f) => {
        const fd = t.fields.get(f);
        return { name: f, offset: fd.offset, type: fd.type, size: fd.size, value: fd.value ?? null };
      }),
    };
  });
  const instances = [];
  const srcLines = text.split('\n');
  for (let i = 0; i < srcLines.length; i++) {
    const ci = findCommentIndex(srcLines[i]);
    const code = ci >= 0 ? srcLines[i].slice(0, ci) : srcLines[i];
    const ts = parseTypedSet(code.trim());
    if (ts) { instances.push({ name: ts.name, type: ts.type, reg: ts.reg, line: i + 1 }); continue; }
    const ls = parseLoadStruct(code.trim());
    if (ls) instances.push({ name: ls.type, type: ls.type, reg: ls.reg, line: i + 1 });
  }
  return { types: typeList, instances };
}

module.exports = { preprocessStructs, parseStructs, collectTypes, emitStructData, valueBytes };
