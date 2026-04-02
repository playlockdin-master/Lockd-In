interface Props {
  size?: "sm" | "md" | "lg" | "xl";
  iconOnly?: boolean;
}

const logoWidths = {
  sm:  80,
  md: 160,
  lg: 220,
  xl: 300,
};

const tagSizes = {
  sm:  0,
  md:  9,
  lg: 11,
  xl: 13,
};

export function QotionLogo({ size = "md", iconOnly = false }: Props) {
  const useIcon = size === "sm" || iconOnly;

  if (useIcon) {
    return (
      <img
        src="/qotion-icon.png"
        alt="Qotion"
        style={{ width: 44, height: "auto", display: "block", flexShrink: 0 }}
      />
    );
  }

  const tagSize = tagSizes[size];
  const logoW = logoWidths[size];

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
      <img
        src="/qotion-logo.png"
        alt="Qotion"
        style={{ width: logoW, height: "auto", display: "block", flexShrink: 0 }}
      />
      {tagSize > 0 && (
        <div style={{
          fontFamily: "'Plus Jakarta Sans', 'Outfit', sans-serif",
          fontSize: tagSize,
          fontWeight: 500,
          color: "rgba(45, 212, 191, 0.7)",
          letterSpacing: "4px",
          textTransform: "uppercase",
          paddingLeft: 2,
        }}>
          Questions in Motion
        </div>
      )}
    </div>
  );
}
