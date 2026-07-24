"use strict";

const EXTRA = [
    {
        name: "mr",
        args: ["reg", "reg"],
        title: "Move Register (mr)",
        help: "Copies register rS into register rD (expands to or rD, rS, rS).",
        example: "mr r3, r4",
        expand: (operands, ctx) => {
            return [
                { op: "or", operands: [operands[0], operands[1], operands[1]] }
            ];
        }
    },
    {
        name: "mflr",
        args: ["reg"],
        title: "Move From LR (mflr)",
        help: "Copies the link register into register rD (expands to mfspr rD, lr).",
        example: "mflr r0",
        expand: (operands, ctx) => {
            return [
                { op: "mfspr", operands: [operands[0], "lr"] }
            ];
        }
    },
    {
        name: "mtlr",
        args: ["reg"],
        title: "Move To LR (mtlr)",
        help: "Copies register rS into the link register (expands to mtspr lr, rS).",
        example: "mtlr r0",
        expand: (operands, ctx) => {
            return [
                { op: "mtspr", operands: ["lr", operands[0]] }
            ];
        }
    },
    {
        name: "mfctr",
        args: ["reg"],
        title: "Move From CTR (mfctr)",
        help: "Copies the count register into register rD (expands to mfspr rD, ctr).",
        example: "mfctr r3",
        expand: (operands, ctx) => {
            return [
                { op: "mfspr", operands: [operands[0], "ctr"] }
            ];
        }
    },
    {
        name: "mtctr",
        args: ["reg"],
        title: "Move To CTR (mtctr)",
        help: "Copies register rS into the count register (expands to mtspr ctr, rS).",
        example: "mtctr r3",
        expand: (operands, ctx) => {
            return [
                { op: "mtspr", operands: ["ctr", operands[0]] }
            ];
        }
    },
    {
        name: "load32",
        args: ["reg", "imm32"],
        title: "Load 32-bit Immediate (load32)",
        help: "Loads a full 32-bit immediate into register rD (expands to lis rD, hi16; ori rD, rD, lo16).",
        example: "load32 r3, 0x00B00000",
        expand: (operands, ctx) => {
            const rD = operands[0];
            const imm = operands[1];

            let value;

            // label constants work too
            if (ctx && ctx.labels && ctx.labels.has(imm)) {
                value = ctx.labels.get(imm) >>> 0;
            } else {
                // parseInt("0x00a5ea30", 0) works fine
                value = (parseInt(imm, 0) >>> 0);
                if (!Number.isFinite(value)) {
                    throw new Error(`Bad imm32: ${imm}`);
                }
            }

            const hi = (value >>> 16) & 0xffff;
            const lo = value & 0xffff;

            return [
                { op: "lis", operands: [rD, `0x${hi.toString(16)}`] },
                { op: "ori", operands: [rD, rD, `0x${lo.toString(16)}`] }
            ];
        }
    },
    {
        name: "load64",
        args: ["reg", "imm64"],
        title: "Load 64-bit Immediate (load64)",
        help: "Loads a full 64-bit immediate into register rD, using the fewest instructions the value needs (1 to 5).",
        example: "load64 r3, 0x1234567890ABCDEF",
        expand: (operands, ctx) => {
            const rD = operands[0];
            const imm = operands[1];

            let value;

            // label constants work too, same as load32
            if (ctx && ctx.labels && ctx.labels.has(imm)) {
                value = BigInt(ctx.labels.get(imm) >>> 0);
            } else {
                // bigint so the high 32 bits survive (a number would lose them)
                try {
                    value = BigInt(imm);
                } catch {
                    throw new Error(`Bad imm64: ${imm}`);
                }
            }

            value &= 0xffffffffffffffffn;
            const w0 = Number((value >> 48n) & 0xffffn); // bits 63..48
            const w1 = Number((value >> 32n) & 0xffffn); // bits 47..32
            const w2 = Number((value >> 16n) & 0xffffn); // bits 31..16
            const w3 = Number(value & 0xffffn);          // bits 15..0
            const hasHigh = (value >> 32n) !== 0n;

            const h = (v) => `0x${v.toString(16)}`;
            const ops = [];

            // only emit the words the value actually needs. li/lis sign-extend,
            // so guard the cases where that would corrupt the upper bits.
            if (hasHigh) {
                // load the top 32 bits low, the sldi drops any sign extension
                if (w0 !== 0) {
                    ops.push({ op: "lis", operands: [rD, h(w0)] });
                    if (w1 !== 0) ops.push({ op: "ori", operands: [rD, rD, h(w1)] });
                } else if (w1 < 0x8000) {
                    ops.push({ op: "li", operands: [rD, h(w1)] });
                } else {
                    // bit 15 set, li would sign-extend into bits 31..16
                    ops.push({ op: "lis", operands: [rD, h(0)] });
                    ops.push({ op: "ori", operands: [rD, rD, h(w1)] });
                }
                ops.push({ op: "sldi", operands: [rD, rD, "32"] });
                if (w2 !== 0) ops.push({ op: "oris", operands: [rD, rD, h(w2)] });
                if (w3 !== 0) ops.push({ op: "ori", operands: [rD, rD, h(w3)] });
            } else if (w2 !== 0) {
                // 32-bit value. clear the top half when lis sign-extends it
                ops.push({ op: "lis", operands: [rD, h(w2)] });
                if (w3 !== 0) ops.push({ op: "ori", operands: [rD, rD, h(w3)] });
                if (w2 >= 0x8000) ops.push({ op: "clrldi", operands: [rD, rD, "32"] });
            } else if (w3 === 0) {
                ops.push({ op: "li", operands: [rD, h(0)] });
            } else if (w3 < 0x8000) {
                ops.push({ op: "li", operands: [rD, h(w3)] });
            } else {
                // 16-bit value with bit 15 set, needs a zero-extended load
                ops.push({ op: "li", operands: [rD, h(0)] });
                ops.push({ op: "ori", operands: [rD, rD, h(w3)] });
            }

            return ops;
        }
    },
    {
        name: "call",
        args: ["addr"],
        title: "Call Absolute (call)",
        help: "Calls the function at addr, clobbering r12 (expands to load32 r12, addr; mtctr r12; bctrl).",
        example: "call 0x0024A7FC",
        expand: (operands, ctx) => {
            const addr = operands[0];
            return [
                { op: "load32", operands: ["r12", addr] },
                { op: "mtctr", operands: ["r12"] },
                { op: "bctrl", operands: [] }
            ];
        }
    },
    {
        name: "jmp",
        args: ["addr"],
        title: "Jump Absolute (jmp)",
        help: "Jumps to addr, clobbering r12 (expands to load32 r12, addr; mtctr r12; bctr).",
        example: "jmp 0x0024A7FC",
        expand: (operands, ctx) => {
            const addr = operands[0];
            return [
                { op: "load32", operands: ["r12", addr] },
                { op: "mtctr", operands: ["r12"] },
                { op: "bctr", operands: [] }
            ];
        }
    }
];

function byName() {
    const m = new Map();
    for (const p of EXTRA) {
        const k = p.name.toLowerCase();
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(p);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.args.length - b.args.length);
    return m;
}

module.exports = {
    PSEUDOS: EXTRA,
    byName
};