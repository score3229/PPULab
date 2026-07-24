"use client";

// styled hover tooltip, portal-rendered so it never clips. wraps one element.

import { useState, useCallback, cloneElement } from "react";
import type { ReactElement, ReactNode } from "react";
import { createPortal } from "react-dom";

type Placement = "top" | "bottom" | "left" | "right";

const TF: Record<Placement, string> = {
  top: "translate(-50%, calc(-100% - 7px))",
  bottom: "translate(-50%, 7px)",
  left: "translate(calc(-100% - 7px), -50%)",
  right: "translate(7px, -50%)",
};

type TriggerProps = React.HTMLAttributes<HTMLElement> & React.RefAttributes<HTMLElement>;

export default function Tooltip({
  label,
  placement = "top",
  children,
}: {
  label: ReactNode;
  placement?: Placement;
  children: ReactElement<TriggerProps>;
}) {
  const [box, setBox] = useState<{ x: number; y: number } | null>(null);

  const show = useCallback(
    (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      let x = r.left + r.width / 2;
      let y = r.top;
      if (placement === "bottom") y = r.bottom;
      else if (placement === "left") {
        x = r.left;
        y = r.top + r.height / 2;
      } else if (placement === "right") {
        x = r.right;
        y = r.top + r.height / 2;
      }
      // clamp into the viewport
      if (placement === "top" || placement === "bottom") {
        x = Math.max(136, Math.min(window.innerWidth - 136, x));
      }
      setBox({ x, y });
    },
    [placement]
  );

  const hide = useCallback(() => setBox(null), []);

  const p = children.props;
  const trigger = cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      p.onMouseEnter?.(e);
      show(e.currentTarget);
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      p.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      p.onFocus?.(e);
      show(e.currentTarget);
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      p.onBlur?.(e);
      hide();
    },
  });

  return (
    <>
      {trigger}
      {box &&
        createPortal(
          <div
            role="tooltip"
            className="tip-pop pointer-events-none fixed z-[200] max-w-[260px] rounded-md border border-border-hover bg-card-bg px-2.5 py-1.5 text-[10.5px] leading-snug text-text-secondary shadow-[0_10px_28px_rgba(0,0,0,0.55)]"
            style={{ left: box.x, top: box.y, transform: TF[placement] }}
          >
            {label}
          </div>,
          document.body
        )}
    </>
  );
}
