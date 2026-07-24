// client-side disassemble flow. calls the disassemble api with the pasted
// hex and an optional base address, returns a structured result.

export type DisassembleResult = { ok: true; out: string } | { ok: false; error: string };

export async function disassembleHex(hex: string, baseAddress?: number): Promise<DisassembleResult> {
  try {
    const body: { hex: string; baseAddress?: number } = { hex };
    if (typeof baseAddress === "number" && Number.isFinite(baseAddress)) {
      body.baseAddress = baseAddress >>> 0;
    }
    const r = await fetch("/api/disassemble", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) {
      return { ok: false, error: (j?.error && j.error.message) || "Disassemble failed" };
    }
    return { ok: true, out: j.out || "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Request failed" };
  }
}

// parse a base like "0x016C7C30", "16c7c30", or decimal into a u32
export function parseBase(input: string): number | undefined {
  const b = input.trim();
  if (!b) return undefined;
  let v: number;
  if (/^0x/i.test(b)) v = parseInt(b.slice(2), 16);
  else if (/^[0-9]+$/.test(b)) v = parseInt(b, 10);
  else v = parseInt(b, 16);
  return Number.isFinite(v) ? v >>> 0 : undefined;
}
