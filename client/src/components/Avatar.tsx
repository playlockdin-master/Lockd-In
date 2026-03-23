import React from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
export type AvatarMood = "idle" | "correct" | "wrong" | "timeout";

export interface AvatarCharacter {
  id: string;
  label: string;
  color: string;
}

// ── Character registry ────────────────────────────────────────────────────────
export const CHARACTERS: AvatarCharacter[] = [
  { id: "ghost",    label: "Glitch Ghost",   color: "#c4b5fd" },
  { id: "gremlin",  label: "Tiny Gremlin",   color: "#86efac" },
  { id: "blob",     label: "Sleepy Blob",    color: "#fde68a" },
  { id: "egg",      label: "Cracked Egg",    color: "#fef9c3" },
  { id: "demon",    label: "Little Demon",   color: "#fca5a5" },
  { id: "brain",    label: "Float Brain",    color: "#f9a8d4" },
  { id: "astro",    label: "Astro Blob",     color: "#bfdbfe" },
  { id: "duck",     label: "Possessed Duck", color: "#fde047" },
  { id: "skull",    label: "Cyber Skull",    color: "#a3e635" },
  { id: "shroom",   label: "Angry Shroom",   color: "#fb923c" },
  { id: "robo",     label: "Robot Cube",     color: "#67e8f9" },
  { id: "cat",      label: "Shadow Cat",     color: "#e879f9" },
  { id: "witch",    label: "Tiny Witch",     color: "#a78bfa" },
  { id: "cloud",    label: "Angry Cloud",    color: "#bfdbfe" },
  { id: "fox",      label: "Cool Fox",       color: "#f97316" },
  { id: "zombie",   label: "Zombie Head",    color: "#86efac" },
  { id: "dragon",   label: "Tiny Dragon",    color: "#fb923c" },
  { id: "bear",     label: "Gloom Bear",     color: "#818cf8" },
];

// ── Fire color based on streak ────────────────────────────────────────────────
export function getFireColor(streak: number): { color: string; glow: string; label: string } | null {
  if (streak >= 7) return { color: "#a855f7", glow: "#a855f7", label: "Cosmic" };
  if (streak >= 5) return { color: "#ec4899", glow: "#ec4899", label: "Inferno" };
  if (streak >= 3) return { color: "#f97316", glow: "#f97316", label: "Blazing" };
  if (streak >= 2) return { color: "#fbbf24", glow: "#fbbf24", label: "Warm" };
  return null;
}

// ── SVG Characters ────────────────────────────────────────────────────────────
function GlitchGhost({ size, mood }: { size: number; mood: AvatarMood }) {
  const squint = mood === "wrong" || mood === "timeout";
  const happy  = mood === "correct";
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      <ellipse cx="40" cy="36" rx="22" ry="26" fill="#c4b5fd"/>
      <path d="M18 55 Q24 62 30 55 Q36 48 42 55 Q48 62 54 55 Q60 48 62 55 L62 36 Q62 62 40 62 Q18 62 18 36Z" fill="#c4b5fd"/>
      <rect x="20" y="30" width="40" height="4" fill="#7c3aed" opacity="0.35" rx="2"/>
      {squint ? (
        <>
          <line x1="30" y1="34" x2="36" y2="37" stroke="#1e1b4b" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="44" y1="34" x2="50" y2="37" stroke="#1e1b4b" strokeWidth="2.5" strokeLinecap="round"/>
        </>
      ) : (
        <>
          <ellipse cx="33" cy="35" rx="4" ry={happy ? 3.5 : 4.5} fill="#1e1b4b"/>
          <ellipse cx="47" cy="35" rx="4" ry={happy ? 3.5 : 4.5} fill="#1e1b4b"/>
          <circle cx="35" cy="33" r="1.2" fill="white"/>
          <circle cx="49" cy="33" r="1.2" fill="white"/>
        </>
      )}
      {happy
        ? <path d="M34 44 Q40 50 46 44" stroke="#1e1b4b" strokeWidth="2" strokeLinecap="round" fill="none"/>
        : mood === "wrong"
          ? <path d="M34 48 Q40 43 46 48" stroke="#1e1b4b" strokeWidth="2" strokeLinecap="round" fill="none"/>
          : <ellipse cx="40" cy="46" rx="4" ry="2.5" fill="#1e1b4b"/>
      }
      <rect x="15" y="26" width="5" height="2" fill="#818cf8" opacity="0.7" rx="1"/>
      <rect x="60" y="40" width="4" height="2" fill="#f472b6" opacity="0.6" rx="1"/>
    </svg>
  );
}

function TinyGremlin({ size, mood }: { size: number; mood: AvatarMood }) {
  const happy = mood === "correct";
  const sad   = mood === "wrong" || mood === "timeout";
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      <ellipse cx="18" cy="30" rx="8" ry="12" fill="#86efac" transform="rotate(-15 18 30)"/>
      <ellipse cx="62" cy="30" rx="8" ry="12" fill="#86efac" transform="rotate(15 62 30)"/>
      <ellipse cx="18" cy="30" rx="4" ry="7"  fill="#f9a8d4" transform="rotate(-15 18 30)"/>
      <ellipse cx="62" cy="30" rx="4" ry="7"  fill="#f9a8d4" transform="rotate(15 62 30)"/>
      <ellipse cx="40" cy="42" rx="24" ry="22" fill="#86efac"/>
      {sad && <path d="M33 26 Q37 23 40 26" stroke="#4ade80" strokeWidth="1.5" fill="none"/>}
      <ellipse cx="33" cy="40" rx={happy ? 5 : 4} ry={happy ? 4 : 5} fill="#14532d"/>
      <ellipse cx="47" cy="40" rx={happy ? 5 : 4} ry={happy ? 4 : 5} fill="#14532d"/>
      <circle cx="35" cy="38" r="1.5" fill="white"/>
      <circle cx="49" cy="38" r="1.5" fill="white"/>
      <ellipse cx="40" cy="46" rx="3" ry="2" fill="#4ade80"/>
      {happy
        ? <path d="M32 52 Q40 60 48 52" stroke="#14532d" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
        : sad
          ? <path d="M34 57 Q40 51 46 57" stroke="#14532d" strokeWidth="2" strokeLinecap="round" fill="none"/>
          : <line x1="34" y1="54" x2="46" y2="54" stroke="#14532d" strokeWidth="2" strokeLinecap="round"/>
      }
      <rect x="38" y="52" width="2.5" height="4" rx="1" fill="white"/>
      <rect x="42" y="52" width="2.5" height="4" rx="1" fill="white"/>
    </svg>
  );
}

function SleepyBlob({ size, mood }: { size: number; mood: AvatarMood }) {
  const happy  = mood === "correct";
  const sad    = mood === "wrong";
  const awake  = mood === "correct";
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      <path d="M20 45 Q15 20 40 15 Q65 20 62 45 Q60 65 40 65 Q20 65 20 45Z" fill="#fde68a"/>
      <ellipse cx="16" cy="40" rx="6" ry="8" fill="#fde68a"/>
      <ellipse cx="64" cy="40" rx="6" ry="8" fill="#fde68a"/>
      {awake ? (
        <>
          <ellipse cx="33" cy="38" rx="5" ry="5.5" fill="#78350f"/>
          <ellipse cx="47" cy="38" rx="5" ry="5.5" fill="#78350f"/>
          <circle cx="35" cy="36" r="1.5" fill="white"/>
          <circle cx="49" cy="36" r="1.5" fill="white"/>
        </>
      ) : (
        <>
          <ellipse cx="33" cy="40" rx="5" ry="3" fill="#78350f"/>
          <ellipse cx="47" cy="40" rx="5" ry="3" fill="#78350f"/>
          <rect x="28" y="37" width="10" height="3" fill="#fde68a" rx="2"/>
          <rect x="42" y="37" width="10" height="3" fill="#fde68a" rx="2"/>
        </>
      )}
      <ellipse cx="26" cy="48" rx="5" ry="3" fill="#fca5a5" opacity="0.5"/>
      <ellipse cx="54" cy="48" rx="5" ry="3" fill="#fca5a5" opacity="0.5"/>
      {happy
        ? <path d="M32 54 Q40 62 48 54" stroke="#78350f" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
        : sad
          ? <path d="M34 58 Q40 52 46 58" stroke="#78350f" strokeWidth="2" strokeLinecap="round" fill="none"/>
          : <path d="M33 55 Q40 59 47 55" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      }
      {!awake && !sad && (
        <>
          <text x="55" y="28" fontSize="8" fill="#fbbf24" fontWeight="bold" opacity="0.8">z</text>
          <text x="61" y="22" fontSize="6" fill="#fbbf24" fontWeight="bold" opacity="0.6">z</text>
        </>
      )}
    </svg>
  );
}

function CrackedEgg({ size, mood }: { size: number; mood: AvatarMood }) {
  const happy = mood === "correct";
  const sad   = mood === "wrong";
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      <path d="M18 50 Q18 70 40 70 Q62 70 62 50 L18 50Z" fill="#fef9c3"/>
      <path d="M38 50 L41 44 L37 38 L42 30" stroke="#ca8a04" strokeWidth="2" strokeLinecap="round"/>
      <path d="M18 50 Q19 30 35 22 L38 50Z" fill="#fef9c3"/>
      <path d="M42 50 Q46 22 62 30 L62 50Z" fill="#fef9c3"/>
      <ellipse cx="40" cy="54" rx="14" ry="12" fill="#fbbf24"/>
      <ellipse cx="35" cy="52" rx="3" ry={happy ? 2.5 : 3.5} fill="#78350f"/>
      <ellipse cx="45" cy="52" rx="3" ry={happy ? 2.5 : 3.5} fill="#78350f"/>
      <circle cx="36" cy="51" r="1" fill="white"/>
      <circle cx="46" cy="51" r="1" fill="white"/>
      {happy
        ? <path d="M34 59 Q40 65 46 59" stroke="#78350f" strokeWidth="2" strokeLinecap="round" fill="none"/>
        : sad
          ? <path d="M35 62 Q40 57 45 62" stroke="#78350f" strokeWidth="2" strokeLinecap="round" fill="none"/>
          : <line x1="35" y1="60" x2="45" y2="60" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round"/>
      }
      <ellipse cx="28" cy="34" rx="4" ry="7" fill="white" opacity="0.2" transform="rotate(-20 28 34)"/>
    </svg>
  );
}

function LittleDemon({ size, mood }: { size: number; mood: AvatarMood }) {
  const happy = mood === "correct";
  const sad   = mood === "wrong";
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      <path d="M28 24 L22 10 L32 20Z" fill="#f87171"/>
      <path d="M52 24 L58 10 L48 20Z" fill="#f87171"/>
      <ellipse cx="40" cy="42" rx="24" ry="22" fill="#fca5a5"/>
      <circle cx="24" cy="12" r="3" fill="#ef4444"/>
      <circle cx="56" cy="12" r="3" fill="#ef4444"/>
      <ellipse cx="33" cy="38" rx="5" ry={happy ? 4 : 5.5} fill="#7f1d1d"/>
      <ellipse cx="47" cy="38" rx="5" ry={happy ? 4 : 5.5} fill="#7f1d1d"/>
      <ellipse cx="33" cy="38" rx="3" ry="3" fill="#ef4444"/>
      <ellipse cx="47" cy="38" rx="3" ry="3" fill="#ef4444"/>
      <circle cx="34.5" cy="36.5" r="1" fill="white"/>
      <circle cx="48.5" cy="36.5" r="1" fill="white"/>
      <ellipse cx="26" cy="46" rx="5" ry="3" fill="#f87171" opacity="0.4"/>
      <ellipse cx="54" cy="46" rx="5" ry="3" fill="#f87171" opacity="0.4"/>
      {happy
        ? <path d="M31 53 Q40 62 49 53" stroke="#7f1d1d" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
        : sad
          ? <path d="M33 57 Q40 51 47 57" stroke="#7f1d1d" strokeWidth="2" strokeLinecap="round" fill="none"/>
          : <path d="M32 54 Q40 58 48 54" stroke="#7f1d1d" strokeWidth="2" strokeLinecap="round" fill="none"/>
      }
      <path d="M37 53 L38.5 58 L40 53Z" fill="white"/>
      <path d="M43 53 L41.5 58 L40 53Z" fill="white"/>
      <path d="M62 56 Q72 50 68 62 Q65 70 58 64" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

function FloatingBrain({ size, mood }: { size: number; mood: AvatarMood }) {
  const happy = mood === "correct";
  const sad   = mood === "wrong";
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      <ellipse cx="40" cy="35" rx="22" ry="18" fill="#f9a8d4"/>
      <path d="M22 32 Q26 25 32 30 Q36 22 42 28 Q48 20 54 28 Q60 25 62 33" stroke="#ec4899" strokeWidth="2" fill="none"/>
      <path d="M24 38 Q30 44 36 38 Q40 44 46 38 Q52 44 58 38" stroke="#ec4899" strokeWidth="2" fill="none"/>
      <ellipse cx="22" cy="34" rx="7" ry="10" fill="#f9a8d4"/>
      <path d="M17 30 Q18 24 24 28" stroke="#ec4899" strokeWidth="1.5" fill="none"/>
      <ellipse cx="58" cy="34" rx="7" ry="10" fill="#f9a8d4"/>
      <path d="M63 30 Q62 24 56 28" stroke="#ec4899" strokeWidth="1.5" fill="none"/>
      <ellipse cx="33" cy="40" rx="4.5" ry={happy ? 3.5 : 5} fill="#831843"/>
      <ellipse cx="47" cy="40" rx="4.5" ry={happy ? 3.5 : 5} fill="#831843"/>
      <circle cx="34.5" cy="38.5" r="1.2" fill="white"/>
      <circle cx="48.5" cy="38.5" r="1.2" fill="white"/>
      <rect x="37" y="52" width="6" height="8" rx="3" fill="#f9a8d4"/>
      {happy
        ? <path d="M32 47 Q40 54 48 47" stroke="#831843" strokeWidth="2" strokeLinecap="round" fill="none"/>
        : sad
          ? <path d="M34 51 Q40 45 46 51" stroke="#831843" strokeWidth="2" strokeLinecap="round" fill="none"/>
          : <line x1="34" y1="49" x2="46" y2="49" stroke="#831843" strokeWidth="1.5" strokeLinecap="round"/>
      }
    </svg>
  );
}

function AstronautBlob({ size, mood }: { size: number; mood: AvatarMood }) {
  const happy = mood === "correct";
  const sad   = mood === "wrong";
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      <ellipse cx="40" cy="50" rx="22" ry="18" fill="#bfdbfe"/>
      <circle cx="40" cy="34" r="20" fill="#1e3a5f"/>
      <ellipse cx="40" cy="34" rx="14" ry="13" fill="#0ea5e9" opacity="0.9"/>
      <ellipse cx="34" cy="27" rx="5" ry="4" fill="white" opacity="0.22" transform="rotate(-20 34 27)"/>
      <ellipse cx="35" cy="33" rx="3.5" ry={happy ? 3 : 4} fill="white"/>
      <ellipse cx="45" cy="33" rx="3.5" ry={happy ? 3 : 4} fill="white"/>
      <ellipse cx="35" cy="33" rx="2" ry="2.5" fill="#0c4a6e"/>
      <ellipse cx="45" cy="33" rx="2" ry="2.5" fill="#0c4a6e"/>
      <circle cx="36" cy="31.5" r="0.8" fill="white"/>
      <circle cx="46" cy="31.5" r="0.8" fill="white"/>
      {happy
        ? <path d="M33 40 Q40 46 47 40" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
        : sad
          ? <path d="M35 43 Q40 38 45 43" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
          : <line x1="35" y1="41" x2="45" y2="41" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      }
      <circle cx="40" cy="34" r="20" stroke="#93c5fd" strokeWidth="2" fill="none"/>
      <rect x="32" y="55" width="16" height="6" rx="3" fill="#93c5fd"/>
      <circle cx="40" cy="58" r="2.5" fill="#bfdbfe"/>
      <line x1="40" y1="14" x2="40" y2="8" stroke="#93c5fd" strokeWidth="2"/>
      <circle cx="40" cy="7" r="2.5" fill="#38bdf8"/>
    </svg>
  );
}

function PossessedDuck({ size, mood }: { size: number; mood: AvatarMood }) {
  const happy = mood === "correct";
  const sad   = mood === "wrong";
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      <ellipse cx="40" cy="50" rx="22" ry="18" fill="#fde047"/>
      <circle cx="40" cy="30" r="16" fill="#fde047"/>
      <circle cx="34" cy="28" r="6" fill="#581c87"/>
      <circle cx="46" cy="28" r="6" fill="#581c87"/>
      <circle cx="34" cy="28" r="3.5" fill={happy ? "#a855f7" : sad ? "#ef4444" : "#7c3aed"}/>
      <circle cx="46" cy="28" r="3.5" fill={happy ? "#a855f7" : sad ? "#ef4444" : "#7c3aed"}/>
      <circle cx="35" cy="27" r="1" fill="white"/>
      <circle cx="47" cy="27" r="1" fill="white"/>
      <path d="M34 36 Q40 42 46 36 L43 32 Q40 30 37 32Z" fill="#f97316"/>
      <ellipse cx="20" cy="50" rx="8" ry="12" fill="#fde047" transform="rotate(-20 20 50)"/>
      <ellipse cx="60" cy="50" rx="8" ry="12" fill="#fde047" transform="rotate(20 60 50)"/>
      <path d="M55 60 Q65 55 62 65" stroke="#fde047" strokeWidth="5" strokeLinecap="round" fill="none"/>
      {!sad && (
        <>
          <path d="M20 20 Q16 16 14 12" stroke="#a855f7" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
          <path d="M60 20 Q64 16 66 12" stroke="#a855f7" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
        </>
      )}
      {happy && <path d="M32 42 Q40 48 48 42" stroke="#ca8a04" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.5"/>}
      {sad   && <path d="M34 46 Q40 41 46 46" stroke="#ca8a04" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.5"/>}
    </svg>
  );
}

// ── NEW: Cyber Skull ──────────────────────────────────────────────────────────
function CyberSkull({ size, mood }: { size: number; mood: AvatarMood }) {
  const happy = mood === "correct";
  const sad   = mood === "wrong";
  const dead  = mood === "timeout";
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      {/* Skull dome */}
      <path d="M18 46 Q18 18 40 16 Q62 18 62 46 L58 56 Q56 62 48 62 L32 62 Q24 62 22 56Z" fill="#a3e635"/>
      {/* Jaw */}
      <rect x="28" y="58" width="24" height="10" rx="4" fill="#84cc16"/>
      {/* Jaw teeth */}
      <rect x="31" y="62" width="5" height="6" rx="1.5" fill="#a3e635"/>
      <rect x="38" y="62" width="5" height="6" rx="1.5" fill="#a3e635"/>
      <rect x="45" y="62" width="5" height="6" rx="1.5" fill="#a3e635"/>
      {/* Nasal cavity */}
      <path d="M37 46 L40 40 L43 46 Q42 49 40 49 Q38 49 37 46Z" fill="#365314"/>
      {/* Eye sockets */}
      {dead ? (
        <>
          <line x1="27" y1="30" x2="35" y2="38" stroke="#365314" strokeWidth="3" strokeLinecap="round"/>
          <line x1="35" y1="30" x2="27" y2="38" stroke="#365314" strokeWidth="3" strokeLinecap="round"/>
          <line x1="45" y1="30" x2="53" y2="38" stroke="#365314" strokeWidth="3" strokeLinecap="round"/>
          <line x1="53" y1="30" x2="45" y2="38" stroke="#365314" strokeWidth="3" strokeLinecap="round"/>
        </>
      ) : (
        <>
          <ellipse cx="31" cy="34" rx="8" ry="9" fill="#1a2e05"/>
          <ellipse cx="49" cy="34" rx="8" ry="9" fill="#1a2e05"/>
          {/* Glowing pupils */}
          <ellipse cx="31" cy="34" rx={happy ? 5 : 4} ry={happy ? 4 : 5} fill={happy ? "#bef264" : sad ? "#ef4444" : "#65a30d"}/>
          <ellipse cx="49" cy="34" rx={happy ? 5 : 4} ry={happy ? 4 : 5} fill={happy ? "#bef264" : sad ? "#ef4444" : "#65a30d"}/>
          <circle cx="29" cy="32" r="1.5" fill="white" opacity="0.7"/>
          <circle cx="47" cy="32" r="1.5" fill="white" opacity="0.7"/>
        </>
      )}
      {/* Cyber circuit lines */}
      <path d="M14 35 L20 35 L22 32 L26 32" stroke="#65a30d" strokeWidth="1.2" strokeLinecap="round" opacity="0.7"/>
      <path d="M66 35 L60 35 L58 32 L54 32" stroke="#65a30d" strokeWidth="1.2" strokeLinecap="round" opacity="0.7"/>
      <circle cx="14" cy="35" r="2" fill="#bef264" opacity="0.8"/>
      <circle cx="66" cy="35" r="2" fill="#bef264" opacity="0.8"/>
      {/* Crack */}
      <path d="M40 16 L38 22 L41 28 L39 34" stroke="#365314" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
    </svg>
  );
}

// ── NEW: Angry Shroom ─────────────────────────────────────────────────────────
function AngryShroom({ size, mood }: { size: number; mood: AvatarMood }) {
  const happy = mood === "correct";
  const sad   = mood === "wrong";
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      {/* Stem */}
      <ellipse cx="40" cy="62" rx="14" ry="12" fill="#fed7aa"/>
      <rect x="28" y="50" width="24" height="18" rx="8" fill="#fed7aa"/>
      {/* Cap underside */}
      <ellipse cx="40" cy="50" rx="26" ry="8" fill="#fde8d0"/>
      {/* Cap */}
      <path d="M14 50 Q14 20 40 18 Q66 20 66 50Z" fill="#fb923c"/>
      {/* Cap spots */}
      <circle cx="28" cy="34" r="6" fill="white" opacity="0.85"/>
      <circle cx="52" cy="32" r="5" fill="white" opacity="0.85"/>
      <circle cx="40" cy="26" r="4" fill="white" opacity="0.85"/>
      <circle cx="20" cy="44" r="3.5" fill="white" opacity="0.7"/>
      <circle cx="60" cy="43" r="3" fill="white" opacity="0.7"/>
      {/* Angry brow */}
      {!happy && (
        <>
          <path d="M30 50 Q34 46 38 49" stroke="#92400e" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
          <path d="M42 49 Q46 46 50 50" stroke="#92400e" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
        </>
      )}
      {happy && (
        <>
          <path d="M30 49 Q34 52 38 49" stroke="#92400e" strokeWidth="2" strokeLinecap="round" fill="none"/>
          <path d="M42 49 Q46 52 50 49" stroke="#92400e" strokeWidth="2" strokeLinecap="round" fill="none"/>
        </>
      )}
      {/* Eyes */}
      <ellipse cx="34" cy="53" rx={happy ? 4 : 3.5} ry={happy ? 3.5 : 4.5} fill="#92400e"/>
      <ellipse cx="46" cy="53" rx={happy ? 4 : 3.5} ry={happy ? 3.5 : 4.5} fill="#92400e"/>
      <circle cx="35" cy="51.5" r="1.2" fill="white"/>
      <circle cx="47" cy="51.5" r="1.2" fill="white"/>
      {/* Cheek blush */}
      <ellipse cx="26" cy="57" rx="5" ry="3" fill="#f97316" opacity="0.35"/>
      <ellipse cx="54" cy="57" rx="5" ry="3" fill="#f97316" opacity="0.35"/>
      {/* Mouth */}
      {happy
        ? <path d="M32 61 Q40 68 48 61" stroke="#92400e" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
        : sad
          ? <path d="M34 64 Q40 58 46 64" stroke="#92400e" strokeWidth="2" strokeLinecap="round" fill="none"/>
          : <path d="M33 62 Q40 65 47 62" stroke="#92400e" strokeWidth="2" strokeLinecap="round" fill="none"/>
      }
      {/* Little feet */}
      <ellipse cx="33" cy="72" rx="6" ry="4" fill="#fed7aa"/>
      <ellipse cx="47" cy="72" rx="6" ry="4" fill="#fed7aa"/>
    </svg>
  );
}

// ── NEW: Robot Cube ───────────────────────────────────────────────────────────
function RobotCube({ size, mood }: { size: number; mood: AvatarMood }) {
  const happy = mood === "correct";
  const sad   = mood === "wrong";
  const dead  = mood === "timeout";
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      {/* Antenna */}
      <line x1="40" y1="16" x2="40" y2="10" stroke="#67e8f9" strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="40" cy="8" r="3.5" fill={happy ? "#a5f3fc" : sad ? "#f87171" : "#67e8f9"}/>
      {/* Ears / side panels */}
      <rect x="12" y="30" width="8" height="16" rx="3" fill="#0e7490"/>
      <rect x="60" y="30" width="8" height="16" rx="3" fill="#0e7490"/>
      {/* Side speaker grills */}
      <line x1="15" y1="34" x2="17" y2="34" stroke="#67e8f9" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
      <line x1="15" y1="38" x2="17" y2="38" stroke="#67e8f9" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
      <line x1="15" y1="42" x2="17" y2="42" stroke="#67e8f9" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
      <line x1="63" y1="34" x2="65" y2="34" stroke="#67e8f9" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
      <line x1="63" y1="38" x2="65" y2="38" stroke="#67e8f9" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
      <line x1="63" y1="42" x2="65" y2="42" stroke="#67e8f9" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
      {/* Main head */}
      <rect x="18" y="18" width="44" height="46" rx="10" fill="#155e75"/>
      <rect x="20" y="20" width="40" height="42" rx="8" fill="#164e63"/>
      {/* Eye screens */}
      {dead ? (
        <>
          <line x1="27" y1="30" x2="35" y2="38" stroke="#67e8f9" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="35" y1="30" x2="27" y2="38" stroke="#67e8f9" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="45" y1="30" x2="53" y2="38" stroke="#67e8f9" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="53" y1="30" x2="45" y2="38" stroke="#67e8f9" strokeWidth="2.5" strokeLinecap="round"/>
        </>
      ) : (
        <>
          <rect x="25" y="27" width="13" height="13" rx="3" fill={happy ? "#a5f3fc" : sad ? "#fca5a5" : "#0e7490"}/>
          <rect x="42" y="27" width="13" height="13" rx="3" fill={happy ? "#a5f3fc" : sad ? "#fca5a5" : "#0e7490"}/>
          {/* Scanline pupils */}
          <rect x="28" y="31" width="7" height="2" rx="1" fill={happy ? "#0e7490" : sad ? "#ef4444" : "#67e8f9"}/>
          <rect x="45" y="31" width="7" height="2" rx="1" fill={happy ? "#0e7490" : sad ? "#ef4444" : "#67e8f9"}/>
          <rect x="29" y="35" width="5" height="1.5" rx="0.75" fill={happy ? "#0e7490" : "#67e8f9"} opacity="0.5"/>
          <rect x="46" y="35" width="5" height="1.5" rx="0.75" fill={happy ? "#0e7490" : "#67e8f9"} opacity="0.5"/>
        </>
      )}
      {/* Mouth LED strip */}
      <rect x="26" y="48" width="28" height="7" rx="3.5" fill="#0e7490"/>
      {happy
        ? <>
            {[0,1,2,3,4,5,6].map(i => (
              <rect key={i} x={28 + i * 3.5} y={50} width="2.5" height={i % 2 === 0 ? 3 : 2} rx="1"
                fill="#67e8f9" opacity={i % 2 === 0 ? 1 : 0.5}/>
            ))}
          </>
        : sad
          ? <path d="M30 53 Q40 49 50 53" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
          : <line x1="30" y1="51.5" x2="50" y2="51.5" stroke="#67e8f9" strokeWidth="1.5" strokeLinecap="round"/>
      }
      {/* Status light */}
      <circle cx="54" cy="23" r="2.5" fill={happy ? "#4ade80" : sad ? "#f87171" : "#fbbf24"} opacity="0.9"/>
    </svg>
  );
}

// ── NEW: Shadow Cat ───────────────────────────────────────────────────────────
function ShadowCat({ size, mood }: { size: number; mood: AvatarMood }) {
  const happy = mood === "correct";
  const sad   = mood === "wrong";
  const spooked = mood === "timeout";
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      {/* Tail */}
      <path d="M58 64 Q72 56 68 44 Q64 36 58 42" stroke="#d946ef" strokeWidth="5" strokeLinecap="round" fill="none"/>
      {/* Ears */}
      <path d="M24 30 L20 14 L34 26Z" fill="#1a0527"/>
      <path d="M56 30 L60 14 L46 26Z" fill="#1a0527"/>
      {/* Inner ears */}
      <path d="M25 28 L22 18 L31 26Z" fill="#d946ef" opacity="0.6"/>
      <path d="M55 28 L58 18 L49 26Z" fill="#d946ef" opacity="0.6"/>
      {/* Body */}
      <ellipse cx="40" cy="54" rx="22" ry="18" fill="#1a0527"/>
      {/* Head */}
      <circle cx="40" cy="36" r="22" fill="#1a0527"/>
      {/* Eyes */}
      {spooked ? (
        <>
          <circle cx="32" cy="34" r="7" fill="#d946ef"/>
          <circle cx="48" cy="34" r="7" fill="#d946ef"/>
          <circle cx="32" cy="34" r="3.5" fill="#0c0018"/>
          <circle cx="48" cy="34" r="3.5" fill="#0c0018"/>
          <circle cx="30.5" cy="32.5" r="1.5" fill="white" opacity="0.8"/>
          <circle cx="46.5" cy="32.5" r="1.5" fill="white" opacity="0.8"/>
        </>
      ) : (
        <>
          <ellipse cx="32" cy="35" rx="7" ry={happy ? 5 : 7} fill="#e879f9"/>
          <ellipse cx="48" cy="35" rx="7" ry={happy ? 5 : 7} fill="#e879f9"/>
          {/* Slit pupils */}
          <ellipse cx="32" cy="35" rx="2.5" ry={happy ? 4 : 6} fill="#0c0018"/>
          <ellipse cx="48" cy="35" rx="2.5" ry={happy ? 4 : 6} fill="#0c0018"/>
          <circle cx="30.5" cy="32" r="1.2" fill="white" opacity="0.8"/>
          <circle cx="46.5" cy="32" r="1.2" fill="white" opacity="0.8"/>
        </>
      )}
      {/* Nose */}
      <path d="M38 44 L40 42 L42 44 Q41 46 40 46 Q39 46 38 44Z" fill="#d946ef"/>
      {/* Whiskers */}
      <line x1="40" y1="44" x2="22" y2="41" stroke="#d946ef" strokeWidth="1" opacity="0.5" strokeLinecap="round"/>
      <line x1="40" y1="45" x2="22" y2="47" stroke="#d946ef" strokeWidth="1" opacity="0.5" strokeLinecap="round"/>
      <line x1="40" y1="44" x2="58" y2="41" stroke="#d946ef" strokeWidth="1" opacity="0.5" strokeLinecap="round"/>
      <line x1="40" y1="45" x2="58" y2="47" stroke="#d946ef" strokeWidth="1" opacity="0.5" strokeLinecap="round"/>
      {/* Mouth */}
      {happy
        ? <path d="M33 50 Q40 57 47 50" stroke="#d946ef" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
        : sad
          ? <path d="M35 54 Q40 49 45 54" stroke="#d946ef" strokeWidth="2" strokeLinecap="round" fill="none"/>
          : <path d="M37 51 Q40 53 43 51" stroke="#d946ef" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      }
      {/* Glowing aura dots */}
      <circle cx="18" cy="28" r="2" fill="#d946ef" opacity="0.4"/>
      <circle cx="62" cy="26" r="1.5" fill="#e879f9" opacity="0.35"/>
      <circle cx="15" cy="50" r="1.5" fill="#d946ef" opacity="0.3"/>
    </svg>
  );
}


function TinyWitch({ size, mood }: { size: number; mood: AvatarMood }) {
  const happy = mood === "correct";
  const sad   = mood === "wrong";
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      {/* Hat */}
      <polygon points="40,8 52,28 28,28" fill="#1e1b4b"/>
      <rect x="22" y="27" width="36" height="5" rx="2.5" fill="#312e81"/>
      {/* Star on hat */}
      <polygon points="40,13 41.2,16.6 45,16.6 42.1,18.7 43.2,22.3 40,20 36.8,22.3 37.9,18.7 35,16.6 38.8,16.6" fill="#fbbf24" opacity="0.9"/>
      {/* Body */}
      <ellipse cx="40" cy="50" rx="22" ry="20" fill="#a78bfa"/>
      {/* Hair */}
      <path d="M20 38 Q18 55 22 62" stroke="#581c87" strokeWidth="4" strokeLinecap="round" fill="none"/>
      <path d="M60 38 Q62 55 58 62" stroke="#581c87" strokeWidth="4" strokeLinecap="round" fill="none"/>
      {/* Eyes */}
      <ellipse cx="34" cy="48" rx={happy ? 5 : 4} ry={happy ? 4 : 5} fill="#1e1b4b"/>
      <ellipse cx="46" cy="48" rx={happy ? 5 : 4} ry={happy ? 4 : 5} fill="#1e1b4b"/>
      <circle cx="35.5" cy="46.5" r="1.5" fill="#a78bfa"/>
      <circle cx="47.5" cy="46.5" r="1.5" fill="#a78bfa"/>
      {/* Mouth */}
      {happy
        ? <path d="M33 56 Q40 63 47 56" stroke="#1e1b4b" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
        : sad
          ? <path d="M34 60 Q40 54 46 60" stroke="#1e1b4b" strokeWidth="2" strokeLinecap="round" fill="none"/>
          : <line x1="34" y1="57" x2="46" y2="57" stroke="#1e1b4b" strokeWidth="2" strokeLinecap="round"/>
      }
      {/* Sparkles */}
      <circle cx="16" cy="44" r="2" fill="#fbbf24" opacity="0.7"/>
      <circle cx="64" cy="48" r="1.5" fill="#fbbf24" opacity="0.6"/>
      <circle cx="18" cy="54" r="1" fill="#e879f9" opacity="0.5"/>
    </svg>
  );
}

function AngryCloud({ size, mood }: { size: number; mood: AvatarMood }) {
  const happy = mood === "correct";
  const sad   = mood === "wrong";
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      {/* Cloud body */}
      <circle cx="28" cy="42" r="16" fill="#bfdbfe"/>
      <circle cx="40" cy="35" r="18" fill="#bfdbfe"/>
      <circle cx="52" cy="42" r="15" fill="#bfdbfe"/>
      <rect x="13" y="42" width="54" height="18" rx="2" fill="#bfdbfe"/>
      {/* Angry brow */}
      {!happy && <path d="M27 36 L36 39" stroke="#1d4ed8" strokeWidth="2.5" strokeLinecap="round"/>}
      {!happy && <path d="M53 36 L44 39" stroke="#1d4ed8" strokeWidth="2.5" strokeLinecap="round"/>}
      {/* Eyes */}
      <ellipse cx="33" cy="42" rx={happy ? 5 : 4} ry={happy ? 4 : 5} fill="#1d4ed8"/>
      <ellipse cx="47" cy="42" rx={happy ? 5 : 4} ry={happy ? 4 : 5} fill="#1d4ed8"/>
      <circle cx="34.5" cy="40.5" r="1.5" fill="white"/>
      <circle cx="48.5" cy="40.5" r="1.5" fill="white"/>
      {/* Mouth */}
      {happy
        ? <path d="M32 52 Q40 60 48 52" stroke="#1d4ed8" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
        : sad
          ? <path d="M33 56 Q40 50 47 56" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" fill="none"/>
          : <path d="M32 53 Q40 57 48 53" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" fill="none"/>
      }
      {/* Lightning bolts */}
      <path d="M20 60 L17 68 L21 68 L18 76" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" fill="none"/>
      <path d="M60 60 L57 68 L61 68 L58 76" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

function CoolFox({ size, mood }: { size: number; mood: AvatarMood }) {
  const happy = mood === "correct";
  const sad   = mood === "wrong";
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      {/* Ears */}
      <polygon points="20,14 14,30 30,28" fill="#f97316"/>
      <polygon points="60,14 66,30 50,28" fill="#f97316"/>
      <polygon points="22,18 17,28 28,27" fill="#fde68a"/>
      <polygon points="58,18 63,28 52,27" fill="#fde68a"/>
      {/* Body */}
      <ellipse cx="40" cy="46" rx="24" ry="22" fill="#f97316"/>
      {/* Muzzle */}
      <ellipse cx="40" cy="54" rx="12" ry="8" fill="#fde68a"/>
      {/* Eyes */}
      <ellipse cx="33" cy="42" rx={happy ? 5.5 : 4.5} ry={happy ? 4.5 : 5.5} fill="#1c1917"/>
      <ellipse cx="47" cy="42" rx={happy ? 5.5 : 4.5} ry={happy ? 4.5 : 5.5} fill="#1c1917"/>
      <circle cx="35" cy="40" r="1.5" fill="white"/>
      <circle cx="49" cy="40" r="1.5" fill="white"/>
      {/* Nose */}
      <ellipse cx="40" cy="52" rx="3" ry="2" fill="#1c1917"/>
      {/* Mouth */}
      {happy
        ? <path d="M33 56 Q40 64 47 56" stroke="#1c1917" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
        : sad
          ? <path d="M34 60 Q40 54 46 60" stroke="#1c1917" strokeWidth="2" strokeLinecap="round" fill="none"/>
          : <line x1="34" y1="57" x2="46" y2="57" stroke="#1c1917" strokeWidth="2" strokeLinecap="round"/>
      }
      {/* Cheek patches */}
      <ellipse cx="26" cy="48" rx="5" ry="3.5" fill="#fca5a5" opacity="0.5"/>
      <ellipse cx="54" cy="48" rx="5" ry="3.5" fill="#fca5a5" opacity="0.5"/>
    </svg>
  );
}

function ZombieHead({ size, mood }: { size: number; mood: AvatarMood }) {
  const happy = mood === "correct";
  const sad   = mood === "wrong";
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      {/* Body */}
      <ellipse cx="40" cy="44" rx="24" ry="22" fill="#86efac"/>
      {/* Stitches on forehead */}
      <line x1="32" y1="26" x2="36" y2="26" stroke="#166534" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="34" y1="24" x2="34" y2="28" stroke="#166534" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="44" y1="26" x2="48" y2="26" stroke="#166534" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="46" y1="24" x2="46" y2="28" stroke="#166534" strokeWidth="1.5" strokeLinecap="round"/>
      {/* Eyes */}
      <ellipse cx="33" cy="40" rx={happy ? 5 : 4.5} ry={happy ? 4 : 5} fill="#166534"/>
      <ellipse cx="47" cy="40" rx={happy ? 5 : 4.5} ry={happy ? 4 : 5} fill="#166534"/>
      <circle cx="34.5" cy="38.5" r="1.5" fill="#bbf7d0"/>
      <circle cx="48.5" cy="38.5" r="1.5" fill="#bbf7d0"/>
      {/* One X eye when sad */}
      {sad && <><line x1="29.5" y1="36.5" x2="36.5" y2="43.5" stroke="#dcfce7" strokeWidth="1.5"/><line x1="36.5" y1="36.5" x2="29.5" y2="43.5" stroke="#dcfce7" strokeWidth="1.5"/></>}
      {/* Mouth with teeth */}
      <path d="M30 52 Q40 60 50 52" stroke="#166534" strokeWidth="2" strokeLinecap="round" fill="none"/>
      <rect x="35" y="51" width="3" height="5" rx="1" fill="white"/>
      <rect x="39" y="51" width="3" height="5" rx="1" fill="white"/>
      <rect x="43" y="51" width="3" height="5" rx="1" fill="white"/>
      {/* Scars */}
      <path d="M20 42 Q22 46 20 50" stroke="#166534" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <circle cx="60" cy="34" r="3" fill="#4ade80" opacity="0.4"/>
    </svg>
  );
}

function TinyDragon({ size, mood }: { size: number; mood: AvatarMood }) {
  const happy = mood === "correct";
  const sad   = mood === "wrong";
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      {/* Horns */}
      <polygon points="28,16 24,6 32,14" fill="#fb923c"/>
      <polygon points="52,16 56,6 48,14" fill="#fb923c"/>
      {/* Wings (subtle) */}
      <path d="M18 44 Q8 36 12 28 Q20 38 22 44Z" fill="#fdba74" opacity="0.7"/>
      <path d="M62 44 Q72 36 68 28 Q60 38 58 44Z" fill="#fdba74" opacity="0.7"/>
      {/* Body */}
      <ellipse cx="40" cy="46" rx="22" ry="21" fill="#fb923c"/>
      {/* Belly */}
      <ellipse cx="40" cy="52" rx="13" ry="10" fill="#fde68a"/>
      {/* Eyes */}
      <ellipse cx="34" cy="40" rx={happy ? 5 : 4} ry={happy ? 4 : 5.5} fill="#431407"/>
      <ellipse cx="46" cy="40" rx={happy ? 5 : 4} ry={happy ? 4 : 5.5} fill="#431407"/>
      <circle cx="35.5" cy="38.5" r="1.5" fill="#fde68a"/>
      <circle cx="47.5" cy="38.5" r="1.5" fill="#fde68a"/>
      {/* Nostrils */}
      <circle cx="37" cy="47" r="1.5" fill="#431407"/>
      <circle cx="43" cy="47" r="1.5" fill="#431407"/>
      {/* Mouth */}
      {happy
        ? <path d="M32 55 Q40 63 48 55" stroke="#431407" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
        : sad
          ? <path d="M33 59 Q40 53 47 59" stroke="#431407" strokeWidth="2" strokeLinecap="round" fill="none"/>
          : <line x1="33" y1="56" x2="47" y2="56" stroke="#431407" strokeWidth="2" strokeLinecap="round"/>
      }
      {/* Fire breath when happy */}
      {happy && <><ellipse cx="40" cy="68" rx="5" ry="3" fill="#fbbf24" opacity="0.8"/><ellipse cx="40" cy="66" rx="3" ry="2" fill="#f97316" opacity="0.6"/></>}
    </svg>
  );
}

function GloomBear({ size, mood }: { size: number; mood: AvatarMood }) {
  const happy = mood === "correct";
  const sad   = mood === "wrong";
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      {/* Ears */}
      <circle cx="22" cy="24" r="11" fill="#6366f1"/>
      <circle cx="58" cy="24" r="11" fill="#6366f1"/>
      <circle cx="22" cy="24" r="6" fill="#818cf8"/>
      <circle cx="58" cy="24" r="6" fill="#818cf8"/>
      {/* Body */}
      <ellipse cx="40" cy="48" rx="24" ry="22" fill="#6366f1"/>
      {/* Muzzle */}
      <ellipse cx="40" cy="56" rx="12" ry="8" fill="#818cf8"/>
      {/* Cloud/rain on forehead — always gloomy */}
      <path d="M33 30 Q40 24 47 30 Q50 34 47 36 Q40 38 33 36 Q30 34 33 30Z" fill="#c7d2fe" opacity="0.6"/>
      <line x1="35" y1="37" x2="34" y2="41" stroke="#a5b4fc" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="39" y1="38" x2="38" y2="43" stroke="#a5b4fc" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="43" y1="37" x2="42" y2="41" stroke="#a5b4fc" strokeWidth="1.2" strokeLinecap="round"/>
      {/* Eyes */}
      <ellipse cx="34" cy="44" rx={happy ? 5 : 4} ry={happy ? 4 : 5} fill="#1e1b4b"/>
      <ellipse cx="46" cy="44" rx={happy ? 5 : 4} ry={happy ? 4 : 5} fill="#1e1b4b"/>
      <circle cx="35.5" cy="42.5" r="1.5" fill="#a5b4fc"/>
      <circle cx="47.5" cy="42.5" r="1.5" fill="#a5b4fc"/>
      {/* Nose */}
      <ellipse cx="40" cy="54" rx="3" ry="2" fill="#1e1b4b"/>
      {/* Mouth */}
      {happy
        ? <path d="M33 59 Q40 67 47 59" stroke="#1e1b4b" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
        : sad
          ? <path d="M34 63 Q40 57 46 63" stroke="#1e1b4b" strokeWidth="2" strokeLinecap="round" fill="none"/>
          : <path d="M34 61 Q40 63 46 61" stroke="#1e1b4b" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      }
    </svg>
  );
}

const SVG_MAP: Record<string, React.FC<{ size: number; mood: AvatarMood }>> = {
  ghost:   GlitchGhost,
  gremlin: TinyGremlin,
  blob:    SleepyBlob,
  egg:     CrackedEgg,
  demon:   LittleDemon,
  brain:   FloatingBrain,
  astro:   AstronautBlob,
  duck:    PossessedDuck,
  skull:   CyberSkull,
  shroom:  AngryShroom,
  robo:    RobotCube,
  cat:     ShadowCat,
  witch:   TinyWitch,
  cloud:   AngryCloud,
  fox:     CoolFox,
  zombie:  ZombieHead,
  dragon:  TinyDragon,
  bear:    GloomBear,
};

// ── Main Avatar Component ─────────────────────────────────────────────────────
interface AvatarProps {
  avatarId: string;
  mood?: AvatarMood;
  streak?: number;
  isLeader?: boolean;
  size?: number;
}

export function Avatar({ avatarId, mood = "idle", streak = 0, isLeader = false, size = 64 }: AvatarProps) {
  const Char = SVG_MAP[avatarId] ?? GlitchGhost;
  const fire = getFireColor(streak);
  const hasOverhead = isLeader || !!fire;
  // Only add vertical overhead space for larger avatars — tiny ones (≤24px) use a simpler layout
  const overhead = hasOverhead && size > 24 ? size * 0.36 : 0;

  const auraColor =
    mood === "correct" ? "#22c55e"
    : mood === "wrong"   ? "#ef4444"
    : mood === "timeout" ? "#eab308"
    : fire              ? fire.glow
    : "#7c3aed";

  const auraOpacity = mood === "idle" ? "33" : "55";

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size + overhead,
        display: "inline-flex",
        alignItems: "flex-end",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {/* Crown — leaderboard #1 */}
      {isLeader && (
        <div
          data-flooq-avatar
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: size * 0.3,
            lineHeight: 1,
            filter: "drop-shadow(0 0 6px #facc15) drop-shadow(0 0 14px #f59e0b)",
            animation: "flooq-crown 2.5s ease-in-out infinite",
            zIndex: 10,
            userSelect: "none",
          }}
        >
          👑
        </div>
      )}

      {/* Fire — streak indicator */}
      {fire && (
        <div
          style={{
            position: "absolute",
            top: isLeader ? size * 0.12 : 0,
            right: -size * 0.12,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            zIndex: 9,
            userSelect: "none",
          }}
        >
          <div
            data-flooq-avatar
            style={{
              fontSize: size * 0.34,
              lineHeight: 1,
              filter: `drop-shadow(0 0 6px ${fire.glow})`,
              animation: "flooq-fire 0.65s ease-in-out infinite alternate",
              color: fire.color,
            }}
          >
            🔥
          </div>
          <div
            style={{
              fontSize: Math.max(size * 0.22, 10),
              fontWeight: 900,
              color: fire.color,
              lineHeight: 1,
              textShadow: `0 0 8px ${fire.glow}`,
              fontFamily: "inherit",
              letterSpacing: "-0.02em",
            }}
          >
            {streak}×
          </div>
        </div>
      )}

      {/* Character SVG */}
      <div
        data-flooq-avatar
        style={{
          transform:
            mood === "wrong"   ? "rotate(-5deg) scale(0.94)"
            : mood === "correct" ? "scale(1.07)"
            : "scale(1)",
          transition: "transform 0.28s cubic-bezier(.36,.07,.19,.97)",
          filter: `drop-shadow(0 0 ${size * 0.18}px ${auraColor}${auraOpacity})`,
          animation: mood === "idle" ? "flooq-bob 3s ease-in-out infinite" : "none",
        }}
      >
        <Char size={size} mood={mood} />
      </div>

    </div>
  );
}

// Inject Avatar keyframes exactly once into the document <head>.
// Doing it per-instance (inside JSX) created hundreds of duplicate <style> tags
// which broke animation in some browsers and caused icons/crown/fire to go missing.
// We also gate the animations behind prefers-reduced-motion here so the inline
// style override in Avatar respects the user's OS motion setting.
if (typeof document !== "undefined") {
  const STYLE_ID = "flooq-avatar-keyframes";
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
      @keyframes flooq-bob   { 0%,100%{transform:translateY(0)}   50%{transform:translateY(-4px)} }
      @keyframes flooq-crown { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(-3px)} }
      @keyframes flooq-fire  { 0%{transform:scale(1) rotate(-4deg)} 100%{transform:scale(1.14) rotate(4deg)} }
      @media (prefers-reduced-motion: reduce) {
        [data-flooq-avatar] { animation: none !important; }
      }
    `;
    document.head.appendChild(s);
  }
}

// ── Avatar Picker Grid ────────────────────────────────────────────────────────
interface AvatarPickerProps {
  selected: string;
  onSelect: (id: string) => void;
}

export function AvatarPicker({ selected, onSelect }: AvatarPickerProps) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {CHARACTERS.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          className={`flex items-center justify-center p-1.5 rounded-2xl border-2 transition-all duration-150 cursor-pointer
            ${selected === c.id
              ? "border-primary bg-primary/15 shadow-[0_0_18px_rgba(124,58,237,0.35)]"
              : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/25"
            }`}
        >
          <Avatar avatarId={c.id} mood="idle" size={36} />
        </button>
      ))}
    </div>
  );
}
