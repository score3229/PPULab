"use strict";

const { byName: pseudoByName } = require("./asm_pseudos.overrides");

const PSEUDO_TABLE = pseudoByName();

function pickVariant(name, operands) {
    const vars = PSEUDO_TABLE.get(name);
    if (!vars || vars.length === 0) return null;

    for (const v of vars) {
        if (v.args.length === operands.length) return v;
    }
    return null;
}

// returns [{ op, operands }] or null if not a pseudo
function expandPseudo(op, operands, ctx) {
    const name = op.toLowerCase();
    const v = pickVariant(name, operands);
    if (!v) return null;

    const out = v.expand(operands, ctx) || [];
    return out.map(x => ({
        op: String(x.op || "").toLowerCase(),
        operands: Array.isArray(x.operands) ? x.operands : []
    }));
}

module.exports = {
    expandPseudo
};