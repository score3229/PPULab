import { NextRequest } from "next/server";
import { guard, json, preflight } from "@/lib/api-guard";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { makeAssembler } = require("@/lib/ppc_assembler");

export async function OPTIONS() {
  return preflight();
}

export async function POST(req: NextRequest) {
  const g = await guard(req);
  if (!g.ok) return g.res;

  try {
    const { asm } = g.body;

    if (typeof asm !== "string") {
      return json({ ok: false, error: { message: "asm must be a string" } }, 400);
    }

    const assembler = makeAssembler();
    const result = assembler.assemble(asm);

    const out = Array.isArray(result)
      ? result
          .map((v: number | string) =>
            typeof v === "number"
              ? "0x" + (v >>> 0).toString(16).toUpperCase().padStart(8, "0")
              : String(v)
          )
          .join("\n")
      : String(result);

    return json({ ok: true, out });
  } catch (err: unknown) {
    type ErrItem = { message?: string; line?: number; col?: number; length?: number; code?: string; stage?: string };
    const e = err as Error & {
      line?: number;
      col?: number;
      length?: number;
      rawLine?: string;
      stage?: string;
      code?: string;
      errors?: ErrItem[];
    };

    const msg = (e?.message ?? String(err)) || "Assemble failed";

    const hasLine = Number.isFinite(e?.line);
    const hasCol = Number.isFinite(e?.col);
    const hasLen = Number.isFinite(e?.length);

    // the full list when the assembler collected more than one
    const errors = Array.isArray(e?.errors)
      ? e.errors.map((x) => ({
          message: String(x.message ?? "Assemble failed"),
          line: Number.isFinite(x.line) ? (x.line! | 0) : undefined,
          col: Number.isFinite(x.col) ? (x.col! | 0) : undefined,
          length: Number.isFinite(x.length) ? (x.length! | 0) : undefined,
          code: x.code ? String(x.code) : undefined,
          stage: x.stage ? String(x.stage) : undefined,
        }))
      : undefined;

    if (hasLine || hasCol || hasLen || e?.rawLine || errors) {
      return json(
        {
          ok: false,
          error: {
            message: msg,
            line: hasLine ? (e.line! | 0) : undefined,
            col: hasCol ? (e.col! | 0) : undefined,
            length: hasLen ? (e.length! | 0) : undefined,
            rawLine: e?.rawLine ? String(e.rawLine) : undefined,
            stage: e?.stage ? String(e.stage) : undefined,
            code: e?.code ? String(e.code) : undefined,
            errors,
          },
        },
        400
      );
    }

    return json({ ok: false, error: { message: msg } }, 400);
  }
}
