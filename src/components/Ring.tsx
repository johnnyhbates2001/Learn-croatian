/** Circular progress ring. */
export function Ring({
  value,
  size = 120,
  stroke = 12,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  children?: preact.ComponentChildren;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div class="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--track)"
          stroke-width={stroke}
        />
        {v > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={v >= 1 ? "var(--good)" : "var(--accent)"}
            stroke-width={stroke}
            stroke-linecap="round"
            stroke-dasharray={`${c * v} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dasharray .6s ease" }}
          />
        )}
      </svg>
      <div class="ring-label">{children}</div>
    </div>
  );
}

export function Bar({
  value,
  tone = "accent",
}: {
  value: number;
  tone?: "accent" | "good" | "blue";
}) {
  return (
    <div class="bar">
      <div
        class={`bar-fill ${tone}`}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  );
}
