import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons.js";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: "md" | "lg" | "xl";
  children: ReactNode;
}

const sizes = { md: "max-w-md", lg: "max-w-lg", xl: "max-w-3xl" };

export function Dialog({ open, onClose, title, description, size = "md", children }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative my-8 w-full ${sizes[size]} rounded-xl border border-rekha-border bg-rekha-panel p-5 shadow-2xl`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200">
            <Icon name="close" width={18} height={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
