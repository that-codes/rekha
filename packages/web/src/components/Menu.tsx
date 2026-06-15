import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icons.js";

/** Lightweight popover menu (no dependency). Closes on outside click or Esc. */
export function Menu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Actions"
        className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
          open ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:bg-slate-700 hover:text-slate-200"
        }`}
      >
        <Icon name="more" width={18} height={18} />
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="absolute right-0 z-30 mt-1 w-48 origin-top-right overflow-hidden rounded-lg border border-rekha-border bg-rekha-panel py-1 shadow-2xl"
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
        danger ? "text-red-300 hover:bg-red-500/10" : "text-slate-300 hover:bg-slate-700/60 hover:text-slate-100"
      }`}
    >
      <Icon name={icon} width={15} height={15} />
      {label}
    </button>
  );
}

export function MenuDivider() {
  return <div className="my-1 border-t border-rekha-border" />;
}
