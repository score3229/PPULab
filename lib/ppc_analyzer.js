'use strict';

const {
    byName
} = require('./asm/asm_declarations.overrides');

const {
    expandPseudo
} = require('./asm/asm_pseudos');

// -----------------------
// utilities (same as ppc_assembler.js)
// -----------------------
function hex8(n) {
    return (n >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

function stripLine(line) {
    // same as assembler: strip //, #, ; comments and trim
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

function parseNumber(tok) {
    tok = String(tok ?? '').replace(/,/g, '').trim();
    if (!tok) throw new Error('Missing number');

    let neg = false;
    if (tok.startsWith('-')) {
        neg = true;
        tok = tok.slice(1).trim();
        if (!tok) throw new Error('Missing number');
    }

    let v;

    if (/^0x[0-9a-fA-F]+$/.test(tok)) v = parseInt(tok.slice(2), 16);
    else if (/^\$[0-9a-fA-F]+$/.test(tok)) v = parseInt(tok.slice(1), 16);
    else if (/^\d+$/.test(tok)) v = parseInt(tok, 10);
    else throw new Error(`Bad numeric token: ${neg ? '-' : ''}${tok}`);

    if (!Number.isFinite(v)) throw new Error(`Bad number: ${neg ? '-' : ''}${tok}`);
    v = (v | 0);
    return neg ? -v : v;
}

function findNextAddressAfter(lines, startIndex) {
    for (let i = startIndex + 1; i < lines.length; i++) {
        const line = stripLine(lines[i]);
        if (!line) continue;
        if (isLabelDecl(line)) continue;

        const parts = line.split(/\s+/);
        const op = (parts[0] || '').toLowerCase();
        if (op === 'address') {
            return parseNumber(parts[1]) >>> 0;
        }
    }
    return null;
}

function assertNoWhitespaceInsideOperand(operands) {
    for (const o of operands) {
        if (/\s/.test(o)) {
            throw new Error(`Syntax error: unexpected whitespace in operand "${o}" (missing comma?)`);
        }
    }
}

function splitOperands(line, opTok) {
    const operandText = line.slice(opTok.length).trim();
    const operands = operandText
        ? operandText.split(',').map(s => s.trim()).filter(Boolean)
        : [];
    assertNoWhitespaceInsideOperand(operands);
    return operands;
}

function expandLine(op, operands, ctx) {
    // same pseudo expansion loop as the assembler
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
// label scan (same as assembler.scanLabels)
// -----------------------
function scanLabels(rawLines, table) {
    const labels = new Map();
    let compAddr = 0 >>> 0;

    // no address/hook anywhere means base 0, so bind labels here instead of
    // waiting for an address that never comes (else branch edges never resolve)
    const hasAnyAddress = rawLines.some(raw => {
        const l = stripLine(raw);
        if (!l) return false;
        const o = (l.split(/\s+/)[0] || '').toLowerCase();
        return o === 'address' || o === 'hook';
    });
    let haveAddress = !hasAnyAddress;

    let pendingLabels = [];     // labels seen before first address-setting directive
    let recentLabels = [];      // consecutive label declarations immediately before a directive

    for (const raw of rawLines) {
        const line = stripLine(raw);
        if (!line) continue;

        if (isLabelDecl(line)) {
            const name = labelName(line);

            // track consecutive labels (entry: then maybe anotherLabel:)
            recentLabels.push(name);

            if (!haveAddress) {
                // don't bind to 0, bind to the next address/hook instead
                pendingLabels.push(name);
            } else {
                // normal case: bind to current compAddr
                labels.set(name, compAddr >>> 0);
            }
            continue;
        }

        const parts = line.split(/\s+/);
        const op = (parts[0] || '').toLowerCase();

        // any real non-label line breaks the preceding-directive chain
        if (op !== 'address' && op !== 'hook') {
            recentLabels = [];
        }

        if (op === 'address') {
            compAddr = (parseNumber(parts[1]) >>> 0);
            haveAddress = true;

            // labeled address form (address <addr> <name>) binds the name here,
            // which is what an inline func @ addr desugars to
            if (parts[2]) labels.set(parts[2], compAddr >>> 0);

            // bind labels that appeared before an address
            if (pendingLabels.length) {
                for (const n of pendingLabels) labels.set(n, compAddr >>> 0);
                pendingLabels = [];
            }

            // also bind labels immediately before this address line
            if (recentLabels.length) {
                for (const n of recentLabels) labels.set(n, compAddr >>> 0);
                recentLabels = [];
            }

            continue;
        }

        if (op === 'hook') {
            const hookAddr = (parseNumber(parts[1]) >>> 0);
            compAddr = hookAddr;
            haveAddress = true;

            if (pendingLabels.length) {
                for (const n of pendingLabels) labels.set(n, compAddr >>> 0);
                pendingLabels = [];
            }
            if (recentLabels.length) {
                for (const n of recentLabels) labels.set(n, compAddr >>> 0);
                recentLabels = [];
            }

            compAddr = (compAddr + 4) >>> 0; // emits one branch
            continue;
        }

        if (op === 'hexcode') { compAddr = (compAddr + 4) >>> 0; continue; }
        if (op === 'float') { compAddr = (compAddr + 4) >>> 0; continue; }

        if (op === 'string') {
            const str = line.slice(parts[0].length).trim();
            const bytes = Buffer.from(str, 'utf8');
            const padded = (bytes.length + (4 - (bytes.length % 4 || 4))) >>> 0;
            compAddr = (compAddr + padded) >>> 0;
            continue;
        }

        if (op === 'import') continue;

        const operands = splitOperands(line, parts[0]);
        const isPseudo = !!expandPseudo(op, operands, { compAddr, labels });

        // unknown tokens don't advance compAddr
        if (!isPseudo && !table.has(op)) continue;

        if (!haveAddress) {
            // allowed (address can be 0)
        }

        const expanded = expandLine(op, operands, { compAddr, labels });
        compAddr = (compAddr + (expanded.length * 4)) >>> 0;
    }

    return labels;
}

// -----------------------
// instruction classification (cfg-relevant)
// -----------------------
function classifyInstruction(opLower, operands, resolvedTargetAddr) {
    // returns { kind, hasFallthrough }
    // bl target      -> call (fallthrough)
    // b target       -> jump (no fallthrough)
    // beq/bne/...    -> conditional (fallthrough)
    // blr/bctr/bctrl -> return/indirect (no fallthrough)
    // mnemonic matching is enough for the cfg, not table-driven

    const op = opLower;

    // returns / indirect
    if (op === 'blr') return { kind: 'return', hasFallthrough: false };
    if (op === 'bctr' || op === 'bctrl') return { kind: 'indirect', hasFallthrough: false };
    if (op === 'bclr' || op === 'bclrl') {
        // some assemblers emit these, treat as return/indirect
        return { kind: 'indirect', hasFallthrough: false };
    }

    // direct call
    if (op === 'bl' || op === 'bla') {
        return { kind: 'call', hasFallthrough: true };
    }

    // unconditional direct branch
    if (op === 'b' || op === 'ba') {
        return { kind: 'jump', hasFallthrough: false };
    }

    // conditional return to LR (beqlr, bnelr, beqlr+, ...): returns if taken, else falls through
    if (/^b(eq|ne|lt|le|gt|ge|so|ns)lrl?[+-]?$/.test(op)) {
        return { kind: 'cond-return', hasFallthrough: true };
    }

    // conditional branch to CTR (beqctr, bnectr+, ...): computed target or falls through
    if (/^b(eq|ne|lt|le|gt|ge|so|ns)ctrl?[+-]?$/.test(op)) {
        return { kind: 'cond-ctr', hasFallthrough: true };
    }

    // conditional branch family
    if (/^b(eq|ne|lt|le|gt|ge|so|ns|dnz|dz|ctr|tl|fl)/.test(op)) {
        // intentionally broad
        return { kind: 'cond-branch', hasFallthrough: true };
    }

    // also catch bc, bca, bcl, bcla
    if (op === 'bc' || op === 'bca' || op === 'bcl' || op === 'bcla') {
        return { kind: 'cond-branch', hasFallthrough: true };
    }

    // otherwise normal instruction
    return { kind: 'other', hasFallthrough: true };
}

// -----------------------
// analyze: listing, basic blocks, edges
// -----------------------
function analyzePPC(asmText, options = {}) {
    const {
        maxNodeLines = 16,          // preview lines for graph nodes
        includeDataInBlocks = false // whether hexcode/float/string become block lines (usually false)
    } = options;

    const rawLines = String(asmText ?? '').split(/\r?\n/);

    // build declaration table (same as assembler)
    const table = byName(); // mnemonic -> variants, used for is-known checks

    // scan labels with the same accounting
    const labels = scanLabels(rawLines, table);

    // build a linear listing with addresses and resolved targets
    let compAddr = 0 >>> 0;

    /** @type {Array<{
     *  addr:number, op:string, operands:string[], text:string,
     *  kind:string, targetAddr?:number, targetLabel?:string,
     *  srcLine:number, // 1-based original line for UI mapping
     * }>} */
    const listing = [];

    for (let i = 0; i < rawLines.length; i++) {
        const raw = rawLines[i];
        const line = stripLine(raw);
        if (!line) continue;

        if (isLabelDecl(line)) continue;

        const parts = line.split(/\s+/);
        const opTok = parts[0] || '';
        const op = opTok.toLowerCase();

        // directives
        if (op === 'address') {
            compAddr = (parseNumber(parts[1]) >>> 0);
            continue;
        }

        if (op === 'hook') {
            const hookAddr = (parseNumber(parts[1]) >>> 0);
            const nextAddr = findNextAddressAfter(rawLines, i);
            // treat as an emitted "b nextAddr" at hookAddr
            compAddr = hookAddr;

            if (nextAddr != null) {
                listing.push({
                    addr: compAddr >>> 0,
                    op: 'b',
                    operands: [`0x${hex8(nextAddr)}`],
                    text: `b 0x${hex8(nextAddr)}`,
                    kind: 'jump',
                    targetAddr: nextAddr >>> 0,
                    srcLine: i + 1
                });
            } else {
                // still advance addr like the assembler, no edge target
                listing.push({
                    addr: compAddr >>> 0,
                    op: 'b',
                    operands: [],
                    text: 'b <unknown>',
                    kind: 'jump',
                    srcLine: i + 1
                });
            }

            compAddr = (compAddr + 4) >>> 0;
            continue;
        }

        if (op === 'hexcode') {
            // data, usually excluded from the cfg
            const v = parseNumber(parts[1]) >>> 0;
            if (includeDataInBlocks) {
                listing.push({
                    addr: compAddr >>> 0,
                    op: 'hexcode',
                    operands: [parts[1]],
                    text: `hexcode 0x${hex8(v)}`,
                    kind: 'data',
                    srcLine: i + 1
                });
            }
            compAddr = (compAddr + 4) >>> 0;
            continue;
        }

        if (op === 'float') {
            if (includeDataInBlocks) {
                listing.push({
                    addr: compAddr >>> 0,
                    op: 'float',
                    operands: [parts[1]],
                    text: `float ${parts[1]}`,
                    kind: 'data',
                    srcLine: i + 1
                });
            }
            compAddr = (compAddr + 4) >>> 0;
            continue;
        }

        if (op === 'string') {
            const s = line.slice(opTok.length).trim();
            const bytes = Buffer.from(s, 'utf8');
            const pad = (4 - (bytes.length % 4 || 4));
            const paddedLen = bytes.length + pad;
            if (includeDataInBlocks) {
                listing.push({
                    addr: compAddr >>> 0,
                    op: 'string',
                    operands: [s],
                    text: `string ${s}`,
                    kind: 'data',
                    srcLine: i + 1
                });
            }
            compAddr = (compAddr + paddedLen) >>> 0;
            continue;
        }

        if (op === 'import') continue;

        // instructions (including pseudos)
        const operands = splitOperands(line, opTok);

        const expanded = expandLine(op, operands, { compAddr, labels });

        for (const item of expanded) {
            const realOp = String(item.op || '').toLowerCase();
            const realOperands = (item.operands || []).map(s => String(s));

            // skip unknown tokens not in the table (same as the scan)
            const isPseudo = !!expandPseudo(realOp, realOperands, { compAddr, labels });
            const isKnown = table.has(realOp);
            if (!isKnown && !isPseudo) {
                // don't advance address for unknowns (same as scanLabels)
                continue;
            }

            // resolve a branch/call target when operand 0 is a label or number
            let targetAddr = undefined;
            let targetLabel = undefined;

            if (realOperands.length > 0) {
                const tok0 = String(realOperands[0]).replace(/,/g, '').trim();

                if (isLabelRef(tok0) && labels.has(tok0)) {
                    targetLabel = tok0;
                    targetAddr = labels.get(tok0) >>> 0;
                } else {
                    // allow numeric immediate as target (0x..., $..., decimal)
                    try {
                        // only parse if it looks numeric
                        if (/^(?:-?0x[0-9a-fA-F]+|-?\$[0-9a-fA-F]+|-?\d+)$/.test(tok0)) {
                            targetAddr = (parseNumber(tok0) >>> 0);
                        }
                    } catch {
                        // ignore
                    }
                }
            }

            const cls = classifyInstruction(realOp, realOperands, targetAddr);

            // text for node display, keep close to the input
            const text = realOperands.length
                ? `${realOp} ${realOperands.join(', ')}`
                : `${realOp}`;

            listing.push({
                addr: compAddr >>> 0,
                op: realOp,
                operands: realOperands,
                text,
                kind: cls.kind,
                targetAddr,
                targetLabel,
                srcLine: i + 1
            });

            compAddr = (compAddr + 4) >>> 0;
        }
    }

    if (listing.length === 0) {
        return {
            labels: Object.fromEntries(labels.entries()),
            listing: [],
            blocks: [],
            edges: [],
            callNodes: []
        };
    }

    // map address -> listing index (for fallthrough)
    const addrToIndex = new Map();
    for (let idx = 0; idx < listing.length; idx++) {
        addrToIndex.set(listing[idx].addr >>> 0, idx);
    }

    // leaders
    const leaderAddrs = new Set();
    leaderAddrs.add(listing[0].addr >>> 0);

    for (let idx = 0; idx < listing.length; idx++) {
        const ins = listing[idx];
        const next = listing[idx + 1];

        // branch/jump target is a leader if it points at an instruction
        if ((ins.kind === 'jump' || ins.kind === 'cond-branch') && typeof ins.targetAddr === 'number') {
            if (addrToIndex.has(ins.targetAddr >>> 0)) leaderAddrs.add(ins.targetAddr >>> 0);
        }

        // calls don't split the block, the next instruction stays in the
        // same block (like ida)

        // any terminator makes the next instruction a leader
        if (next) {
            const isTerminator = (ins.kind === 'jump' || ins.kind === 'return' || ins.kind === 'indirect');
            const isCond = (ins.kind === 'cond-branch' || ins.kind === 'cond-return' || ins.kind === 'cond-ctr');
            if (isTerminator || isCond) {
                leaderAddrs.add(next.addr >>> 0);
            }
        }
    }

    // reverse lookup: address -> label names
    const addrToLabelNames = new Map();
    for (const [name, addr] of labels.entries()) {
        const a = addr >>> 0;
        let arr = addrToLabelNames.get(a);
        if (!arr) { arr = []; addrToLabelNames.set(a, arr); }
        arr.push(name);
    }

    // real labels by address, so an unlabeled block names itself owner+offset
    const ownerLabels = [];
    for (const [name, addr] of labels.entries()) {
        if (!/^loc_/i.test(name)) ownerLabels.push({ name, addr: addr >>> 0 });
    }
    ownerLabels.sort((a, b) => a.addr - b.addr);
    function nearestOwner(addr) {
        let best = null;
        for (const l of ownerLabels) {
            if (l.addr <= addr) best = l; else break;
        }
        return best;
    }

    // build blocks by splitting the listing at leaders
    const leadersSorted = Array.from(leaderAddrs).sort((a, b) => (a >>> 0) - (b >>> 0));
    const leaderSet = new Set(leadersSorted);

    const blocks = [];
    const addrToBlockId = new Map();

    for (let li = 0; li < leadersSorted.length; li++) {
        const startAddr = leadersSorted[li] >>> 0;
        const startIndex = addrToIndex.get(startAddr);
        if (startIndex == null) continue;

        const endIndexExclusive = (() => {
            // ends right before the next leader (or end of listing)
            for (let j = startIndex + 1; j < listing.length; j++) {
                if (leaderSet.has(listing[j].addr >>> 0)) return j;
            }
            return listing.length;
        })();

        const blockIns = listing.slice(startIndex, endIndexExclusive);
        const endAddr = (blockIns.length ? (blockIns[blockIns.length - 1].addr + 4) : startAddr) >>> 0;

        const blockId = `block_${hex8(startAddr)}`;

        for (const ins of blockIns) {
            addrToBlockId.set(ins.addr >>> 0, blockId);
        }

        // node label preview (header + loc + divider + instructions)
        const locHeader = `loc_${hex8(startAddr)}`;

        const names = addrToLabelNames.get(startAddr >>> 0) || [];
        const userLabel = names.find(n => !/^loc_/i.test(n)) || null;

        // unlabeled continuation -> owner+offset, not a bare address
        let contName = locHeader;
        if (!userLabel) {
            const owner = nearestOwner(startAddr >>> 0);
            if (owner) contName = `${owner.name}+0x${((startAddr - owner.addr) >>> 0).toString(16).toUpperCase()}`;
        }

        // single-line header
        const headerLine = userLabel
            ? `${userLabel} (${locHeader})`
            : contName;

        const bodyLines = blockIns.map(x => x.text);
        const preview = bodyLines.length > maxNodeLines
            ? bodyLines.slice(0, maxNodeLines).concat(['…'])
            : bodyLines;

        // divider
        const lines = [headerLine];
        const dividerLen = Math.min(
            Math.max(headerLine.length, ...preview.map(l => l.length)),
            28
        );
        lines.push('─'.repeat(dividerLen));
        lines.push(...preview);

        const firstAddr = listing[0].addr >>> 0;
        const isEntry = (startAddr >>> 0) === firstAddr;

        const lastIns = blockIns[blockIns.length - 1];
        let blockType = 'normal';

        // a conditional return either returns (if taken) or falls through;
        // a conditional ctr branch takes a computed target or falls through
        const condReturn = lastIns?.kind === 'cond-return';
        const condCtr = lastIns?.kind === 'cond-ctr';

        if (isEntry) blockType = 'entry';
        else if (lastIns?.kind === 'return') blockType = 'exit';
        else if (lastIns?.kind === 'cond-branch' || condReturn || condCtr) blockType = 'cond';
        else if (lastIns?.kind === 'jump') blockType = 'jump';

        blocks.push({
            id: blockId,
            start: startAddr,
            end: endAddr,
            header: userLabel || contName,
            blockType,
            condReturn,
            condCtr,
            lines: blockIns.map(x => ({
                addr: x.addr >>> 0,
                text: x.text,
                kind: x.kind,
                targetAddr: x.targetAddr,
                targetLabel: x.targetLabel,
                srcLine: x.srcLine
            })),
            label: lines.join('\n')
        });
    }

    // build edges
    const edges = [];
    const callNodes = [];
    const seenCallNode = new Map(); // key -> callNodeId

    function addEdge(from, to, type, meta = {}) {
        edges.push({
            id: `${type}_${from}_${to}_${edges.length}`,
            from,
            to,
            type,
            ...meta
        });
    }

    for (const block of blocks) {
        const last = block.lines[block.lines.length - 1];
        if (!last) continue;

        const lastAddr = last.addr >>> 0;
        const lastIndex = addrToIndex.get(lastAddr);

        // fallthrough edge unless terminator/jump/return/indirect
        const nextIns = (typeof lastIndex === 'number') ? listing[lastIndex + 1] : null;

        const isNoFallthrough = (last.kind === 'jump' || last.kind === 'return' || last.kind === 'indirect');

        if (!isNoFallthrough && nextIns) {
            const toBlock = addrToBlockId.get(nextIns.addr >>> 0);
            if (toBlock) addEdge(block.id, toBlock, 'fallthrough');
        }

        // branch/jump edges
        if ((last.kind === 'jump' || last.kind === 'cond-branch') && typeof last.targetAddr === 'number') {
            const toBlock = addrToBlockId.get(last.targetAddr >>> 0);
            if (toBlock) addEdge(block.id, toBlock, (last.kind === 'jump') ? 'jump' : 'branch');
        }

        // call edges: dashed edge to a call node if resolvable
        // calls may not be last in the block, so scan all block lines
        for (const ins of block.lines) {
            if (ins.kind !== 'call') continue;

            // determine call target (address or label)
            const callKey = (() => {
                if (typeof ins.targetAddr === 'number') return `addr_${hex8(ins.targetAddr >>> 0)}`;
                if (ins.targetLabel) return `lbl_${ins.targetLabel}`;
                return `unk_${block.id}_${ins.addr}`;
            })();

            let callNodeId = seenCallNode.get(callKey);
            if (!callNodeId) {
                // stable id for node
                callNodeId = `call_${callKey.replace(/[^A-Za-z0-9_]/g, '_')}`;
                seenCallNode.set(callKey, callNodeId);

                const display = (() => {
                    if (typeof ins.targetAddr === 'number') return `CALL 0x${hex8(ins.targetAddr >>> 0)}`;
                    if (ins.targetLabel) return `CALL ${ins.targetLabel}`;
                    return 'CALL <indirect>';
                })();

                callNodes.push({
                    id: callNodeId,
                    addr: (typeof ins.targetAddr === 'number') ? (ins.targetAddr >>> 0) : null,
                    label: display
                });
            }

            addEdge(block.id, callNodeId, 'call', {
                callSiteAddr: ins.addr >>> 0,
                callTargetAddr: (typeof ins.targetAddr === 'number') ? (ins.targetAddr >>> 0) : null,
                callTargetLabel: ins.targetLabel || null
            });
        }
    }

    return {
        labels: Object.fromEntries(labels.entries()),
        listing,
        blocks,
        edges,
        callNodes
    };
}

module.exports = {
    analyzePPC
};