"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface SaveModalProps {
  open: boolean;
  defaultName: string;
  existingNames: string[];
  onSave: (name: string) => void;
  onCancel: () => void;
}

export default function SaveModal({
  open,
  defaultName,
  existingNames,
  onSave,
  onCancel,
}: SaveModalProps) {
  const [name, setName] = useState(defaultName);
  const [hint, setHint] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  const inputRef = useRef<HTMLInputElement>(null);

  // reset the field when the modal opens (state adjust on prop change, in render)
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(defaultName);
      setHint("");
    }
  }

  // focus + select once it is open
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  const handleConfirm = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;

    if (trimmed !== defaultName && existingNames.includes(trimmed) && !hint) {
      setHint(
        `"${trimmed}" already exists. Saving will overwrite it. Click Save again to confirm.`
      );
      return;
    }

    onSave(trimmed);
  }, [name, defaultName, existingNames, hint, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleConfirm();
      }
    },
    [onCancel, handleConfirm]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
      onKeyDown={handleKeyDown}
    >
      <div className="w-[520px] max-w-full bg-card-bg border border-border rounded-[14px] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
        <div className="px-3.5 py-3 border-b border-border">
          <div className="font-extrabold text-sm">Save Subroutine</div>
          <div className="text-xs opacity-70 mt-0.5">
            Stores the current PPU code in local storage
          </div>
        </div>

        <div className="p-3.5 grid gap-2">
          <label className="text-xs opacity-85">Name</label>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setHint("");
            }}
            autoComplete="off"
            spellCheck={false}
            className="bg-input-bg border border-border text-text-primary px-3 py-2.5 rounded-[10px] outline-none text-[13px] font-mono focus:border-accent"
          />
          {hint && (
            <div className="text-xs opacity-75 min-h-4">{hint}</div>
          )}
        </div>

        <div className="px-3.5 py-3 border-t border-border flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="bg-btn-secondary border border-btn-secondary-border text-white px-3.5 py-2.5 rounded-[10px] font-semibold cursor-pointer select-none transition-colors hover:bg-btn-secondary-hover hover:border-border-hover"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="bg-accent text-white border-0 px-3.5 py-2.5 rounded-[10px] font-semibold cursor-pointer select-none transition-all hover:bg-accent-hover hover:shadow-[0_0_0_1px_rgba(47,129,247,0.35),0_8px_22px_rgba(47,129,247,0.25)]"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
