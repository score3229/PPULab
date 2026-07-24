'use strict';

// ppc disassembler. inverts the assembler's instruction table.
// branches and rotate sugar are decoded by hand:
//  - unconditional/conditional branches decode straight from the opcode
//  - slwi/srwi/sldi/srdi/clrldi are assemble-only aliases of rlwinm/rldic,
//    decode to the base form instead.

const { byName } = require('./asm/asm_declarations.overrides');

// ops that only exist as assemble-time sugar, keep them out of the index
const SUGAR = new Set(['slwi', 'srwi', 'sldi', 'srdi', 'clrldi']);
// branch types are decoded by hand, not by table match
const SKIP_TYPES = new Set(['typeBNC', 'typeBNCMP', 'typeMD', 'typeXS']);

function hex8(n) {
    return (n >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

function popcount(n) {
    n = n >>> 0;
    let c = 0;
    while (n) { c += n & 1; n >>>= 1; }
    return c;
}

// field width by low bit: 0 = 16-bit imm, 12 = mtcrf CRM (8), 23 = crfD (3),
// else a 5-bit register field.
function fieldWidth(shift) {
    if (shift === 0) return 16;
    if (shift === 12) return 8;
    if (shift === 23) return 3;
    return 5;
}

function fieldValue(word, shift) {
    const w = fieldWidth(shift);
    return (word >>> shift) & ((1 << w) - 1);
}

// ds-form loads/stores (primary opcode 58/62: ld, ldu, lwa, std, stdu)
// keep bits 0-1 as a sub-opcode and put the offset in bits 2-15.
function isDsForm(v) {
    return v.type === 'typeOFI' && (v.opCode >>> 26 === 58 || v.opCode >>> 26 === 62);
}

function sprName(v) {
    if (v === 8) return 'lr';
    if (v === 9) return 'ctr';
    if (v === 1) return 'xer';
    return String(v);
}

function signHex(v16) {
    // 16-bit value shown signed for readability, still round-trips
    const s = (v16 & 0x8000) ? v16 - 0x10000 : v16;
    return s < 0 ? `-0x${(-s).toString(16)}` : `0x${s.toString(16)}`;
}

function uHex(v) {
    return `0x${(v >>> 0).toString(16)}`;
}

// build the decode index once
function buildIndex() {
    const table = byName();
    const entries = [];

    for (const [name, variants] of table) {
        if (SUGAR.has(name)) continue;
        for (const v of variants) {
            if (SKIP_TYPES.has(v.type)) continue;

            let fieldMask = 0;
            const ds = isDsForm(v);
            for (const s of v.shifts) {
                if (s === 0 && ds) { fieldMask |= 0x0000fffc; continue; }
                const w = fieldWidth(s);
                fieldMask |= (((1 << w) - 1) >>> 0) << s;
            }
            const mask = (~fieldMask) >>> 0;
            const match = (v.opCode & mask) >>> 0;
            entries.push({ name, v, mask, match, bits: popcount(mask) });
        }
    }

    // most fixed bits first, so specific forms win over general ones
    entries.sort((a, b) => b.bits - a.bits);
    return entries;
}

let INDEX = null;
function index() {
    if (!INDEX) INDEX = buildIndex();
    return INDEX;
}

// recover source-order operand values for a matched table entry
function operandValues(v, word) {
    const n = v.order.length ? Math.max(...v.order) + 1 : 0;
    const vals = new Array(n).fill(0);
    for (let y = 0; y < v.shifts.length; y++) {
        vals[v.order[y]] = fieldValue(word, v.shifts[y]);
    }
    return vals;
}

function hasCrfD(v) {
    return v.shifts.includes(23);
}

// format the operands for a matched (non-branch) instruction
function formatOperands(name, v, word) {
    const vals = operandValues(v, word);
    const t = v.type;

    if (vals.length === 0) return '';

    if (t === 'typeSPR') {
        // reg sits in the <<21 field, spr in the <<16 field
        const iReg = v.order[v.shifts.indexOf(21)];
        const iSpr = v.order[v.shifts.indexOf(16)];
        const reg = `r${vals[iReg]}`;
        const spr = sprName(vals[iSpr]);
        return name === 'mtspr' ? `${spr}, ${reg}` : `${reg}, ${spr}`;
    }

    if (t === 'typeOFI') {
        const off = isDsForm(v) ? (word & 0xfffc) : vals[2];
        return `r${vals[0]}, ${signHex(off)}(r${vals[1]})`;
    }
    if (t === 'typeFOFI') {
        return `f${vals[0]}, ${signHex(vals[2])}(r${vals[1]})`;
    }

    if (t === 'typeIMM') {
        // last operand is the immediate, the rest are gprs
        const parts = vals.map((val, i) =>
            i === vals.length - 1 ? uHex(val) : `r${val}`);
        return parts.join(', ');
    }

    if (t === 'typeCND') {
        // integer compare: crfD, rA, then either rB (cmpw/cmplw/cmpd, field at
        // bit 11) or SIMM (cmpwi/cmplwi, field at bit 0). key off the field, not
        // the position, so the register forms don't print their rB as a number.
        const cr = hasCrfD(v);
        return vals.map((val, i) => {
            if (i === 0 && cr) return `cr${val}`;
            const shift = v.shifts[v.order.indexOf(i)];
            if (shift === 0) return signHex(val);
            return `r${val}`;
        }).join(', ');
    }

    if (t === 'typeFCND') {
        // float compare: crfD, fA, fB (all registers)
        const cr = hasCrfD(v);
        return vals.map((val, i) => (i === 0 && cr) ? `cr${val}` : `f${val}`).join(', ');
    }

    if (t === 'typeFONE') {
        // float-indexed: fD then gpr address regs
        return vals.map((val, i) => (i === 0 ? `f${val}` : `r${val}`)).join(', ');
    }

    if (t === 'typeIMM5') {
        // srawi rA, rS, SH  (sugar forms are excluded from the index)
        return vals.map((val, i) =>
            i === vals.length - 1 ? uHex(val) : `r${val}`).join(', ');
    }

    // rotate-and-mask: regs then shift/mask immediates. rlwnm keeps rB a reg
    if (/^rlwnm/.test(name)) {
        return vals.map((val, i) => (i < 3 ? `r${val}` : uHex(val))).join(', ');
    }
    if (/^rlw/.test(name)) {
        return vals.map((val, i) => (i < 2 ? `r${val}` : uHex(val))).join(', ');
    }

    // load/store string immediate: rD, rA, NB where NB is a byte count
    if (name === 'lswi' || name === 'stswi') {
        return `r${vals[0]}, r${vals[1]}, ${vals[2]}`;
    }

    // mtcrf/mtocrf: CRM mask (immediate), rS. mfocrf: rD, CRM
    if (name === 'mtcrf' || name === 'mtocrf') {
        return `${uHex(vals[0])}, r${vals[1]}`;
    }
    if (name === 'mfocrf') {
        return `r${vals[0]}, ${uHex(vals[1])}`;
    }
    // tw: TO condition (immediate), rA, rB
    if (name === 'tw') {
        return vals.map((v, i) => (i === 0 ? String(v) : `r${v}`)).join(', ');
    }
    // twi: TO condition (immediate), rA, SIMM
    if (name === 'twi') {
        return `${vals[0]}, r${vals[1]}, ${signHex(vals[2])}`;
    }
    // cr-bit logicals: operands are cr bit indices, not gprs
    if (/^cr(and|andc|or|orc|xor|nand|nor|eqv)$/.test(name)) {
        return vals.map((v) => String(v)).join(', ');
    }

    // vector op with a trailing 5-bit immediate: v-regs then a number.
    // vspltis* takes a signed immediate; the rest are unsigned.
    if (t === 'typeVX5') {
        const signed = /^vspltis/.test(name);
        return vals.map((val, i) => {
            if (i < vals.length - 1) return `v${val}`;
            return String(signed && val >= 16 ? val - 32 : val);
        }).join(', ');
    }

    // register-only forms
    let pfx = 'r';
    if (t === 'typeFNAN' || t === 'typeFONE') pfx = 'f';
    else if (t === 'typeVREG3' || t === 'typeVREG4') pfx = 'v';

    const vectorLoad = /^(l|st)v/.test(name); // lvx/stvx family: dest is a vreg
    return vals.map((val, i) => {
        if (vectorLoad && i === 0) return `v${val}`;
        return `${pfx}${val}`;
    }).join(', ');
}

// decode a conditional branch (primary opcode 16)
function decodeConditional(word, addr) {
    const bo = (word >>> 21) & 0x1f;
    const bi = (word >>> 16) & 0x1f;
    const bd = word & 0xfffc;
    const aa = (word >>> 1) & 1;
    const lk = word & 1;

    const disp = (bd & 0x8000) ? bd - 0x10000 : bd;
    const target = (aa ? disp : (addr + disp)) >>> 0;

    const crX = bi >> 2;
    const cond = bi & 3; // 0 lt, 1 gt, 2 eq, 3 so
    const TRUE = ['blt', 'bgt', 'beq', 'bso'];
    const FALSE = ['bge', 'ble', 'bne', 'bns'];

    // bo top 3 bits pick true/false; low 2 are the branch-prediction hint
    let base = null;
    let isCtr = false;
    let hint = '';
    const top = bo >> 2;
    if (top === 3) base = TRUE[cond];
    else if (top === 1) base = FALSE[cond];
    else if (bo === 16) { base = 'bdnz'; isCtr = true; }
    else if (bo === 18) { base = 'bdz'; isCtr = true; }

    if (!base) return null; // combined ctr+cond forms etc, let caller fall back

    if (top === 3 || top === 1) {
        const at = bo & 3;
        hint = at === 2 ? '-' : at === 3 ? '+' : '';
    }
    const mnem = base + (lk ? 'l' : '') + (aa ? 'a' : '') + hint;
    const ops = isCtr ? [] : (crX === 0 ? [] : [`cr${crX}`]);
    return { mnem, ops, target };
}

// decode an unconditional branch (primary opcode 18)
function decodeUnconditional(word, addr) {
    const li = word & 0x03fffffc;
    const aa = (word >>> 1) & 1;
    const lk = word & 1;
    const disp = (li & 0x02000000) ? li - 0x04000000 : li;
    const target = (aa ? disp : (addr + disp)) >>> 0;
    const mnem = 'b' + (lk ? 'l' : '') + (aa ? 'a' : '');
    return { mnem, ops: [], target };
}

// decode one 32-bit word at addr -> structured instruction
// md-form (opcode 30): rldicl/rldicr/rldic/rldimi. sh split 5+bit30, 6-bit
// mask reordered. xo 4-7 are the register-rotate forms, left to fall through.
function decodeMD(word) {
    const xo = (word >>> 2) & 7;
    const MD = { 0: 'rldicl', 1: 'rldicr', 2: 'rldic', 3: 'rldimi' };
    if (!(xo in MD)) return null;
    const rS = (word >>> 21) & 0x1f;
    const rA = (word >>> 16) & 0x1f;
    const sh = ((word >>> 11) & 0x1f) | (((word >>> 1) & 1) << 5);
    const mField = (word >>> 5) & 0x3f;
    const mask = ((mField >> 1) & 0x1f) | ((mField & 1) << 5);
    const rc = word & 1;
    return { mnem: MD[xo] + (rc ? '.' : ''), ops: [`r${rA}`, `r${rS}`, String(sh), String(mask)], isBranch: false };
}

// conditional branch to lr/ctr (opcode 19, xo 16 = bclr, xo 528 = bcctr).
// target is a runtime register so there is no computable address; the
// unconditional blr/bctr (bo 20) fall through to the table entries.
function decodeCondReg(word) {
    const xo = (word >>> 1) & 0x3ff;
    const suffix = xo === 16 ? 'lr' : xo === 528 ? 'ctr' : null;
    if (!suffix) return null;
    const bo = (word >>> 21) & 0x1f;
    const bi = (word >>> 16) & 0x1f;
    const lk = word & 1;
    const crX = bi >> 2;
    const cond = bi & 3;
    const TRUE = ['blt', 'bgt', 'beq', 'bso'];
    const FALSE = ['bge', 'ble', 'bne', 'bns'];
    const top = bo >> 2;
    let base = null;
    if (top === 3) base = TRUE[cond];
    else if (top === 1) base = FALSE[cond];
    if (!base) return null; // unconditional (bo 20) + ctr-decrement forms -> table/hexcode
    const at = bo & 3;
    const hint = at === 2 ? '-' : at === 3 ? '+' : '';
    const mnem = base + suffix + (lk ? 'l' : '') + hint;
    const ops = crX === 0 ? [] : [`cr${crX}`];
    return { mnem, ops, isBranch: false };
}

// xs-form sradi (opcode 31, xo 413), sh split 5+bit30
function decodeSRADI(word) {
    if (((word >>> 2) & 0x1ff) !== 413) return null;
    const rS = (word >>> 21) & 0x1f;
    const rA = (word >>> 16) & 0x1f;
    const sh = ((word >>> 11) & 0x1f) | (((word >>> 1) & 1) << 5);
    const rc = word & 1;
    return { mnem: 'sradi' + (rc ? '.' : ''), ops: [`r${rA}`, `r${rS}`, String(sh)], isBranch: false };
}

function decodeWord(word, addr) {
    word = word >>> 0;
    const op = word >>> 26;

    if (op === 18) return { ...decodeUnconditional(word, addr), isBranch: true };
    if (op === 16) {
        const c = decodeConditional(word, addr);
        if (c) return { ...c, isBranch: true };
    }
    if (op === 19) {
        const c = decodeCondReg(word);
        if (c) return c;
    }
    if (op === 30) {
        const m = decodeMD(word);
        if (m) return m;
    }
    if (op === 31) {
        const s = decodeSRADI(word);
        if (s) return s;
    }

    for (const e of index()) {
        if (((word & e.mask) >>> 0) === e.match) {
            const ops = formatOperands(e.name, e.v, word) ? formatOperands(e.name, e.v, word).split(', ') : [];
            // show mtspr/mfspr lr,ctr as the familiar mtlr/mflr/mtctr/mfctr
            if (e.name === 'mfspr' && (ops[1] === 'lr' || ops[1] === 'ctr')) {
                return { mnem: ops[1] === 'lr' ? 'mflr' : 'mfctr', ops: [ops[0]], isBranch: false };
            }
            if (e.name === 'mtspr' && (ops[0] === 'lr' || ops[0] === 'ctr')) {
                return { mnem: ops[0] === 'lr' ? 'mtlr' : 'mtctr', ops: [ops[1]], isBranch: false };
            }
            return { mnem: e.name, ops, isBranch: false };
        }
    }

    // nothing matched, emit as raw data that round-trips
    return { mnem: 'hexcode', ops: [`0x${hex8(word)}`], isBranch: false, isData: true };
}

// pull 32-bit words out of loosely formatted hex text.
// strips the usual junk so almost any dump pastes: words or bytes, 0x/\x/$
// prefixes, h suffix, commas/braces, |ascii| gutters, // # ; comments, and
// leading addresses. objdump-style "addr: word  mnemonic" keeps just the opcode.
function parseWords(input) {
    let hex = '';
    const SEP = /[\s,{}[\]()<>]+/;
    const clean = (t) => t.replace(/0x|\\x|\$/gi, '').replace(/[hH]$/, '');

    for (let raw of String(input || '').split(/\r?\n/)) {
        let line = raw;
        // drop line comments
        const cuts = [line.indexOf('//'), line.indexOf('#'), line.indexOf(';')].filter(i => i >= 0);
        if (cuts.length) line = line.slice(0, Math.min(...cuts));
        // drop hexdump ascii gutter |....|
        line = line.replace(/\|[^|\n]*\|?/g, ' ');

        // objdump / disassembly line: "addr: opcode  mnemonic ops"
        // take only the opcode column (words or byte pairs), stop at the mnemonic
        const col = line.match(/^\s*[0-9a-fA-F]{4,16}:\s*(.*)$/);
        if (col) {
            for (const tok of col[1].split(SEP)) {
                const t = clean(tok);
                if (/^[0-9a-fA-F]{2}$/.test(t) || /^[0-9a-fA-F]{8}$/.test(t)) hex += t;
                else break;
            }
            continue;
        }

        // hexdump leading address with no colon, e.g. "016c7c30  7e ac 42 e6"
        line = line.replace(/^\s*[0-9a-fA-F]{4,16}\s{2,}(?=[0-9a-fA-F]{2}(?:\s|$))/, ' ');

        for (let tok of line.split(SEP)) {
            tok = clean(tok);
            if (tok && /^[0-9a-fA-F]+$/.test(tok)) hex += tok;
        }
    }

    const words = [];
    for (let i = 0; i + 8 <= hex.length; i += 8) {
        words.push(parseInt(hex.slice(i, i + 8), 16) >>> 0);
    }
    return words;
}

// disassemble hex text into ppc assembly
function disassemble(input, opts = {}) {
    const words = parseWords(input);
    const hasBase = Number.isFinite(opts.baseAddress);
    const base = hasBase ? (opts.baseAddress >>> 0) : 0;

    // first pass: decode everything with addresses
    const decoded = words.map((w, i) => {
        const addr = (base + i * 4) >>> 0;
        return { addr, ...decodeWord(w, addr) };
    });

    // collect in-range branch targets, assign labels
    const lo = base;
    const hi = (base + words.length * 4) >>> 0;
    const labels = new Map();
    for (const d of decoded) {
        if (d.isBranch && d.target >= lo && d.target < hi && ((d.target - base) % 4 === 0)) {
            if (!labels.has(d.target)) labels.set(d.target, `loc_${hex8(d.target)}`);
        }
    }

    const out = [];
    if (hasBase) out.push(`address 0x${hex8(base)}`, '');

    for (const d of decoded) {
        if (labels.has(d.addr)) {
            if (out.length && out[out.length - 1] !== '') out.push('');
            out.push(`${labels.get(d.addr)}:`);
        }

        let ops = d.ops.slice();
        if (d.isBranch) {
            const label = labels.get(d.target);
            const targetStr = label || `0x${hex8(d.target)}`;
            ops = ops.concat(targetStr);
        }

        const line = ops.length ? `${d.mnem} ${ops.join(', ')}` : d.mnem;
        out.push(hasBase || labels.size ? `    ${line}` : line);
    }

    return out.join('\n');
}

module.exports = {
    disassemble,
    decodeWord,
    parseWords
};
