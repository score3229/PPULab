"use client";

// preview an import before it touches the library. shows which functions are
// new vs already saved, and lets the user pick whether collisions overwrite.

import { useEffect } from "react";
import { Download, X, FilePlus2, FileWarning } from "lucide-react";

interface ImportModalProps {
  fresh: string[];
  existing: string[];
  onCancel: () => void;
  onImport: (overwriteExisting: boolean) => void;
}

export default function ImportModal({ fresh, existing, onCancel, onImport }: ImportModalProps) {
  const total = fresh.length + existing.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative flex max-h-[85vh] w-[min(460px,94vw)] flex-col overflow-hidden rounded-lg border border-border-hover bg-card-bg shadow-2xl">
        <div className="flex h-[42px] shrink-0 items-center justify-between border-b border-border bg-surface px-3">
          <span className="flex items-center gap-2 text-xs font-semibold text-text-primary">
            <Download size={14} className="text-accent" /> Import library
          </span>
          <button onClick={onCancel} className="rounded p-1 text-text-muted hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3.5">
          <p className="text-xs text-text-secondary">
            This file has <span className="font-semibold text-text-primary">{total}</span> function{total === 1 ? "" : "s"}.
          </p>

          <div className="rounded-md border border-border bg-input-bg p-2.5">
            <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold text-success">
              <FilePlus2 size={13} /> {fresh.length} new
            </div>
            {fresh.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {fresh.map((n) => (
                  <span key={n} className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] text-text-secondary">
                    {n}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-[11px] text-text-muted">none</span>
            )}
          </div>

          {existing.length > 0 && (
            <div className="rounded-md border border-border bg-input-bg p-2.5">
              <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold text-[#e0b050]">
                <FileWarning size={13} /> {existing.length} already in your library
              </div>
              <div className="flex flex-wrap gap-1">
                {existing.map((n) => (
                  <span key={n} className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] text-text-muted">
                    {n}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[10.5px] leading-relaxed text-text-muted">
                Your existing copies stay unless you choose to overwrite.
              </p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-surface px-3 py-2.5">
          <button onClick={onCancel} className="rounded border border-border bg-btn-secondary px-3 py-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary">
            Cancel
          </button>
          {existing.length > 0 && (
            <button
              onClick={() => onImport(true)}
              className="rounded border border-danger-border bg-danger-bg px-3 py-1.5 text-xs font-semibold text-danger-text hover:bg-danger-hover"
            >
              Overwrite {existing.length}
            </button>
          )}
          <button
            onClick={() => onImport(false)}
            disabled={fresh.length === 0}
            className="flex items-center gap-1.5 rounded bg-accent px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            <FilePlus2 size={13} /> Import {fresh.length} new
          </button>
        </div>
      </div>
    </div>
  );
}
