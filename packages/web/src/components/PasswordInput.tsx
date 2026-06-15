import { useState, type ReactNode } from "react";
import { Icon } from "./icons.js";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  /** Optional absolutely-positioned element rendered on the left (e.g. a lock icon). */
  leftIcon?: ReactNode;
  /** When provided, shows a "generate" button that calls this and reveals the field. */
  onGenerate?: () => void;
}

/** Password field with a show/hide eye toggle (+ optional generate button). */
export function PasswordInput({ value, onChange, placeholder, className = "", autoFocus, leftIcon, onGenerate }: Props) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      {leftIcon}
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={`${className} ${onGenerate ? "!pr-16" : "!pr-10"}`}
      />
      {onGenerate && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            onGenerate();
            setShow(true);
          }}
          aria-label="Generate password"
          title="Generate a strong password"
          className="absolute right-9 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-emerald-300"
        >
          <Icon name="reload" width={15} height={15} />
        </button>
      )}
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-300"
      >
        <Icon name={show ? "eyeOff" : "eye"} width={16} height={16} />
      </button>
    </div>
  );
}
