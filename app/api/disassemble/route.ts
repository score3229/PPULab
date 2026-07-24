import { NextRequest } from "next/server";
import { guard, json, preflight } from "@/lib/api-guard";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { disassemble, parseWords } = require("@/lib/ppc_disassembler");

export async function OPTIONS() {
  return preflight();
}

export async function POST(req: NextRequest) {
  const g = await guard(req);
  if (!g.ok) return g.res;

  try {
    const { hex, baseAddress } = g.body;

    if (typeof hex !== "string") {
      return json({ ok: false, error: { message: "hex must be a string" } }, 400);
    }

    const opts: { baseAddress?: number } = {};
    if (typeof baseAddress === "number" && Number.isFinite(baseAddress)) {
      opts.baseAddress = baseAddress >>> 0;
    }

    // content that parses to zero words is unreadable input, not empty
    if (hex.trim() && parseWords(hex).length === 0) {
      return json({ ok: false, error: { message: "couldn't find any hex words in the input" } }, 400);
    }

    const out = disassemble(hex, opts);
    return json({ ok: true, out });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Disassemble failed";
    return json({ ok: false, error: { message: msg } }, 400);
  }
}
