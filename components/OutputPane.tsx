"use client";

import { useRef, useCallback, useMemo } from "react";
import {
  OutputFormat,
  OUTPUT_FORMATS,
  formatOutput,
} from "@/lib/output-formats";
import { ASM_COLORS } from "@/lib/asm-highlight";

interface OutputPaneProps {
  rawOutput: string;
  asmSource: string;
  format: OutputFormat;
  onFormatChange: (fmt: OutputFormat) => void;
}

const OUT = {
  comment: ASM_COLORS.comment, // # address / info lines
  hex: ASM_COLORS.name, // hex words and bytes, muted since they repeat
  type: ASM_COLORS.typeName, // array element type (byte, uint32_t, be32)
  name: ASM_COLORS.variableName, // declared var name
  keyword: ASM_COLORS.keyword, // new
  dim: "#5d6d7e", // punctuation
  def: ASM_COLORS.default,
};

const TYPE_WORDS = new Set([
  "byte", "sbyte", "bool", "short", "ushort", "int", "uint", "long", "ulong",
  "uint8_t", "uint16_t", "uint32_t", "uint64_t", "int32_t", "be32", "le32",
]);

// color a bare word: hex value muted, a type cyan, `new` a keyword, else a name
function classifyWord(w: string): string {
  if (/^[0-9A-F]+$/.test(w)) return OUT.hex;
  const lw = w.toLowerCase();
  if (TYPE_WORDS.has(lw)) return OUT.type;
  if (lw === "new") return OUT.keyword;
  return OUT.name;
}

function colorizeOutput(text: string): { t: string; c: string }[] {
  const spans: { t: string; c: string }[] = [];
  text.split("\n").forEach((line, li) => {
    if (li > 0) spans.push({ t: "\n", c: OUT.def });
    if (line.trimStart().startsWith("#")) {
      spans.push({ t: line, c: OUT.comment });
      return;
    }
    const re = /(\s+)|(0x[0-9A-Fa-f]+)|([0-9A-Za-z_]+)|([^\s])/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      if (m[1]) spans.push({ t: m[1], c: OUT.def });
      else if (m[2]) spans.push({ t: m[2], c: OUT.hex });
      else if (m[3]) spans.push({ t: m[3], c: classifyWord(m[3]) });
      else if (m[4]) spans.push({ t: m[4], c: OUT.dim });
    }
  });
  return spans;
}

export default function OutputPane({
  rawOutput,
  asmSource,
  format,
  onFormatChange,
}: OutputPaneProps) {
  const outRef = useRef<HTMLPreElement>(null);

  const formatted = rawOutput
    ? formatOutput(rawOutput, format, asmSource)
    : "";

  const colored = useMemo(() => colorizeOutput(formatted), [formatted]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatted);
    } catch {
      // fallback: noop
    }
  }, [formatted]);

  const handleSelectAll = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        if (!outRef.current) return;
        const range = document.createRange();
        range.selectNodeContents(outRef.current);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    },
    []
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-input-bg">
      <div className="flex h-[38px] shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-text-muted">Output</span>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={format}
            onChange={(e) => onFormatChange(e.target.value as OutputFormat)}
            className="bg-input-bg border border-border text-text-secondary pl-2.5 pr-7 py-1 rounded-md text-[11px] outline-none hover:border-border-hover transition-colors appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%226%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M1%201l4%204%204-4%22%20stroke%3D%22%235d6d7e%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_9px_center] bg-no-repeat"
          >
            {OUTPUT_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <CopyButton onClick={handleCopy} />
        </div>
      </div>
      <pre
        ref={outRef}
        tabIndex={0}
        onKeyDown={handleSelectAll}
        className="m-0 min-h-0 flex-1 overflow-auto whitespace-pre bg-input-bg p-3 font-mono text-[13px] focus:outline-none"
      >
        {colored.map((s, i) => (
          <span key={i} style={{ color: s.c }}>
            {s.t}
          </span>
        ))}
      </pre>
    </div>
  );
}

function CopyButton({ onClick }: { onClick: () => void }) {
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleClick = useCallback(() => {
    onClick();
    if (btnRef.current) {
      btnRef.current.textContent = "Copied";
      setTimeout(() => {
        if (btnRef.current) btnRef.current.textContent = "Copy";
      }, 900);
    }
  }, [onClick]);

  return (
    <button
      ref={btnRef}
      onClick={handleClick}
      className="bg-btn-secondary border border-border text-text-secondary px-3 py-1 rounded-md text-[11px] font-semibold cursor-pointer select-none transition-colors duration-150 hover:text-text-primary hover:bg-btn-secondary-hover hover:border-border-hover"
    >
      Copy
    </button>
  );
}
