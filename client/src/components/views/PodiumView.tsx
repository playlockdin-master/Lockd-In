import { Room, Player } from "@shared/schema";
import { motion } from "framer-motion";
import { Trophy, Star, RotateCcw, RefreshCw, Users, CheckCircle2, Clock, Globe } from "lucide-react";
import { Button } from "../Button";
import { Avatar } from "../Avatar";
import { useAudioSystem } from "@/hooks/use-audio";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Confetti } from "../Confetti";
import { ShareCard } from "../ShareCard";
import { type TopicStat } from "@/hooks/use-socket";

interface Props {
  room: Room;
  me: Player;
  onPlayAgain: () => void;
  onLeave: () => void;
  topicStats: TopicStat[];
  bestStreak: number;
}

const MEDAL = [
  { bg: "from-yellow-400/30 to-yellow-600/10", border: "border-yellow-400/60", text: "text-yellow-300", height: "h-28 md:h-40" },
  { bg: "from-slate-300/20 to-slate-500/10",   border: "border-slate-300/50",  text: "text-slate-300",  height: "h-20 md:h-32" },
  { bg: "from-amber-600/20 to-amber-800/10",   border: "border-amber-600/50",  text: "text-amber-500",  height: "h-14 md:h-24" },
];

function sortedPlayers(players: Player[]): Player[] {
  return [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function isTied(sorted: Player[], idx: number): boolean {
  return idx > 0 && sorted[idx].score === sorted[idx - 1].score;
}

function PodiumSlot({ player, rank, me }: { player: Player; rank: number; me: Player }) {
  const medal = MEDAL[rank];
  const delay = [0.9, 0.5, 1.2][rank];

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 220, damping: 20 }}
      className="flex flex-col items-center gap-1.5"
    >
      {/* Card above podium */}
      <div className={`flex flex-col items-center gap-1 px-2 py-2 md:px-3 md:py-2.5 rounded-2xl border backdrop-blur-md bg-gradient-to-b ${medal.bg} ${medal.border} ${rank === 0 ? 'scale-110' : ''}`}>
        {rank === 0 && (
          <motion.div animate={{ rotate: [0, -10, 10, -10, 10, 0] }} transition={{ delay: 1.2, duration: 0.6 }}>
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
          </motion.div>
        )}
        <Avatar
          avatarId={player.avatarId ?? 'ghost'}
          mood="correct"
          streak={player.streak}
          isLeader={rank === 0}
          size={rank === 0 ? 52 : 40}
        />
        <span className={`font-display font-black ${player.name.length > 8 ? 'text-[10px]' : 'text-xs md:text-sm'} ${medal.text} max-w-[72px] text-center break-words leading-tight`}>
          {player.name}
        </span>
        {player.id === me.id && <span className="text-[9px] text-white/40">(you)</span>}
        <span className="font-mono font-bold text-white text-xs md:text-sm">{player.score}</span>
      </div>

      {/* Podium block */}
      <div className={`w-16 md:w-24 ${medal.height} rounded-t-lg border ${medal.border} bg-gradient-to-t ${medal.bg} flex items-center justify-center`}>
        <span className={`font-display font-black text-2xl md:text-3xl ${medal.text} opacity-25`}>{rank + 1}</span>
      </div>
    </motion.div>
  );
}

export function PodiumView({ room, me, onPlayAgain, onLeave, topicStats, bestStreak }: Props) {
  const [, setLocation] = useLocation();
  const { playSound } = useAudioSystem();
  const soundPlayedRef = useRef(false);
  const [hasClickedPlayAgain, setHasClickedPlayAgain] = useState(false);

  const handleLeave = () => {
    onLeave();
    setLocation('/');
  };

  const sorted = sortedPlayers(room.players);
  const top3 = sorted.slice(0, 3);
  const winner = sorted[0];
  const gameEndedEarly = room.players.length === 1;

  // Players who pressed Play Again
  const playAgainIds = room.playAgainIds ?? [];
  const viewingResultsIds = room.viewingResultsIds ?? [];
  const playAgainPlayers = room.players.filter(p => playAgainIds.includes(p.id));
  // Players still viewing results (haven't clicked play again yet, excluding self if clicked)
  const stillViewingPlayers = room.players.filter(p =>
    !playAgainIds.includes(p.id) && p.id !== me.id
  );

  // Sync local clicked state from server
  useEffect(() => {
    if (playAgainIds.includes(me.id)) setHasClickedPlayAgain(true);
  }, [playAgainIds, me.id]);

  useEffect(() => {
    if (soundPlayedRef.current) return;
    soundPlayedRef.current = true;
    setTimeout(() => playSound('notification'), 400);
    setTimeout(() => playSound('notification'), 900);
  }, []);

  // Push the rectangle ad when this view mounts
  useEffect(() => {
    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch (_) {}
  }, []);

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center gap-4 pb-8 px-1" style={{ position: 'relative' }}>
      <Confetti />


      {gameEndedEarly && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="w-full text-center px-4 py-2 rounded-xl bg-white/5 border border-white/10"
        >
          <p className="text-white/50 text-xs">Game ended early — all other players left</p>
        </motion.div>
      )}

      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="text-center"
      >
        <div className="flex items-center justify-center gap-2 mb-1">
          <Trophy className="w-6 h-6 md:w-8 md:h-8 text-yellow-400" />
          <h1 className="text-3xl md:text-5xl font-display font-black text-white tracking-tight">GAME OVER</h1>
          <Trophy className="w-6 h-6 md:w-8 md:h-8 text-yellow-400" />
        </div>
        <p className="text-white/40 text-xs md:text-sm tracking-widest uppercase">Final Results</p>
        {room.mode === 'score' && winner && (
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
            className="mt-1 text-yellow-300 font-bold text-sm md:text-base"
          >
            {winner.name} hit {winner.score} pts — target was {room.target}!
          </motion.p>
        )}
      </motion.div>

      {/* Podium */}
      {top3.length > 0 && (
        <div className="w-full flex items-end justify-center gap-2 md:gap-4 px-2">
          {top3.length === 1
            ? <PodiumSlot player={top3[0]} rank={0} me={me} />
            : top3.length === 2
              ? [1, 0].map(rank => <PodiumSlot key={rank} player={top3[rank]} rank={rank} me={me} />)
              : [
                  <PodiumSlot key={1} player={top3[1]} rank={1} me={me} />,
                  <PodiumSlot key={0} player={top3[0]} rank={0} me={me} />,
                  <PodiumSlot key={2} player={top3[2]} rank={2} me={me} />,
                ]
          }
        </div>
      )}

      {/* Full rankings */}
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4 }}
        className="w-full glass-panel rounded-2xl p-3 md:p-5"
      >
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />All Players
        </h3>
        <div className="flex flex-col gap-1.5">
          {sorted.map((p, idx) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.5 + idx * 0.06 }}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl ${
                p.id === me.id ? 'bg-teal-500/20 border border-teal-400/40' : 'bg-white/5'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`font-display font-black text-sm w-5 text-center shrink-0 ${
                  idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-slate-300' : idx === 2 ? 'text-amber-600' : 'text-white/30'
                }`}>{idx + 1}</span>
                <Avatar avatarId={p.avatarId ?? 'ghost'} mood="idle" streak={p.streak} isLeader={idx === 0} size={32} />
                <span className="font-medium text-white text-xs md:text-sm truncate">{p.name}</span>
                {p.id === me.id && <span className="text-[10px] text-teal-400 font-bold shrink-0">(you)</span>}
                {isTied(sorted, idx) && (
                  <span className="text-[10px] text-white/40 font-medium bg-white/10 px-1 py-0.5 rounded shrink-0">Tied</span>
                )}
              </div>
              <span className="font-mono font-bold text-white text-xs md:text-sm shrink-0">{p.score}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Share result */}
      <ShareCard me={me} room={room} topicStats={topicStats} bestStreak={bestStreak} />

      {/* ── Ad rectangle ── */}
      <div className="flex justify-center my-1">
        <ins className="adsbygoogle"
          style={{ display: "inline-block", width: "300px", height: "250px" }}
          data-ad-client="ca-pub-4551070722550073"
          data-ad-slot="9964879330"
        />
      </div>

      {/* Action buttons */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.0 }}
        className="flex flex-col sm:flex-row gap-2 w-full max-w-xs"
      >
        {!hasClickedPlayAgain ? (
          <Button
            size="lg"
            variant="success"
            onClick={() => { setHasClickedPlayAgain(true); onPlayAgain(); }}
            className="flex-1 flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-5 h-5" />Play Again
          </Button>
        ) : (
          <div className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-green-500/15 border border-green-500/30 text-green-400 text-sm font-semibold">
            <CheckCircle2 className="w-4 h-4" />Heading to lobby…
          </div>
        )}
        <Button
          size="lg"
          variant="outline"
          onClick={handleLeave}
          className="flex-1 flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />Leave
        </Button>
      </motion.div>

      {/* Play Again status panel */}
      {(playAgainPlayers.length > 0 || stillViewingPlayers.length > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-xs space-y-2"
        >
          {/* Players ready to go */}
          {playAgainPlayers.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20">
              <span className="text-green-400 text-xs font-semibold w-full mb-1">
                ✅ {playAgainPlayers.length} ready to play again
              </span>
              {playAgainPlayers.map(p => (
                <div key={p.id} className="flex items-center gap-1 bg-green-500/15 px-2 py-0.5 rounded-full">
                  <Avatar avatarId={p.avatarId ?? 'ghost'} mood="correct" streak={0} isLeader={false} size={16} />
                  <span className="text-green-300 text-[10px] font-medium">{p.id === me.id ? 'You' : p.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* Players still viewing results */}
          {stillViewingPlayers.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
              <span className="text-white/40 text-xs font-semibold w-full mb-1 flex items-center gap-1.5">
                <Clock className="w-3 h-3" />Still viewing results
              </span>
              {stillViewingPlayers.map(p => (
                <div key={p.id} className="flex items-center gap-1 bg-white/8 px-2 py-0.5 rounded-full opacity-50">
                  <Avatar avatarId={p.avatarId ?? 'ghost'} mood="idle" streak={0} isLeader={false} size={16} />
                  <span className="text-white/50 text-[10px] font-medium">{p.name}</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Leaderboard link */}
      <motion.button
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.3 }}
        onClick={() => setLocation('/leaderboard')}
        className="flex items-center gap-1.5 px-4 py-2 rounded-xl glass-panel text-white/40 hover:text-teal-300 text-xs font-semibold transition-colors border border-white/10 hover:border-teal-400/30"
      >
        <Globe className="w-3.5 h-3.5" />View Global Leaderboard
      </motion.button>

      {!hasClickedPlayAgain && (
        <p className="text-white/25 text-[10px] text-center -mt-1 px-4">
          Click Play Again to head to the lobby — game starts when everyone's ready!
        </p>
      )}
    </div>
  );
}
