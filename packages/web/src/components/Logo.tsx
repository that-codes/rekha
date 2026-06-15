/**
 * Rekha brand mark — the Malayalam letter ര ( "ra").
 *
 * രേഖ / rekha = "line" in Malayalam, so the mark is simply the product's initial
 * in its native script. The wordmark spells "rekha" with ര standing in for the
 * "e" (it reads like a tilted e): r ര kha.
 *
 * The glyph is the real Unicode character ര rendered with a Malayalam font stack,
 * so the letterform is authentic on any device that has a Malayalam font.
 */

let gradientSeq = 0;

const MALAYALAM_STACK =
  "'Malayalam Sangam MN','Noto Sans Malayalam','Noto Serif Malayalam','Meera','AnjaliOldLipi','Rachana',system-ui,sans-serif";

export type MarkVariant = "tile" | "glyph";

/** Square brand mark — just ര. `tile` = gradient app-icon (same as favicon); `glyph` = flat emerald. */
export function RekhaMark({
  size = 36,
  variant = "tile",
  className = "",
}: {
  size?: number;
  variant?: MarkVariant;
  className?: string;
}) {
  const gid = `rk-logo-${(gradientSeq += 1)}`;
  const glyph = (ink: string) => (
    <text
      x="16"
      y="24"
      textAnchor="middle"
      fontFamily={MALAYALAM_STACK}
      fontSize="26"
      fontWeight={800}
      fill={ink}
    >
      ര
    </text>
  );
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Rekha"
    >
      {variant === "tile" ? (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
              <stop stopColor="#34d399" />
              <stop offset="1" stopColor="#059669" />
            </linearGradient>
          </defs>
          <rect width="32" height="32" rx="8" fill={`url(#${gid})`} />
          {glyph("#06281d")}
        </>
      ) : (
        glyph("#34d399")
      )}
    </svg>
  );
}

/** Wordmark: "rekha" with the Malayalam ര in place of the "e" → r ര kha. */
export function RekhaWordmark({ size = 26, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-baseline font-semibold tracking-tight text-slate-100 ${className}`}
      style={{ fontSize: size, lineHeight: 1 }}
    >
      r
      {/* ര renders a little taller than the Latin lowercase; trim slightly + nudge
          to the baseline so it matches the height of the surrounding letters. */}
      <span
        className="text-emerald-400"
        style={{
          fontFamily: MALAYALAM_STACK,
          fontSize: "1.08em",
          fontWeight: 800,
          lineHeight: 1,
          transform: "translateY(0.02em)",
          display: "inline-block",
          margin: "0 0.03em",
        }}
      >
        ര
      </span>
      kha
    </span>
  );
}
