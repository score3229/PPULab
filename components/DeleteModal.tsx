"use client";

import { useEffect, useRef, useCallback } from "react";

interface DeleteModalProps {
  open: boolean;
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteModal({
  open,
  name,
  onConfirm,
  onCancel,
}: DeleteModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => confirmRef.current?.focus(), 0);
  }, [open]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    },
    [open, onCancel, onConfirm]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="w-[520px] max-w-full bg-card-bg border border-border rounded-[14px] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
        <div className="px-3.5 py-3 border-b border-border">
          <div className="font-extrabold text-sm">Delete Subroutine</div>
          <div className="text-xs opacity-70 mt-0.5">
            This cannot be undone.
          </div>
        </div>

        <div className="p-3.5">
          <div className="text-[13px] opacity-90 leading-snug">
            Delete &ldquo;{name}&rdquo;?
          </div>
        </div>

        <div className="px-3.5 py-3 border-t border-border flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="bg-btn-secondary border border-btn-secondary-border text-white px-3.5 py-2.5 rounded-[10px] font-semibold cursor-pointer select-none transition-colors hover:bg-btn-secondary-hover hover:border-border-hover"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className="bg-danger-bg border border-danger-border text-danger-text px-3.5 py-2.5 rounded-[10px] font-semibold cursor-pointer select-none transition-colors hover:bg-danger-hover hover:border-[#6b2a2a]"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
