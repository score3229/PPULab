import { NextRequest } from "next/server";
import { guard, json, preflight } from "@/lib/api-guard";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { analyzePPC } = require("@/lib/ppc_analyzer");

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

    const graph = analyzePPC(asm, {
      maxNodeLines: 16,
      includeDataInBlocks: false,
    });

    return json({ ok: true, graph });
  } catch (err: unknown) {
    const e = err as Error & {
      line?: number;
      col?: number;
      length?: number;
      rawLine?: string;
      stage?: string;
      code?: string;
    };

    const msg = (e?.message ?? String(err)) || "Analyze failed";

    const hasLine = Number.isFinite(e?.line);
    const hasCol = Number.isFinite(e?.col);
    const hasLen = Number.isFinite(e?.length);

    if (hasLine || hasCol || hasLen || e?.rawLine) {
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
          },
        },
        400
      );
    }

    return json({ ok: false, error: { message: msg } }, 400);
  }
}
