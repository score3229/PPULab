'use strict';

const {
    byName
} = require('./asm/asm_declarations.overrides');

const {
    expandPseudo
} = require('./asm/asm_pseudos');

// -----------------------
// utilities
// -----------------------
function u32(n) {
    return (n >>> 0);
}

function hex8(n) {
    return u32(n).toString(16).padStart(8, '0');
}

function stripLine(line) {
    // strip //, #, ; comments then trim
    const i = line.indexOf('//');
    if (i >= 0) line = line.slice(0, i);

    const x = line.indexOf('#');
    if (x >= 0) line = line.slice(0, x);

    const y = line.indexOf(';');
    if (y >= 0) line = line.slice(0, y);

    return line.trim();
}

function isLabelDecl(line) {
    return /^[A-Za-z_]\w*:$/.test(line);
}

function labelName(line) {
    return line.slice(0, -1);
}

function isLabelRef(tok) {
    tok = tok.replace(/,/g, '').trim();
    return /^[A-Za-z_]\w*$/.test(tok);
}

// attach the offending source token to an error so the ui can point the
// squiggle at the exact operand rather than the mnemonic
function tokErr(message, token) {
    const e = new Error(message);
    const t = token == null ? '' : String(token).trim();
    if (t) e.token = t;
    return e;
}

// bundle collected per-line errors into one throw. first stays primary
// (back-compat fields), the rest ride on .errors, sorted and deduped
function makeMultiError(errors) {
    const seen = new Set();
    const list = [];
    const sorted = errors.slice().sort((a, b) => (a.line - b.line) || ((a.col || 0) - (b.col || 0)));
    for (const x of sorted) {
        const key = `${x.line}:${x.col}:${x.message}`;
        if (seen.has(key)) continue;
        seen.add(key);
        list.push({ message: x.message, line: x.line, col: x.col, length: x.length, code: x.code, stage: x.stage });
    }
    const first = list[0];
    const e = new Error(first.message);
    e.line = first.line;
    e.col = first.col;
    e.length = first.length;
    e.code = first.code;
    e.stage = first.stage;
    e.errors = list;
    return e;
}

function parseNumber(tok) {
    const orig = String(tok ?? '').trim();
    tok = String(tok ?? '').replace(/,/g, '').trim();
    if (!tok) throw tokErr('Missing number', orig);

    let neg = false;
    if (tok.startsWith('-')) {
        neg = true;
        tok = tok.slice(1).trim();
        if (!tok) throw tokErr('Missing number', orig);
    }

    // looks like disp(rX)
    if (/[()]/.test(tok)) {
        throw tokErr(
            `Syntax error: unexpected parentheses in numeric operand "${neg ? '-' : ''}${tok}" ` +
            `(did you mean disp(rX) form?)`,
            orig
        );
    }

    let v;

    if (/^0x[0-9a-fA-F]+$/.test(tok)) {
        v = parseInt(tok.slice(2), 16);
    }
    else if (/^\$[0-9a-fA-F]+$/.test(tok)) {
        v = parseInt(tok.slice(1), 16);
    }
    else if (/^\d+$/.test(tok)) {
        v = parseInt(tok, 10);
    }
    else {
        throw tokErr(`Bad numeric token: ${neg ? '-' : ''}${tok}`, orig);
    }

    if (!Number.isFinite(v)) {
        throw tokErr(`Bad number: ${neg ? '-' : ''}${tok}`, orig);
    }

    v = (v | 0);
    return neg ? -v : v;
}

function parseGPR(tok) {
    const orig = String(tok ?? '').trim();
    tok = tok.replace(/,/g, '').trim().toLowerCase();
    if (!tok.startsWith('r')) throw tokErr(`Expected rN, got ${tok}`, orig);
    const n = parseInt(tok.slice(1), 10);
    if (!Number.isInteger(n) || n < 0 || n > 31) throw tokErr(`Bad GPR: ${tok}`, orig);
    return n;
}

function parseFPR(tok) {
    const orig = String(tok ?? '').trim();
    tok = tok.replace(/,/g, '').trim().toLowerCase();
    if (!tok.startsWith('f')) throw tokErr(`Expected fN, got ${tok}`, orig);
    const n = parseInt(tok.slice(1), 10);
    if (!Number.isInteger(n) || n < 0 || n > 31) throw tokErr(`Bad FPR: ${tok}`, orig);
    return n;
}

function parseVPR(tok) {
    const orig = String(tok ?? '').trim();
    tok = tok.replace(/,/g, '').trim().toLowerCase();
    if (!tok.startsWith('v')) throw tokErr(`Expected vN, got ${tok}`, orig);
    const n = parseInt(tok.slice(1), 10);
    if (!Number.isInteger(n) || n < 0 || n > 31) throw tokErr(`Bad VPR: ${tok}`, orig);
    return n;
}

function parseCR(tok) {
    const orig = String(tok ?? '').trim();
    tok = tok.replace(/,/g, '').trim().toLowerCase();
    if (!tok.startsWith('cr')) throw tokErr(`Expected crN, got ${tok}`, orig);
    const n = parseInt(tok.slice(2), 10);
    if (!Number.isInteger(n) || n < 0 || n > 7) throw tokErr(`Bad CR: ${tok}`, orig);
    return n;
}

function parseOFI(tok) {
    const orig = String(tok ?? '').trim();
    tok = tok.replace(/,/g, '').trim();
    const m = tok.match(/^(-?(?:0x[0-9a-fA-F]+|\$[0-9a-fA-F]+|\d+))\((r\d+)\)$/);
    if (!m) throw tokErr(`Bad offset form: ${tok}`, orig);
    const off = parseNumber(m[1]);
    const base = parseGPR(m[2]);
    return {
        off16: (off & 0xffff),
        base
    };
}

function parseSPR(tok) {
    tok = tok.replace(/,/g, '').trim().toLowerCase();
    if (tok === 'lr') return 8;
    if (tok === 'ctr') return 9;
    if (tok === 'xer') return 1;
    // numeric spr accepted
    return parseNumber(tok);
}

function findNextAddressAfter(lines, startIndex) {
    for (let i = startIndex + 1; i < lines.length; i++) {
        const line = stripLine(lines[i]);
        if (!line) continue;
        if (isLabelDecl(line)) continue;

        const parts = line.split(/\s+/);
        const op = parts[0].toLowerCase();

        if (op === 'address') {
            return parseNumber(parts[1]) >>> 0;
        }
    }
    return null;
}

function encodeBRelative(fromAddr, toAddr) {
    const from = fromAddr >>> 0;
    const to = toAddr >>> 0;

    const delta = ((to - from) | 0); // signed 32-bit
    if ((delta & 3) !== 0) {
        throw new Error(`hook target is not 4-byte aligned (from=${hex8(from)} to=${hex8(to)})`);
    }

    // PPC 'b' uses a signed 24-bit LI field (shifted by 2) -> signed 26-bit byte offset with low 2 bits zero.
    // range: -0x02000000 .. +0x01FFFFFC
    if (delta < -0x02000000 || delta > 0x01FFFFFC) {
        throw new Error(`hook branch out of range (from=${hex8(from)} to=${hex8(to)} delta=${delta})`);
    }

    // 0x48000000: opcode for unconditional branch (AA=0, LK=0)
    return (0x48000000 | (delta & 0x03FFFFFC)) >>> 0;
}

function expandLine(op, operands, ctx) {
    let cur = [{ op: op.toLowerCase(), operands }];

    for (let guard = 0; guard < 16; guard++) {
        let changed = false;
        const next = [];

        for (const item of cur) {
            const expanded = expandPseudo(item.op, item.operands, ctx);
            if (!expanded) {
                next.push(item);
                continue;
            }

            changed = true;
            for (const e of expanded) next.push(e);
        }

        cur = next;
        if (!changed) break;
    }

    return cur;
}

// -----------------------
// rotate helpers
// -----------------------
// md-form (rldicl xo=0, rldicr xo=1). sh split 5+bit30, 6-bit mask reordered
// (low 5 then bit 5) into bits 21-26.
function assembleMD(rA, rS, sh, mask, xo) {
    let w = 0x78000000 >>> 0;
    w |= (rS & 31) << 21;
    w |= (rA & 31) << 16;
    w |= (sh & 31) << 11;
    w |= ((sh >> 5) & 1) << 1;
    const m = ((mask & 0x1f) << 1) | ((mask >> 5) & 1);
    w |= (m & 0x3f) << 5;
    w |= (xo & 7) << 2;
    return w >>> 0;
}

// sldi rA, rS, n == rldicr rA, rS, n, 63-n
function assembleRLDICR(rA, rS, n) {
    return assembleMD(rA, rS, n & 63, (63 - n) & 63, 1);
}

// srdi rA, rS, n == rldicl rA, rS, 64-n, n
function assembleRLDICL(rA, rS, n) {
    return assembleMD(rA, rS, (64 - n) & 63, n & 63, 0);
}

// clrldi rA, rS, n == rldicl rA, rS, 0, n
function assembleCLRLDI(rA, rS, n) {
    return assembleMD(rA, rS, 0, n & 63, 0);
}

// xs-form sradi rA, rS, sh. xo 413 at bits 21-29, sh split 5+bit30
function assembleSRADI(rA, rS, sh) {
    let w = (31 << 26) >>> 0;
    w |= (rS & 31) << 21;
    w |= (rA & 31) << 16;
    w |= (sh & 0x1f) << 11;
    w |= 413 << 2;
    w |= ((sh >> 5) & 1) << 1;
    return w >>> 0;
}

function assembleRotate(op, regs, spec, retVal) {
    // rotate encoding
    let y = 0;

    for (y = 0; y < (spec.shifts.length - 1); y++) {
        retVal |= (regs[spec.order[y]] << spec.shifts[y]) >>> 0;
    }
    retVal |= ((regs[spec.order[y]] << spec.shifts[y]) & 0xffff) >>> 0;

    switch (op) {
        case 'slwi': {
            const n = regs[spec.order[y]];
            retVal |= (((31 - n) & 0x1f) << 1) & 0xffff;
            return retVal >>> 0;
        }
        case 'srwi': {
            const n = regs[spec.order[y]];
            retVal &= ~(((0x1f) << 11) >>> 0);
            retVal |= (((32 - n) & 0x1f) << 11) & 0xffff;
            retVal |= (31 << 1) & 0xffff;
            return retVal >>> 0;
        }
        case 'sldi': {
            const n = regs[spec.order[y]];
            const rS = regs[spec.order[0]];
            const rA = regs[spec.order[1]];
            return assembleRLDICR(rA, rS, n);
        }
        case 'srdi': {
            const n = regs[spec.order[y]];
            const rS = regs[spec.order[0]];
            const rA = regs[spec.order[1]];
            return assembleRLDICL(rA, rS, n);
        }
        case 'clrldi': {
            const n = regs[spec.order[y]];
            const rS = regs[spec.order[0]];
            const rA = regs[spec.order[1]];
            return assembleCLRLDI(rA, rS, n);
        }
        default:
            return retVal >>> 0;
    }
}

// -----------------------
// assembler
// -----------------------
class PPCAssembler {
    constructor() {
        const table = byName();

        this.table = table; // Map mnemonic -> [variants]
        this.labels = new Map();
    }

    // first pass: assign label addresses
    // each emitted instruction is 4 bytes
    scanLabels(lines) {
        this.labels.clear();
        let compAddr = 0 >>> 0;
        let haveAddress = false;

        for (const raw of lines) {
          // best effort: a malformed line here just skips address accounting,
          // the main pass reports the real error
          try {
            const line = stripLine(raw);
            if (!line) continue;

            if (isLabelDecl(line)) {
                this.labels.set(labelName(line), compAddr >>> 0);
                continue;
            }

            const parts = line.split(/\s+/);
            const op = parts[0].toLowerCase();

            if (op === 'address') {
                compAddr = (parseNumber(parts[1]) >>> 0);
                haveAddress = true;
                // optional label operand: `address <addr> <name>` binds the
                // name here (a func header with an inline address desugars to it)
                if (parts[2]) this.labels.set(parts[2], compAddr >>> 0);
                continue;
            }

            // hook emits one branch instruction at the hook address
            if (op === 'hook') {
                const hookAddr = (parseNumber(parts[1]) >>> 0);
                compAddr = hookAddr;
                haveAddress = true;
                compAddr = (compAddr + 4) >>> 0;
                continue;
            }

            // directives
            if (op === 'hexcode') { compAddr = (compAddr + 4) >>> 0; continue; }
            if (op === 'float') { compAddr = (compAddr + 4) >>> 0; continue; }

            if (op === 'string') {
                // string emits n bytes padded to 4
                const str = line.slice(parts[0].length).trim();
                const bytes = Buffer.from(str, 'utf8');
                const padded = (bytes.length + (4 - (bytes.length % 4 || 4))) >>> 0;
                compAddr = (compAddr + padded) >>> 0;
                continue;
            }

            if (op === 'import') {
                continue;
            }

            const operandText = line.slice(parts[0].length).trim();
            const operands = operandText
                ? operandText.split(',').map(s => s.trim()).filter(Boolean)
                : [];

            // only count bytes for a known mnemonic or a pseudo
            // unknown tokens don't advance compAddr
            const isPseudo = !!expandPseudo(op, operands, { compAddr, labels: this.labels });
            if (!isPseudo && !this.table.has(op)) {
                continue;
            }

            if (!haveAddress) {
                // address can be 0
            }

            const expanded = expandLine(op, operands, {
                compAddr,
                labels: this.labels
            });

            compAddr = (compAddr + (expanded.length * 4)) >>> 0;
          } catch {
            // ignore, the main pass reports it
          }
        }
    }

    // choose best variant by operand count
    pickVariant(op, operands) {
        const vars = this.table.get(op);
        if (!vars || vars.length === 0) return null;

        // prefer exact match on operand count
        // for OFI the memory operand is one token like 0xC(r3)
        for (const v of vars) {
            if (v.order.length === operands.length) return v;
        }
        // fallback: closest
        return vars[0];
    }

    // parse operands into a regs[] array based on the instruction type
    parseRegsForVariant(op, variant, operands, compAddr) {
        const regs = new Array(Math.max(variant.order.length, operands.length)).fill(0);
        let valState = 'dec'; // 'lab' if an operand is a label

        const t = variant.type;

        if (t === 'typeNOP') return { regs, valState };

        if (t === 'typeOFI') {
            // expects rD, off(rA) (or rS for stores)
            regs[0] = parseGPR(operands[0]);
            const { off16, base } = parseOFI(operands[1]);
            regs[1] = base;
            regs[2] = off16;
            return { regs, valState };
        }

        if (t === 'typeFOFI') {
            regs[0] = parseFPR(operands[0]);
            const { off16, base } = parseOFI(operands[1]);
            regs[1] = base;
            regs[2] = off16;
            return { regs, valState };
        }

        if (t === 'typeSPR') {
            // e.g. mflr r0, lr is implied by the encoding
            // parse tokens as r/f/cr or spr/number
            for (let i = 0; i < operands.length; i++) {
                const tok = operands[i];
                if (/^r\d+$/i.test(tok)) regs[i] = parseGPR(tok);
                else if (/^f\d+$/i.test(tok)) regs[i] = parseFPR(tok);
                else if (/^cr\d+$/i.test(tok)) regs[i] = parseCR(tok);
                else regs[i] = parseSPR(tok);
            }
            return { regs, valState };
        }

        if (t === 'typeBNC') {
            // b/bl: operand is a label or address
            const tok = operands[0];
            if (isLabelRef(tok)) {
                const addr = this.labels.get(tok);
                if (addr == null) throw tokErr(`Unknown label: ${tok}`, tok);
                regs[0] = addr >>> 0;
                valState = 'lab';
            }
            else {
                regs[0] = parseNumber(tok);
            }
            return { regs, valState };
        }

        if (t === 'typeBNCMP') {
            // beq/bne/...
            // either: beq label or beq crX label
            for (let i = 0; i < operands.length; i++) {
                const tok = operands[i];
                if (/^cr\d+$/i.test(tok)) regs[i] = parseCR(tok);
                else if (isLabelRef(tok)) {
                    const addr = this.labels.get(tok);
                    if (addr == null) throw tokErr(`Unknown label: ${tok}`, tok);
                    regs[i] = addr >>> 0;
                    valState = 'lab';
                }
                else {
                    regs[i] = parseNumber(tok);
                }
            }
            return { regs, valState };
        }

        // generic parsing for typeNAN/typeFNAN/typeFONE/typeCND/typeFCND/typeIMM/typeIMM5
        for (let i = 0; i < operands.length; i++) {
            const tok = operands[i];
            if (/^r\d+$/i.test(tok)) regs[i] = parseGPR(tok);
            else if (/^f\d+$/i.test(tok)) regs[i] = parseFPR(tok);
            else if (/^v\d+$/i.test(tok)) regs[i] = parseVPR(tok);
            else if (/^cr\d+$/i.test(tok)) regs[i] = parseCR(tok);
            else if (isLabelRef(tok)) {
                const addr = this.labels.get(tok);
                if (addr == null) throw tokErr(`Unknown label: ${tok}`, tok);
                regs[i] = addr >>> 0;
                valState = 'lab';
            }
            else regs[i] = parseNumber(tok);
        }

        return { regs, valState };
    }

    // encode one instruction
    encode(op, variant, regs, valState, compAddr) {
        let retVal = variant.opCode >>> 0;
        let y = 0;

        switch (variant.type) {
            case 'typeNAN':
            case 'typeFNAN':
            case 'typeFONE':
            case 'typeSPR':
            case 'typeVREG3':
            case 'typeVREG4':
                for (y = 0; y < variant.shifts.length; y++) {
                    retVal |= (regs[variant.order[y]] << variant.shifts[y]) >>> 0;
                }
                return retVal >>> 0;

            case 'typeVX5':
                // vector op whose last operand is a 5-bit immediate (splat / convert / vsldoi)
                for (y = 0; y < variant.shifts.length - 1; y++) {
                    retVal |= (regs[variant.order[y]] << variant.shifts[y]) >>> 0;
                }
                retVal |= ((regs[variant.order[y]] & 0x1f) << variant.shifts[y]) >>> 0;
                return retVal >>> 0;

            case 'typeBNC': {
                for (y = 0; y < (variant.shifts.length - 1); y++) {
                    retVal |= (regs[variant.order[y]] << variant.shifts[y]) >>> 0;
                }
                // offset = ((target - compAddr) / 4) << shiftLast
                const target = regs[variant.order[y]] | 0;
                const offset = (((target - (compAddr | 0)) / 4) | 0) << variant.shifts[y];
                retVal |= (((offset >>> 0) << 6) >>> 6) >>> 0;
                return retVal >>> 0;
            }

            case 'typeOFI':
            case 'typeFOFI':
            case 'typeCND':
            case 'typeFCND':
            case 'typeIMM':
                for (y = 0; y < (variant.shifts.length - 1); y++) {
                    retVal |= (regs[variant.order[y]] << variant.shifts[y]) >>> 0;
                }
                retVal |= ((regs[variant.order[y]] << variant.shifts[y]) & 0xffff) >>> 0;
                return retVal >>> 0;

            case 'typeBNCMP': {
                for (y = 0; y < (variant.shifts.length - 1); y++) {
                    retVal |= (regs[variant.order[y]] << variant.shifts[y]) >>> 0;
                }
                const subVal = (valState === 'lab') ? (compAddr >>> 0) : 0;
                const target = regs[variant.order[y]] >>> 0;
                const cmpOff = ((((target - subVal) / 4) | 0) << variant.shifts[y]) | 0;
                retVal |= (cmpOff & 0xffff) >>> 0;
                return retVal >>> 0;
            }

            case 'typeIMM5':
                return assembleRotate(op, regs, variant, retVal) >>> 0;

            case 'typeMD': {
                // rldicl/rldicr/rldic/rldimi: rA, rS, SH, MB/ME. xo + Rc from opCode
                const rA = regs[variant.order[0]], rS = regs[variant.order[1]];
                const sh = regs[variant.order[2]], mask = regs[variant.order[3]];
                const xo = (variant.opCode >> 2) & 7;
                return (assembleMD(rA, rS, sh, mask, xo) | (variant.opCode & 1)) >>> 0;
            }

            case 'typeXS': {
                // sradi rA, rS, SH. Rc from opCode
                const rA = regs[variant.order[0]], rS = regs[variant.order[1]], sh = regs[variant.order[2]];
                return (assembleSRADI(rA, rS, sh) | (variant.opCode & 1)) >>> 0;
            }

            case 'typeNOP':
                return retVal >>> 0;

            default:
                throw new Error(`Unsupported instruction type: ${variant.type} for ${op}`);
        }
    }

    assemble(asmText) {
        const rawLines = asmText.split(/\r?\n/);
        this.scanLabels(rawLines);

        let compAddr = 0 >>> 0;

        const outWords = [];
        const errors = [];

        // -----------------------------
        // error helpers
        // -----------------------------
        function attachPos(err, lineIndex, rawLine, token, opts = {}) {
            const e = (err instanceof Error) ? err : new Error(String(err));

            // 1-based line for UI
            if (typeof e.line !== 'number' || e.line < 1) {
                e.line = (lineIndex + 1);
            }

            // normalize tabs like the editor does
            const norm = String(rawLine || '').replace(/\t/g, '    ');

            // compute col/len against the code-only region, keeping indentation
            if (token && (typeof e.col !== 'number' || typeof e.length !== 'number')) {
                const codeOnly = stripLine(norm); // stripLine removes comments
                const idx = codeOnly.indexOf(token);
                if (idx >= 0) {
                    e.col = idx;               // 0-based
                    e.length = token.length;   // highlight token
                }
            }

            if (opts.code && !e.code) e.code = opts.code;
            if (opts.stage && !e.stage) e.stage = opts.stage;

            // useful for server logs
            if (!e.rawLine) e.rawLine = stripLine(norm);

            return e;
        }

        function asmError(message, lineIndex, rawLine, token, opts = {}) {
            return attachPos(new Error(String(message)), lineIndex, rawLine, token, opts);
        }

        function assertNoWhitespaceInsideOperand(op, operands) {
            // two tokens jammed into one operand (e.g. "0 shmeck" or "r4 r3").
            // report the extra token factually rather than guessing at a comma
            for (const o of operands) {
                const m = /^(\S+)\s+(\S.*)$/.exec(o);
                if (m) {
                    throw tokErr(`Syntax error: unexpected "${m[2]}" after "${m[1]}"`, m[2]);
                }
            }
        }

        // -----------------------------
        // main pass
        // -----------------------------
        for (let lineIndex = 0; lineIndex < rawLines.length; lineIndex++) {
            const raw = rawLines[lineIndex];

            try {
                const line = stripLine(raw);
                if (!line) continue;

                if (isLabelDecl(line)) continue;

                const parts = line.split(/\s+/);
                const opTok = parts[0] || '';
                const op = opTok.toLowerCase();

                // directives
                if (op === 'address') {
                    try {
                        compAddr = (parseNumber(parts[1]) >>> 0);
                    } catch (e) {
                        throw asmError(`Invalid address value`, lineIndex, raw, opTok, {
                            code: 'BAD_ADDRESS',
                            stage: 'assemble'
                        });
                    }
                    continue;
                }

                if (op === 'hook') {
                    let hookAddr;
                    try {
                        hookAddr = (parseNumber(parts[1]) >>> 0);
                    } catch (e) {
                        throw asmError(`Invalid hook address`, lineIndex, raw, opTok, {
                            code: 'BAD_HOOK_ADDRESS',
                            stage: 'assemble'
                        });
                    }

                    const nextAddr = findNextAddressAfter(rawLines, lineIndex);
                    if (nextAddr === null) {
                        throw asmError(`hook at ${hex8(hookAddr)} has no following address block`, lineIndex, raw, opTok, {
                            code: 'HOOK_NO_FOLLOWING_ADDRESS',
                            stage: 'assemble'
                        });
                    }

                    compAddr = hookAddr;

                    const word = encodeBRelative(hookAddr, nextAddr);
                    outWords.push(hex8(word));

                    compAddr = (compAddr + 4) >>> 0;
                    continue;
                }

                if (op === 'hexcode') {
                    try {
                        const v = parseNumber(parts[1]) >>> 0;
                        outWords.push(hex8(v));
                        compAddr = (compAddr + 4) >>> 0;
                    } catch (e) {
                        throw asmError(`Invalid hexcode value`, lineIndex, raw, opTok, {
                            code: 'BAD_HEXCODE',
                            stage: 'assemble'
                        });
                    }
                    continue;
                }

                if (op === 'float') {
                    const f = parseFloat(parts[1]);
                    if (!Number.isFinite(f)) {
                        throw asmError(`Invalid float value`, lineIndex, raw, opTok, {
                            code: 'BAD_FLOAT',
                            stage: 'assemble'
                        });
                    }

                    const b = Buffer.alloc(4);
                    b.writeFloatLE(f, 0);
                    const v = b.readUInt32LE(0) >>> 0;
                    outWords.push(hex8(v));
                    compAddr = (compAddr + 4) >>> 0;
                    continue;
                }

                if (op === 'string') {
                    const s = line.slice(opTok.length).trim();
                    const bytes = Buffer.from(s, 'utf8');
                    const pad = (4 - (bytes.length % 4 || 4));
                    const padded = Buffer.concat([bytes, Buffer.alloc(pad, 0)]);
                    for (let i = 0; i < padded.length; i += 4) {
                        const v = padded.readUInt32BE(i) >>> 0;
                        outWords.push(hex8(v));
                    }
                    compAddr = (compAddr + padded.length) >>> 0;
                    continue;
                }

                if (op === 'import') {
                    continue;
                }

                const operandText = line.slice(opTok.length).trim();
                const operands = operandText
                    ? operandText.split(',').map(s => s.trim()).filter(Boolean)
                    : [];

                assertNoWhitespaceInsideOperand(op, operands);

                const expanded = expandLine(op, operands, { compAddr, labels: this.labels });

                for (const item of expanded) {
                    const realOp = String(item.op || '').toLowerCase();
                    const realOperands = item.operands || [];

                    if (!this.table.has(realOp)) {
                        // opTok for the squiggle, realOp for the message
                        throw asmError(
                            `Unknown mnemonic: ${realOp}`,
                            lineIndex,
                            raw,
                            opTok,
                            { code: 'UNKNOWN_MNEMONIC', stage: 'assemble' }
                        );
                    }

                    const variant = this.pickVariant(realOp, realOperands);
                    if (!variant) {
                        throw asmError(
                            `No variant found for ${realOp}`,
                            lineIndex,
                            raw,
                            opTok,
                            { code: 'NO_VARIANT', stage: 'assemble' }
                        );
                    }

                    const { regs, valState } = this.parseRegsForVariant(realOp, variant, realOperands, compAddr);
                    const word = this.encode(realOp, variant, regs, valState, compAddr);

                    outWords.push(hex8(word));
                    compAddr = (compAddr + 4) >>> 0;
                }
            } catch (err) {
                // keep structured info, make sure line is always set. prefer the
                // offending token the error carries, fall back to the mnemonic
                const opTok = (() => {
                    try {
                        const codeOnly = stripLine(String(raw || '').replace(/\t/g, '    '));
                        const m = /^\s*([A-Za-z.][A-Za-z0-9_.]*)\b/.exec(codeOnly);
                        return m ? m[1] : null;
                    } catch {
                        return null;
                    }
                })();

                // collect and keep going so every bad line is reported at once
                errors.push(attachPos(err, lineIndex, raw, err && err.token ? err.token : opTok, { stage: 'assemble' }));
            }
        }

        if (errors.length) throw makeMultiError(errors);

        return outWords;
    }
}

function makeAssembler() {
    return new PPCAssembler();
}

module.exports = {
    PPCAssembler,
    makeAssembler
};