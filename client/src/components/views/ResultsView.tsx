import { Room, Player } from "@shared/schema";
import { Card } from "../Card";
import { Avatar } from "../Avatar";
import { motion } from "framer-motion";
import React, { useEffect, useRef, useState } from "react";
import { useAudioSystem } from "@/hooks/use-audio";
import { Trophy, XCircle, CheckCircle2, Zap, Flame, Clock, Eye, Lightbulb } from "lucide-react";

interface Props {
  room: Room;
  me: Player;
}

export function ResultsView({ room, me }: Props) {
  const { playSound } = useAudioSystem();
  const soundPlayedRef = useRef(false);
  const playSoundRef   = useRef(playSound);
  // Keep ref in sync so tick/sound callbacks never hold a stale function
  useEffect(() => { playSoundRef.current = playSound; });

  const lastAnswerCorrectRef = useRef(me.lastAnswerCorrect);
  useEffect(() => {
    if (soundPlayedRef.current) return;
    soundPlayedRef.current = true;
    if (lastAnswerCorrectRef.current === true)
      playSoundRef.current("correct");
    else if (lastAnswerCorrectRef.current === false || lastAnswerCorrectRef.current === null)
      playSoundRef.current("incorrect");
    // undefined = late joiner observer — no sound
  }, []);

  const TOTAL_TIME = 8000;
  const [barStyle, setBarStyle] = useState<React.CSSProperties>({ width: "100%" });

  useEffect(() => {
    // Use setInterval polling so the bar keeps ticking correctly
    // when the tab is backgrounded on iOS/Android.
    if (!room.resultsDeadline) return;
    const deadline = room.resultsDeadline;

    const update = () => {
      const remaining = Math.max(0, deadline - Date.now());
      setBarStyle({ width: `${(remaining / TOTAL_TIME) * 100}%`, transition: 'none' });
      if (remaining <= 0) clearInterval(timer);
    };
    update(); // paint immediately
    const timer = setInterval(update, 100);

    // Tick sounds — still use setTimeout but based on deadline
    const tickIds: ReturnType<typeof setTimeout>[] = [];
    const remaining0 = Math.max(0, deadline - Date.now());
    const seconds = Math.ceil(remaining0 / 1000);
    for (let i = 0; i < seconds; i++) {
      const delay = remaining0 - (seconds - i) * 1000;
      if (delay >= 0) tickIds.push(setTimeout(() => playSoundRef.current('tick'), delay));
    }
    return () => {
      clearInterval(timer);
      tickIds.forEach(clearTimeout);
    };
  }, [room.resultsDeadline]);

  const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);

  const resultState =
    me.lastAnswerCorrect === true  ? "correct"   :
    me.lastAnswerCorrect === null  ? "timedout"  :
    me.lastAnswerCorrect === false ? "wrong"      : "observer"; // undefined = joined late

  const bannerColors = {
    correct:    "bg-success/20 border-success",
    timedout:   "bg-yellow-500/20 border-yellow-500",
    wrong:      "bg-destructive/20 border-destructive",
    observer:   "bg-white/10 border-white/20",
  };

  if (!room.currentQuestion) {
    return (
      <div className="flex items-center justify-center w-full py-20">
        <div className="w-10 h-10 border-4 border-teal-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  const q = room.currentQuestion;

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-2 pb-4 px-1" style={{ position: 'relative' }}>


      {/* Countdown bar */}
      <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-teal-500 to-cyan-500" style={barStyle} />
      </div>

      {/* ── Result banner ── */}
      <motion.div
        initial={{ scale: 0.93, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 22 }}
        className={`px-3 py-2 rounded-2xl border-2 relative overflow-hidden ${bannerColors[resultState]}`}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent z-0" />
        <div className="relative z-10 flex items-center justify-between gap-2">
          <h2 className="text-base font-display font-black text-white flex items-center gap-1.5">
            {resultState === "correct"
              ? <><CheckCircle2 className="w-5 h-5 text-success shrink-0" />CORRECT!</>
              : resultState === "timedout"
                ? <><Clock className="w-5 h-5 text-yellow-400 shrink-0" />TIMED OUT</>
                : resultState === "observer"
                  ? <><Eye className="w-5 h-5 text-white/60 shrink-0" />JOINED MID-ROUND</>
                  : <><XCircle className="w-5 h-5 text-destructive shrink-0" />WRONG</>
            }
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            {room.fastestPlayerId === me.id && (
              <motion.span
                initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-500/20 text-yellow-300 rounded-full text-[10px] font-bold border border-yellow-500/50"
              >
                <Zap className="w-2.5 h-2.5 fill-current" />Fastest!
              </motion.span>
            )}
            {me.streak > 1 && (
              <motion.span
                initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-500/20 text-orange-300 rounded-full text-[10px] font-bold border border-orange-500/50"
              >
                <Flame className="w-2.5 h-2.5 fill-current" />{me.streak}×
              </motion.span>
            )}
            <span className="text-base font-black text-white">
              {me.lastPoints !== undefined && me.lastPoints > 0 ? `+${me.lastPoints}` : "0"} <span className="text-white/50 font-normal text-xs">pts</span>
            </span>
          </div>
        </div>
      </motion.div>

      {/* ── Podium + list leaderboard ── */}
      <PodiumPanel sortedPlayers={sortedPlayers} me={me} />

      {/* ── Answer breakdown ── */}
      <AnswerPanel q={q} room={room} me={me} />

    </div>
  );
}

// ── Podium + list panel ───────────────────────────────────────────────────────

function playerMood(p: Player) {
  return p.lastAnswerCorrect === true  ? "correct"  :
         p.lastAnswerCorrect === false ? "wrong"    :
         p.lastAnswerCorrect === null  ? "timeout"  : "idle";
}

function PodiumPanel({ sortedPlayers, me }: { sortedPlayers: Player[]; me: Player }) {
  const top3 = sortedPlayers.slice(0, 3);
  const rest = sortedPlayers.slice(3);

  // Podium display order: 2nd | 1st | 3rd
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean) as Player[];

  // Heights for the podium blocks (2nd, 1st, 3rd)
  const blockH   = [52, 72, 40];
  const avatarSz = [38, 50, 34];
  const medals   = ["🥈", "🥇", "🥉"];
  const glowCol  = ["#94a3b8", "#fbbf24", "#cd7c32"];

  return (
    <Card className="p-2.5 md:p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <Trophy className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
        <span className="font-display font-bold text-white text-xs tracking-wide">STANDINGS</span>
      </div>

      {/* ── Podium (top 3) ── */}
      <div className="flex items-end justify-center gap-2 mb-3">
        {podiumOrder.map((p, vi) => {
          const realIdx = sortedPlayers.indexOf(p);
          const isMe    = p.id === me.id;
          const gc      = glowCol[vi];

          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: vi * 0.08, type: "spring", stiffness: 260, damping: 20 }}
              className="flex flex-col items-center gap-1"
              style={{ flex: vi === 1 ? "0 0 38%" : "0 0 28%" }}
            >
              {/* Avatar + crown/fire */}
              <Avatar
                avatarId={p.avatarId ?? "ghost"}
                mood={playerMood(p)}
                streak={p.streak}
                isLeader={realIdx === 0}
                size={avatarSz[vi]}
              />

              {/* Name */}
              <div
                className="font-bold text-center w-full truncate"
                style={{
                  fontSize: vi === 1 ? 11 : 9,
                  color: isMe ? "#c084fc" : "#fff",
                  maxWidth: vi === 1 ? 72 : 56,
                  margin: "0 auto",
                }}
              >
                {isMe ? "You" : p.name}
              </div>

              {/* Score + delta */}
              <div className="flex items-baseline gap-1 justify-center">
                <motion.span
                  key={p.score}
                  initial={{ scale: 1.5, color: gc }}
                  animate={{ scale: 1, color: "#fff" }}
                  transition={{ duration: 0.4 }}
                  style={{ fontWeight: 900, fontSize: vi === 1 ? 15 : 12, fontFamily: "monospace" }}
                >
                  {p.score}
                </motion.span>
                {(p.lastPoints ?? 0) > 0 && (
                  <span style={{ fontSize: 9, color: "#22c55e", fontWeight: 700 }}>
                    +{p.lastPoints}
                  </span>
                )}
              </div>

              {/* Podium block */}
              <div
                className="w-full rounded-t-lg flex items-start justify-center pt-1.5"
                style={{
                  height: blockH[vi],
                  background: `linear-gradient(to top, ${gc}28, ${gc}08)`,
                  border: `1.5px solid ${isMe ? "#2dd4bf" : gc + "50"}`,
                  borderBottom: "none",
                  boxShadow: isMe ? `0 0 12px #2dd4bf20` : "none",
                }}
              >
                <span style={{ fontSize: vi === 1 ? 20 : 15 }}>{medals[vi]}</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ── Rest of players (4th+) as compact 2-col rows ── */}
      {rest.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {rest.map((p, i) => {
            const isMe = p.id === me.id;
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.28 + i * 0.05 }}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-xl border ${
                  isMe ? "bg-teal-500/15 border-teal-400/40" : "bg-white/5 border-white/10"
                }`}
              >
                <span className="text-[10px] font-bold text-white/30 w-4 text-center shrink-0">
                  #{i + 4}
                </span>
                <Avatar
                  avatarId={p.avatarId ?? "ghost"}
                  mood={playerMood(p)}
                  streak={p.streak}
                  size={28}
                />
                <div className="flex-1 min-w-0">
                  <div
                    className="font-bold truncate"
                    style={{ fontSize: 11, color: isMe ? "#c084fc" : "#fff" }}
                  >
                    {isMe ? "You" : p.name}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <motion.span
                      key={p.score}
                      initial={{ scale: 1.3, color: "#2dd4bf" }}
                      animate={{ scale: 1, color: "#fff" }}
                      transition={{ duration: 0.3 }}
                      style={{ fontSize: 12, fontWeight: 900, fontFamily: "monospace" }}
                    >
                      {p.score}
                    </motion.span>
                    {(p.lastPoints ?? 0) > 0 && (
                      <span style={{ fontSize: 9, color: "#22c55e", fontWeight: 700 }}>
                        +{p.lastPoints}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── Expandable explanation block ─────────────────────────────────────────────

function ExplanationBlock({ explanation }: { explanation: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = explanation.length > 160;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.45 }}
      className="mt-2 p-2 md:p-2.5 rounded-xl cursor-pointer select-none"
      style={{ background: "#0d948812", border: "1px solid #0d948830" }}
      onClick={() => isLong && setExpanded(e => !e)}
    >
      <p className={`text-white/70 text-[10px] md:text-xs leading-relaxed flex gap-1.5 ${!expanded && isLong ? 'line-clamp-3' : ''}`}>
        <Lightbulb className="w-3 h-3 text-yellow-400 shrink-0 mt-px" />
        {explanation}
      </p>
      {isLong && (
        <p className="text-teal-400/60 text-[9px] mt-1 font-medium">
          {expanded ? '▲ Show less' : '▼ Tap to read more'}
        </p>
      )}
    </motion.div>
  );
}

// ── Answer breakdown panel ────────────────────────────────────────────────────

function AnswerPanel({ q, room, me }: { q: NonNullable<Room["currentQuestion"]>; room: Room; me: Player }) {
  // Exclude late-joiner sentinel answers (answerIndex === -1) from stats
  const totalAnswered = Object.values(room.answers ?? {}).filter(a => a.answerIndex >= 0).length;

  return (
    <Card className="p-2.5 md:p-4">
      <div className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-1.5">
        Q&amp;A Breakdown
      </div>
      <p className="text-xs md:text-sm font-medium text-white mb-2.5 leading-snug line-clamp-2">
        {q.text}
      </p>

      <div className="space-y-1.5">
        {q.options.map((opt: string, idx: number) => {
          const isCorrect     = idx === q.correctIndex;
          const playerPicked  = me.lastAnswer === idx;
          // Only count players who made a real pick (not late-joiner sentinels)
          const pickers       = room.players.filter(p => room.answers?.[p.id]?.answerIndex === idx);
          const pct           = totalAnswered > 0 ? Math.round((pickers.length / totalAnswered) * 100) : 0;
          const barColor      = isCorrect ? "#22c55e" : playerPicked ? "#ef4444" : "#4b5563";

          return (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + idx * 0.07 }}
              className="rounded-xl overflow-hidden"
              style={{
                border: `1.5px solid ${isCorrect ? "#22c55e50" : playerPicked ? "#ef444450" : "#ffffff12"}`,
              }}
            >
              {/* Option row */}
              <div
                className="flex items-center gap-2 px-2.5 py-1.5"
                style={{ background: isCorrect ? "#22c55e10" : playerPicked ? "#ef444410" : "#ffffff06" }}
              >
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center font-bold shrink-0 text-[9px]"
                  style={{ background: barColor + "30", border: `1px solid ${barColor}60`, color: barColor }}
                >
                  {["A","B","C","D"][idx]}
                </div>
                <span
                  className="flex-1 font-medium text-xs truncate"
                  style={{ color: isCorrect ? "#fff" : "#ffffff80" }}
                >
                  {opt}
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: barColor, flexShrink: 0 }}>
                  {pct}%
                </span>
                {isCorrect      && <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />}
                {playerPicked && !isCorrect && <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />}
              </div>

              {/* % fill bar */}
              <div style={{ height: 3, background: "#ffffff08" }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ delay: 0.35, duration: 0.5 }}
                  style={{ height: "100%", background: barColor, boxShadow: `0 0 6px ${barColor}` }}
                />
              </div>

              {/* Pickers — avatar + name chips */}
              {pickers.length > 0 && (
                <div
                  className="flex flex-wrap gap-1 px-2.5 py-1.5"
                  style={{ background: "#ffffff04", borderTop: "1px solid #ffffff08" }}
                >
                  {pickers.map(p => (
                    <motion.div
                      key={p.id}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.3 + idx * 0.06 }}
                      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5"
                      style={{
                        background: "#ffffff0e",
                        border: `1px solid ${isCorrect ? "#22c55e40" : "#ffffff15"}`,
                      }}
                    >
                      <Avatar
                        avatarId={p.avatarId ?? "ghost"}
                        mood={isCorrect ? "correct" : "wrong"}
                        size={16}
                      />
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: p.id === me.id ? "#c084fc" : "#ffffffaa",
                        }}
                      >
                        {p.id === me.id ? "You" : p.name}
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Explanation: expandable, no truncation by default */}
      <ExplanationBlock explanation={q.explanation} />
    </Card>
  );
}
