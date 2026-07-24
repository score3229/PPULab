"use client";

// build a struct visually: name, base address, typed fields.
// writes a `struct` block into the active editor. offsets come from the types.

import { useState, useEffect } from "react";
import { Boxes, Plus, Trash2, X, CornerDownLeft, Hash, ChevronDown } from "lucide-react";
import Tooltip from "@/components/Tooltip";

const TYPES = ["i8", "u8", "i16", "u16", "i32", "u32", "i64", "u64", "f32", "f64", "ptr", "bool", "vec", "string", "char", "bytes"];
const ARRAY_TYPES = ["string", "char", "bytes"];

interface Field {
  name: string;
  type: string;
  count: string;
  value: string;
}

export default function StructBuilder({ onInsert, onClose }: { onInsert: (snippet: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [fields, setFields] = useState<Field[]>([{ name: "", type: "i32", count: "16", value: "" }]);
  const [packed, setPacked] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setField = (i: number, patch: Partial<Field>) => setFields((f) => f.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addField = () => setFields((f) => [...f, { name: "", type: "i32", count: "16", value: "" }]);
  const removeField = (i: number) => setFields((f) => (f.length > 1 ? f.filter((_, idx) => idx !== i) : f));

  const named = fields.filter((f) => f.name.trim());
  const valid = name.trim() && named.length > 0;

  const typeOf = (f: Field) => (ARRAY_TYPES.includes(f.type) ? `${f.type}[${parseInt(f.count, 10) || 1}]` : f.type);

  const buildSnippet = () => {
    const head = `struct ${name.trim()}${address.trim() ? ` @ ${address.trim()}` : ""}${packed ? " packed" : ""} {`;
    const nameW = Math.max(...named.map((f) => f.name.trim().length), 1);
    const anyVal = named.some((f) => f.value.trim());
    const typeW = anyVal ? Math.max(...named.map((f) => typeOf(f).length), 1) : 0;
    const rows = named.map((f) => {
      const ty = typeOf(f);
      // strings get quoted so spaces/commas survive; bytes/numbers stay bare
      const isStr = ARRAY_TYPES.includes(f.type) && f.type !== "bytes";
      let val = f.value.trim();
      if (val && isStr && !/^".*"$/.test(val) && !/^'.*'$/.test(val)) val = `"${val}"`;
      const base = `    ${f.name.trim().padEnd(nameW)} : ${anyVal ? ty.padEnd(typeW) : ty}`;
      return val ? `${base} = ${val}` : base;
    });
    return [head, ...rows, "}"].join("\n");
  };

  const submit = () => {
    if (!valid) return;
    onInsert(buildSnippet());
    onClose();
  };

  const lbl = "text-[10px] font-semibold uppercase tracking-[0.09em] text-text-muted";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-[min(620px,96vw)] flex-col overflow-hidden rounded-lg border border-border-hover bg-card-bg shadow-2xl">
        <div className="flex h-[42px] shrink-0 items-center justify-between border-b border-border bg-surface px-3">
          <span className="flex items-center gap-2 text-xs font-semibold text-text-primary">
            <Boxes size={14} className="text-accent" /> New struct
          </span>
          <button onClick={onClose} className="rounded p-1 text-text-muted hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3.5">
          <div className="flex gap-2.5">
            <label className="flex flex-1 flex-col gap-1">
              <span className={lbl}>Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Player"
                spellCheck={false}
                autoFocus
                className="rounded border border-border bg-input-bg px-2.5 py-1.5 font-mono text-[13px] text-text-primary outline-none placeholder:text-text-muted/70 focus:border-border-hover"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className={`flex items-center gap-1 ${lbl}`}>
                <Hash size={10} /> Base address
              </span>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="0x016C7C30 (optional)"
                spellCheck={false}
                className="rounded border border-border bg-input-bg px-2.5 py-1.5 font-mono text-[13px] text-[#56d4dd] outline-none placeholder:text-text-muted/70 focus:border-border-hover"
              />
            </label>
          </div>

          <div className="flex items-center justify-between">
            <span className={lbl}>Fields</span>
            <Tooltip label="aligned pads to each type's size, packed lays fields end to end">
              <div className="flex items-center gap-0.5 rounded-md border border-border bg-input-bg p-0.5">
                <button
                  type="button"
                  onClick={() => setPacked(false)}
                  className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors ${!packed ? "bg-accent/20 text-accent" : "text-text-muted hover:text-text-secondary"}`}
                >
                  Aligned
                </button>
                <button
                  type="button"
                  onClick={() => setPacked(true)}
                  className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors ${packed ? "bg-accent/20 text-accent" : "text-text-muted hover:text-text-secondary"}`}
                >
                  Packed
                </button>
              </div>
            </Tooltip>
          </div>

          <div className="flex flex-col gap-1.5">
            {fields.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={f.name}
                  onChange={(e) => setField(i, { name: e.target.value })}
                  placeholder="field"
                  spellCheck={false}
                  className="min-w-0 flex-1 rounded border border-border bg-input-bg px-2.5 py-1.5 font-mono text-[12.5px] text-text-secondary outline-none focus:border-border-hover"
                />
                <span className="text-text-muted">:</span>
                <div className="relative">
                  <select
                    value={f.type}
                    onChange={(e) => setField(i, { type: e.target.value })}
                    className="cursor-pointer appearance-none rounded border border-border bg-input-bg py-1.5 pl-2.5 pr-7 font-mono text-[12.5px] text-text-secondary outline-none hover:border-border-hover focus:border-border-hover"
                  >
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-muted" />
                </div>
                {ARRAY_TYPES.includes(f.type) && (
                  <Tooltip label="length in bytes">
                    <input
                      inputMode="numeric"
                      value={f.count}
                      onChange={(e) => setField(i, { count: e.target.value.replace(/[^0-9]/g, "") })}
                      onBlur={() => setField(i, { count: f.count || "1" })}
                      className="w-14 rounded border border-border bg-input-bg px-2 py-1.5 text-center font-mono text-[12.5px] text-text-secondary outline-none focus:border-border-hover"
                    />
                  </Tooltip>
                )}
                <Tooltip label="initial value (optional). unset fields are zeroed">
                  <input
                    value={f.value}
                    onChange={(e) => setField(i, { value: e.target.value })}
                    placeholder="value"
                    spellCheck={false}
                    className="w-24 rounded border border-border bg-input-bg px-2 py-1.5 font-mono text-[12.5px] text-[#7ee787] outline-none focus:border-border-hover"
                  />
                </Tooltip>
                <Tooltip label="remove field">
                  <button
                    onClick={() => removeField(i)}
                    disabled={fields.length <= 1}
                    className="flex items-center justify-center rounded border border-border bg-btn-secondary p-1.5 text-text-muted hover:text-text-primary disabled:opacity-30"
                  >
                    <Trash2 size={13} />
                  </button>
                </Tooltip>
              </div>
            ))}
          </div>

          <button
            onClick={addField}
            className="flex items-center justify-center gap-1.5 rounded border border-dashed border-border py-1.5 text-[11px] font-semibold text-text-secondary hover:border-border-hover hover:text-text-primary"
          >
            <Plus size={13} /> Add field
          </button>

          {valid && (
            <pre className="whitespace-pre rounded border border-border bg-input-bg p-2.5 font-mono text-[11.5px] leading-[1.5] text-text-secondary">
              {buildSnippet()}
            </pre>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-surface px-3 py-2.5">
          <button onClick={onClose} className="rounded border border-border bg-btn-secondary px-3 py-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!valid}
            className="flex items-center gap-1.5 rounded bg-accent px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            <CornerDownLeft size={13} /> Add to file
          </button>
        </div>
      </div>
    </div>
  );
}
