import { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Share2, X, Copy, Check } from "lucide-react";
import { Button } from "./Button";
import { type TopicStat } from "@/hooks/use-socket";
import { type Player, type Room } from "@shared/schema";

interface Props {
  me: Player;
  room: Room;
  topicStats: TopicStat[];
  bestStreak: number;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function myRank(room: Room, me: Player): number {
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  return sorted.findIndex(p => p.id === me.id) + 1;
}

function accuracy(stats: TopicStat[]): number {
  const total   = stats.reduce((s, t) => s + t.total,   0);
  const correct = stats.reduce((s, t) => s + t.correct, 0);
  return total === 0 ? 0 : Math.round((correct / total) * 100);
}

function rankLabel(rank: number): string {
  if (rank === 1) return "🥇 Winner";
  if (rank === 2) return "🥈 2nd place";
  if (rank === 3) return "🥉 3rd place";
  return `#${rank}`;
}

// ── Passport card (Concept A) — rendered into a hidden div then shared ───────
function PassportCard({ me, room, topicStats, bestStreak }: Props) {
  const rank = myRank(room, me);
  const acc  = accuracy(topicStats);
  const displayStats = topicStats.slice(0, 6); // max 6 topics in grid

  return (
    <div style={{
      background: "#0D0D1A",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 20,
      padding: 24,
      width: 380,
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 900, letterSpacing: -1 }}>
          <span style={{ color: "white" }}>f</span>
          <span style={{ color: "#A855F7" }}>l</span>
          <span style={{ color: "white" }}>oo</span>
          <span style={{ color: "#A855F7" }}>q</span>
        </div>
        <div style={{
          background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)",
          borderRadius: 20, padding: "4px 12px",
          fontSize: 11, fontWeight: 600, color: "#A855F7", letterSpacing: 1,
        }}>
          {rankLabel(rank)}
        </div>
      </div>

      {/* Name */}
      <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 900, fontSize: 26, color: "white", marginBottom: 2 }}>
        {me.name}
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 18, letterSpacing: 1 }}>
        {room.players.length} PLAYERS · {room.currentRound} ROUNDS
      </div>

      {/* Topic grid */}
      {displayStats.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 18 }}>
          {displayStats.map(s => {
            const pct = s.total === 0 ? 0 : s.correct / s.total;
            const isStreak = pct === 1 && s.total > 0;
            const color = pct === 1 ? "#34D399" : pct >= 0.5 ? "white" : "#F87171";
            const bg    = pct === 1 ? "rgba(52,211,153,0.08)"
                        : pct === 0 ? "rgba(248,113,113,0.08)"
                        : "rgba(255,255,255,0.05)";
            return (
              <div key={s.topic} style={{
                background: bg,
                border: `1px solid ${pct === 1 ? "rgba(52,211,153,0.2)" : pct === 0 ? "rgba(248,113,113,0.2)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 10, padding: "8px 6px", textAlign: "center",
              }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.topic}
                </div>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 700, color }}>
                  {isStreak ? `★ ${s.correct}/${s.total}` : `${s.correct}/${s.total}`}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Stats row */}
      <div style={{
        display: "flex", gap: 12,
        paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)",
      }}>
        {[
          { val: me.score.toString(),    lbl: "SCORE"       },
          { val: `x${bestStreak}`,       lbl: "BEST STREAK" },
          { val: `${acc}%`,              lbl: "ACCURACY"    },
        ].map(({ val, lbl }) => (
          <div key={lbl} style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 900, color: "white" }}>{val}</div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: 1, marginTop: 2 }}>{lbl}</div>
          </div>
        ))}
      </div>

      <div style={{ textAlign: "center", marginTop: 14, fontSize: 10, color: "rgba(168,85,247,0.45)", letterSpacing: 1 }}>
        flooq.up.railway.app
      </div>
    </div>
  );
}

// ── Streak brag card (Concept B) ─────────────────────────────────────────────
function StreakCard({ me, room, topicStats, bestStreak }: Props) {
  // Find which topics the streak happened on — topics where player got 100%
  const hotTopics = topicStats.filter(s => s.total > 0 && s.correct === s.total).map(s => s.topic);
  const otherTopics = topicStats.filter(s => !(s.total > 0 && s.correct === s.total)).map(s => s.topic);

  return (
    <div style={{
      background: "#0D0D1A",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 20,
      padding: "20px 24px",
      width: 380,
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      {/* Top */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
        }}>🔥</div>
        <div>
          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 18, fontWeight: 900, color: "white" }}>
            {me.name} hit a x{bestStreak} streak
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
            in Flooq · {room.players.length} players
          </div>
        </div>
      </div>

      {/* Topic pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
        {hotTopics.map(t => (
          <span key={t} style={{
            background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)",
            borderRadius: 20, padding: "4px 10px", fontSize: 11, fontWeight: 600, color: "#FBBF24",
          }}>{t} 🔥</span>
        ))}
        {otherTopics.slice(0, 4).map(t => (
          <span key={t} style={{
            background: "rgba(255,255,255,0.05)",
            borderRadius: 20, padding: "4px 10px", fontSize: 11, color: "rgba(255,255,255,0.45)",
          }}>{t}</span>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ fontSize: 11, color: "rgba(168,85,247,0.55)", letterSpacing: 1 }}>
          flooq.up.railway.app
        </div>
        <div style={{
          background: "#7C3AED", borderRadius: 20, padding: "6px 16px",
          fontSize: 12, fontWeight: 600, color: "white",
        }}>
          Beat my streak
        </div>
      </div>
    </div>
  );
}

// ── Share text generators ─────────────────────────────────────────────────────
function passportShareText(me: Player, room: Room, topicStats: TopicStat[], bestStreak: number): string {
  const rank = myRank(room, me);
  const acc  = accuracy(topicStats);
  const topics = topicStats.slice(0, 4).map(s => s.topic).join(", ");
  const rankStr = rank === 1 ? "won" : `came #${rank}`;
  return `I ${rankStr} a Flooq game with ${me.score} pts 🧠\n` +
    `Topics: ${topics}\n` +
    `Best streak: x${bestStreak} · Accuracy: ${acc}%\n` +
    `flooq.up.railway.app`;
}

function streakShareText(me: Player, bestStreak: number, topicStats: TopicStat[]): string {
  const hotTopics = topicStats.filter(s => s.total > 0 && s.correct === s.total).map(s => s.topic);
  const topicsStr = hotTopics.length > 0 ? hotTopics.join(", ") : topicStats.slice(0, 3).map(s => s.topic).join(", ");
  return `I hit a x${bestStreak} streak on Flooq! 🔥\n` +
    `Dominated: ${topicsStr}\n` +
    `Can you beat it? flooq.up.railway.app`;
}

// ── Main ShareCard modal ──────────────────────────────────────────────────────
export function ShareCard({ me, room, topicStats, bestStreak }: Props) {
  const [open, setOpen]       = useState(false);
  const [tab, setTab]         = useState<"passport" | "streak">("passport");
  const [copied, setCopied]   = useState(false);

  const hasStreak = bestStreak >= 3;
  const hasTopics = topicStats.length > 0;

  // Don't show share button if no meaningful data
  if (!hasTopics && bestStreak === 0) return null;

  const shareText = tab === "passport"
    ? passportShareText(me, room, topicStats, bestStreak)
    : streakShareText(me, bestStreak, topicStats);

  // ── Generate SVG blob from card data for image sharing ─────────────────────
  const buildShareSvg = (): string => {
    const stats = topicStats.slice(0, 6);
    const acc   = accuracy(topicStats);
    const rank  = myRank(room, me);
    const rankLbl = rankLabel(rank);
    const hotTopics = topicStats.filter(s => s.total > 0 && s.correct === s.total).map(s => s.topic);
    const otherTopics = topicStats.filter(s => !(s.total > 0 && s.correct === s.total)).map(s => s.topic);

    if (tab === "passport") {
      const rows = Math.ceil(stats.length / 3);
      const gridH = rows * 52 + (rows - 1) * 8;
      const totalH = 56 + 44 + 20 + gridH + 72 + 28;
      const chips = stats.map((s, i) => {
        const col = i % 3; const row = Math.floor(i / 3);
        const x = 24 + col * 116; const y = 120 + row * 60;
        const pct = s.total === 0 ? 0 : s.correct / s.total;
        const fill  = pct === 1 ? '#134e2a' : pct === 0 ? '#4c1414' : '#1a1a2e';
        const stroke= pct === 1 ? '#34d399' : pct === 0 ? '#f87171' : '#ffffff22';
        const tcolor= pct === 1 ? '#34d399' : pct === 0 ? '#f87171' : '#ffffff';
        const label = pct === 1 ? \`★ \${s.correct}/\${s.total}\` : \`\${s.correct}/\${s.total}\`;
        const topic = s.topic.length > 10 ? s.topic.slice(0, 9) + '…' : s.topic;
        return \`<rect x="\${x}" y="\${y}" width="104" height="48" rx="8" fill="\${fill}" stroke="\${stroke}" stroke-width="1"/>
        <text x="\${x+52}" y="\${y+18}" text-anchor="middle" font-family="system-ui" font-size="10" fill="#ffffff88">\${topic}</text>
        <text x="\${x+52}" y="\${y+36}" text-anchor="middle" font-family="system-ui" font-size="13" font-weight="700" fill="\${tcolor}">\${label}</text>\`;
      }).join('\n');

      return \`<svg xmlns="http://www.w3.org/2000/svg" width="380" height="\${totalH}">
        <rect width="380" height="\${totalH}" rx="20" fill="#0d0d1a"/>
        <rect width="380" height="\${totalH}" rx="20" fill="url(#pg)"/>
        <defs>
          <linearGradient id="ag" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#a855f7"/><stop offset="100%" stop-color="#3b82f6"/></linearGradient>
          <radialGradient id="pg" cx="20%" cy="50%" r="60%"><stop offset="0%" stop-color="#4c1d95" stop-opacity="0.2"/><stop offset="100%" stop-color="#0d0d1a" stop-opacity="0"/></radialGradient>
        </defs>
        <text x="24" y="42" font-family="system-ui" font-size="22" font-weight="900" fill="#a855f7">f<tspan fill="white">oo</tspan>q</text>
        <rect x="254" y="24" width="102" height="26" rx="13" fill="#a855f722" stroke="#a855f744" stroke-width="1"/>
        <text x="305" y="41" text-anchor="middle" font-family="system-ui" font-size="11" font-weight="600" fill="#a855f7">\${rankLbl}</text>
        <text x="24" y="80" font-family="system-ui" font-size="24" font-weight="900" fill="white">\${me.name}</text>
        <text x="24" y="100" font-family="system-ui" font-size="11" fill="#ffffff55">\${room.players.length} PLAYERS · \${room.currentRound} ROUNDS</text>
        \${chips}
        <line x1="24" y1="\${120 + gridH + 16}" x2="356" y2="\${120 + gridH + 16}" stroke="#ffffff11" stroke-width="1"/>
        <text x="64" y="\${120 + gridH + 44}" text-anchor="middle" font-family="system-ui" font-size="22" font-weight="900" fill="white">\${me.score}</text>
        <text x="64" y="\${120 + gridH + 58}" text-anchor="middle" font-family="system-ui" font-size="9" fill="#ffffff44">SCORE</text>
        <text x="190" y="\${120 + gridH + 44}" text-anchor="middle" font-family="system-ui" font-size="22" font-weight="900" fill="white">x\${bestStreak}</text>
        <text x="190" y="\${120 + gridH + 58}" text-anchor="middle" font-family="system-ui" font-size="9" fill="#ffffff44">BEST STREAK</text>
        <text x="316" y="\${120 + gridH + 44}" text-anchor="middle" font-family="system-ui" font-size="22" font-weight="900" fill="white">\${acc}%</text>
        <text x="316" y="\${120 + gridH + 58}" text-anchor="middle" font-family="system-ui" font-size="9" fill="#ffffff44">ACCURACY</text>
        <text x="190" y="\${totalH - 10}" text-anchor="middle" font-family="system-ui" font-size="10" fill="#a855f744">flooq.up.railway.app</text>
      </svg>\`;
    } else {
      // Streak card
      const allTopics = [...hotTopics.map(t => ({t, hot: true})), ...otherTopics.slice(0, 4).map(t => ({t, hot: false}))];
      let pillX = 24; let pillY = 96; let pillRows = [''];
      allTopics.forEach(({t, hot}) => {
        const w = t.length * 7.5 + 24;
        if (pillX + w > 356) { pillX = 24; pillY += 32; pillRows.push(''); }
        pillRows[pillRows.length-1] += \`<rect x="\${pillX}" y="\${pillY}" width="\${w}" height="24" rx="12" fill="\${hot ? '#78350f' : '#ffffff0d'}" stroke="\${hot ? '#f59e0b44' : 'none'}"/>
        <text x="\${pillX + w/2}" y="\${pillY + 16}" text-anchor="middle" font-family="system-ui" font-size="11" font-weight="\${hot ? 600 : 400}" fill="\${hot ? '#fbbf24' : '#ffffff66'}">\${t}\${hot ? ' 🔥' : ''}</text>\`;
        pillX += w + 8;
      });
      const pillH = pillY + 32 - 96;
      const totalH = 96 + pillH + 60;
      return \`<svg xmlns="http://www.w3.org/2000/svg" width="380" height="\${totalH}">
        <rect width="380" height="\${totalH}" rx="20" fill="#0d0d1a"/>
        <defs><radialGradient id="sg" cx="20%" cy="30%" r="60%"><stop offset="0%" stop-color="#92400e" stop-opacity="0.15"/><stop offset="100%" stop-color="#0d0d1a" stop-opacity="0"/></radialGradient></defs>
        <rect width="380" height="\${totalH}" rx="20" fill="url(#sg)"/>
        <rect x="24" y="20" width="44" height="44" rx="12" fill="#78350f33" stroke="#f59e0b44" stroke-width="1"/>
        <text x="46" y="50" text-anchor="middle" font-family="system-ui" font-size="22">🔥</text>
        <text x="80" y="40" font-family="system-ui" font-size="18" font-weight="900" fill="white">\${me.name} hit a x\${bestStreak} streak</text>
        <text x="80" y="58" font-family="system-ui" font-size="12" fill="#ffffff44">in Flooq · \${room.players.length} players</text>
        \${pillRows.join('\n')}
        <line x1="24" y1="\${96 + pillH + 14}" x2="356" y2="\${96 + pillH + 14}" stroke="#ffffff11" stroke-width="1"/>
        <text x="24" y="\${96 + pillH + 36}" font-family="system-ui" font-size="11" fill="#a855f766">flooq.up.railway.app</text>
        <rect x="270" y="\${96 + pillH + 20}" width="110" height="28" rx="14" fill="#7c3aed"/>
        <text x="325" y="\${96 + pillH + 38}" text-anchor="middle" font-family="system-ui" font-size="12" font-weight="600" fill="white">Beat my streak</text>
      </svg>\`;
    }
  };

  const handleCopyImage = async () => {
    const svgStr  = buildShareSvg();
    const blob    = new Blob([svgStr], { type: 'image/svg+xml' });
    // Try Clipboard API with SVG (works in Chrome 120+)
    try {
      const item = new ClipboardItem({ 'image/svg+xml': blob });
      await navigator.clipboard.write([item]);
      setCopied(true); setTimeout(() => setCopied(false), 2000); return;
    } catch { /* fallthrough */ }
    // Fallback: render SVG to canvas and copy as PNG
    try {
      const url    = URL.createObjectURL(blob);
      const img    = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width * 2; canvas.height = img.height * 2;
        const ctx = canvas.getContext('2d')!;
        ctx.scale(2, 2); ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob(async (pngBlob) => {
          if (!pngBlob) return;
          try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
            setCopied(true); setTimeout(() => setCopied(false), 2000);
          } catch { handleDownload(svgStr); }
        }, 'image/png');
      };
      img.src = url;
    } catch { handleDownload(svgStr); }
  };

  const handleDownload = (svgStr?: string) => {
    const svg  = svgStr ?? buildShareSvg();
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = \`flooq-\${tab}-\${me.name}.svg\`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    // On mobile with Web Share API — try sharing the SVG file directly
    const svgStr = buildShareSvg();
    const blob   = new Blob([svgStr], { type: 'image/svg+xml' });
    const file   = new File([blob], \`flooq-result.svg\`, { type: 'image/svg+xml' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'My Flooq result', text: shareText });
        return;
      } catch { /* fallthrough */ }
    }
    // Share text only if file sharing not supported
    if (navigator.share) {
      try { await navigator.share({ text: shareText }); return; } catch { /* fallthrough */ }
    }
    // Desktop fallback — copy image
    await handleCopyImage();
  };

  return (
    <>
      {/* Trigger button */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.2 }}
      >
        <Button
          variant="outline"
          size="lg"
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-center gap-2"
        >
          <Share2 className="w-4 h-4" />
          Share your result
        </Button>
      </motion.div>

      {/* Modal — rendered via portal so position:fixed works at document root */}
      {createPortal(
        <AnimatePresence>
          {open && (
            <div style={{
              position: "fixed", inset: 0, zIndex: 100,
              background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
              display: "flex", alignItems: "flex-end", justifyContent: "center",
              padding: "0 16px 24px",
            }}
            onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
            >
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              style={{
                background: "#0D0D1A",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 24,
                padding: 20,
                width: "100%",
                maxWidth: 420,
              }}
            >
              {/* Modal header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, color: "white" }}>
                  Share your result
                </span>
                <button
                  onClick={() => setOpen(false)}
                  style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, padding: 6, cursor: "pointer", color: "rgba(255,255,255,0.5)", display: "flex" }}
                >
                  <X style={{ width: 16, height: 16 }} />
                </button>
              </div>

              {/* Tab switcher */}
              {hasStreak && (
                <div style={{
                  display: "flex", gap: 6, marginBottom: 16,
                  background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 4,
                }}>
                  {(["passport", "streak"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      style={{
                        flex: 1, padding: "8px 0", border: "none", cursor: "pointer",
                        borderRadius: 10, fontSize: 12, fontWeight: 600,
                        background: tab === t ? "#7C3AED" : "transparent",
                        color: tab === t ? "white" : "rgba(255,255,255,0.4)",
                        transition: "all 0.15s",
                      }}
                    >
                      {t === "passport" ? "📋 Game Recap" : "🔥 Streak Brag"}
                    </button>
                  ))}
                </div>
              )}

              {/* Card preview */}
              <div style={{ overflow: "auto", marginBottom: 16, borderRadius: 16 }}>
                {tab === "passport"
                  ? <PassportCard me={me} room={room} topicStats={topicStats} bestStreak={bestStreak} />
                  : <StreakCard   me={me} room={room} topicStats={topicStats} bestStreak={bestStreak} />
                }
              </div>

              {/* Share text preview */}
              <div style={{
                background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 12,
                marginBottom: 14, fontSize: 12, color: "rgba(255,255,255,0.5)",
                lineHeight: 1.6, whiteSpace: "pre-line",
              }}>
                {shareText}
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Primary — Share image (mobile) or Copy image (desktop) */}
                <button
                  onClick={handleShare}
                  style={{
                    width: "100%", padding: "14px 0", border: "none", cursor: "pointer",
                    background: copied ? "#059669" : "linear-gradient(135deg, #7C3AED, #2563EB)",
                    borderRadius: 14, fontFamily: "'Outfit', sans-serif",
                    fontSize: 15, fontWeight: 700, color: "white",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    transition: "all 0.2s",
                  }}
                >
                  {copied
                    ? <><Check style={{ width: 18, height: 18 }} /> Copied!</>
                    : <><Share2 style={{ width: 18, height: 18 }} /> {navigator.share ? "Share card" : "Copy image"}</>
                  }
                </button>

                {/* Secondary row — Copy text + Download */}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleCopyImage}
                    style={{
                      flex: 1, padding: "10px 0", border: "1px solid rgba(255,255,255,0.12)",
                      cursor: "pointer", background: "rgba(255,255,255,0.05)",
                      borderRadius: 12, fontFamily: "'Plus Jakarta Sans', sans-serif",
                      fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    }}
                  >
                    <Copy style={{ width: 14, height: 14 }} /> Copy image
                  </button>
                  <button
                    onClick={() => handleDownload()}
                    style={{
                      flex: 1, padding: "10px 0", border: "1px solid rgba(255,255,255,0.12)",
                      cursor: "pointer", background: "rgba(255,255,255,0.05)",
                      borderRadius: 12, fontFamily: "'Plus Jakarta Sans', sans-serif",
                      fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    }}
                  >
                    <svg style={{ width: 14, height: 14 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Save as SVG
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body
    )}
    </>
  );
}
