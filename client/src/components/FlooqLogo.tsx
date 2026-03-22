import { type CSSProperties } from "react";

interface Props {
  size?: "sm" | "md" | "lg" | "xl";
  /** Show just the icon without the wordmark */
  iconOnly?: boolean;
}

const sizes = {
  sm: { icon: 28, font: 20, gap: 8,  bar: 2,  tag: false },
  md: { icon: 40, font: 30, gap: 10, bar: 2,  tag: false },
  lg: { icon: 56, font: 48, gap: 14, bar: 3,  tag: true  },
  xl: { icon: 72, font: 72, gap: 18, bar: 3,  tag: true  },
};

export function FlooqLogo({ size = "md", iconOnly = false }: Props) {
  const s = sizes[size];

  const iconStyle: CSSProperties = {
    width: s.icon,
    height: s.icon,
    flexShrink: 0,
  };

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: s.gap }}>
      {/* Icon — purple circle with F + orbiting dot */}
      <svg viewBox="0 0 80 80" style={iconStyle} xmlns="http://www.w3.org/2000/svg">
        {/* Purple fill */}
        <circle cx="40" cy="40" r="38" fill="#7C3AED"/>
        {/* Arc track */}
        <circle cx="40" cy="40" r="28" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2.5"/>
        {/* Arc fill 75% */}
        <circle cx="40" cy="40" r="28" fill="none" stroke="white" strokeWidth="2.5"
          strokeDasharray="132 44" strokeLinecap="round"
          transform="rotate(-90 40 40)"
        />
        {/* Orbiting dot */}
        <circle cx="40" cy="12" r="4" fill="white">
          <animateTransform attributeName="transform" type="rotate"
            from="0 40 40" to="360 40 40" dur="6s" repeatCount="indefinite"/>
        </circle>
        {/* F letterform */}
        <rect x="29" y="23" width="4.5" height="34" rx="2" fill="white"/>
        <rect x="29" y="23" width="22" height="4.5" rx="2" fill="white"/>
        <rect x="29" y="36" width="16" height="4.5" rx="2" fill="white"/>
      </svg>

      {/* Wordmark */}
      {!iconOnly && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}>
          <div style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: s.font,
            fontWeight: 900,
            letterSpacing: "-2px",
            lineHeight: 1,
            color: "white",
          }}>
            <span style={{ color: "white" }}>f</span>
            <span style={{ color: "#A855F7" }}>l</span>
            <span style={{ color: "white" }}>oo</span>
            <span style={{ color: "#A855F7" }}>q</span>
          </div>
          <div style={{
            height: s.bar,
            width: "100%",
            borderRadius: 999,
            background: "linear-gradient(90deg, #A855F7, #3B82F6)",
          }}/>
          {s.tag && (
            <div style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 9,
              fontWeight: 500,
              color: "rgba(255,255,255,0.3)",
              letterSpacing: "4px",
              textTransform: "uppercase",
            }}>
              Choose your topic
            </div>
          )}
        </div>
      )}
    </div>
  );
}
