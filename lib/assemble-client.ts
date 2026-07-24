// client-side assemble flow.
// runs the front-end passes, calls the assemble api, returns a structured
// result so the caller can highlight errors.

import { validateAliasUsage, preprocessAsmWithAliases } from "@/lib/alias-preprocessor";
import { preprocessFuncs, validateFuncs } from "@/lib/func-preprocessor";
import { preprocessStructs, emitStructData } from "@/lib/struct-preprocessor";
import { resolveImports } from "@/lib/import-resolver";
import { getAssembleStats } from "@/lib/output-formats";
import * as store from "@/lib/file-store";

export interface AssembleError {
  message: string;
  line?: number;
  col?: number;
  length?: number;
}

export type AssembleResult =
  // `source` is the backend-ready asm (plus any struct data blocks) the output
  // formatter maps words to addresses against. `note` is the stats line.
  // `errors` is the full list when the assembler collects more than one; the
  // primary `error` is always the first, for back-compat.
  | { ok: true; out: string; source: string; note: string }
  | { ok: false; error: AssembleError; errors?: AssembleError[] };

function hexWord(w: number): string {
  return "0x" + (w >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

export type PreprocessResult =
  // `errors` is the full list when a stage finds more than one; `error` is the
  // first, for back-compat.
  | { ok: true; asm: string }
  | { ok: false; error: AssembleError; errors: AssembleError[] };

// each stage reports every problem it finds (all missing imports, all misplaced
// params, etc. at once). stop at the first failing stage so a broken earlier
// pass doesn't cascade.
export function preprocessForBackend(asmText: string): PreprocessResult {
  // imports first, swaps `bl otherFunc` for its address and gathers imported defs
  const imp = resolveImports(asmText, (name) => {
    const f = store.getFile(name);
    return f ? f.asm : null;
  });
  if (imp.missing.length) {
    const errors = imp.missing.map((m) => ({ message: `import not found: ${m.name}`, line: m.line, length: m.name.length }));
    return { ok: false, error: errors[0], errors };
  }

  // param must sit inside a func/sub
  const vf = validateFuncs(imp.text);
  if (!vf.ok) {
    const list = vf.errors && vf.errors.length ? vf.errors : [{ message: vf.message, line: vf.line, col: vf.col, length: vf.length }];
    const errors = list.map((e) => ({ message: e.message, line: e.line, col: e.col, length: e.length }));
    return { ok: false, error: errors[0], errors };
  }

  // func/sub headers: strip to labels, resolve register params, scope locals
  const funcText = preprocessFuncs(imp.text, imp.structText);

  // struct field refs, seeded with imported types
  const structText = preprocessStructs(funcText, imp.structText);

  // alias check, seeded with imported aliases
  const aliasRes = validateAliasUsage(structText, imp.aliasSeed);
  if (!aliasRes.ok) {
    const list =
      aliasRes.errors && aliasRes.errors.length
        ? aliasRes.errors
        : [{ message: aliasRes.message || `Unknown alias: ${aliasRes.token}`, line: aliasRes.line ?? 0, col: undefined, token: aliasRes.token }];
    const errors = list.map((e) => ({
      message: e.message || `Unknown alias: ${e.token}`,
      line: e.line,
      col: "col" in e ? e.col : undefined,
      length: e.token ? e.token.length : undefined,
    }));
    return { ok: false, error: errors[0], errors };
  }

  return { ok: true, asm: preprocessAsmWithAliases(structText, imp.aliasSeed) };
}

export async function assembleAsm(asmText: string): Promise<AssembleResult> {
  const pre = preprocessForBackend(asmText);
  if (!pre.ok) return { ok: false, error: pre.error, errors: pre.errors };
  const asmForBackend = pre.asm;

  try {
    const r = await fetch("/api/assemble", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ asm: asmForBackend }),
    });
    const j = await r.json().catch(() => ({}));

    if (!r.ok || !j.ok) {
      const e = j?.error;
      if (e && typeof e === "object") {
        const errors: AssembleError[] | undefined = Array.isArray(e.errors)
          ? e.errors.map((x: AssembleError) => ({ message: x.message || "Assemble failed", line: x.line, col: x.col, length: x.length }))
          : undefined;
        return {
          ok: false,
          error: { message: e.message || "Assemble failed", line: e.line, col: e.col, length: e.length },
          ...(errors && errors.length ? { errors } : {}),
        };
      }
      return { ok: false, error: { message: typeof e === "string" ? e : "Assemble failed" } };
    }

    const codeOut: string = j.out || "";
    // struct data blocks from the current file, appended after the code. each
    // becomes an `address` + `.word` run so the existing formatters map it.
    const blocks = emitStructData(asmText);
    let source = asmForBackend;
    const outParts: string[] = codeOut ? [codeOut] : [];
    let dataBytes = 0;
    for (const b of blocks) {
      const lines = [`# data: ${b.name}`, `address ${hexWord(b.address)}`];
      const hexes: string[] = [];
      for (const w of b.words) {
        lines.push(`.word ${hexWord(w)}`);
        hexes.push(hexWord(w));
      }
      source += "\n\n" + lines.join("\n");
      outParts.push(hexes.join("\n"));
      dataBytes += b.words.length * 4; // actual emitted bytes (padded to words)
    }

    const out = outParts.filter(Boolean).join("\n");
    let note = getAssembleStats(codeOut, asmForBackend);
    if (dataBytes > 0) {
      const dn = `${dataBytes} data ${dataBytes === 1 ? "byte" : "bytes"}`;
      note = note ? `${note} · ${dn}` : `Assembled: ${dn}`;
    }
    return { ok: true, out, source, note };
  } catch (e) {
    return { ok: false, error: { message: e instanceof Error ? e.message : "Request failed" } };
  }
}
