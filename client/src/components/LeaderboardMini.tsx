import { Player } from "@shared/schema";
import { motion } from "framer-motion";
import { Flame } from "lucide-react";

interface Props {
  players: Player[];
  myId?: string;
}

export function LeaderboardMini({ players, myId }: Props) {
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  // Always show top 5, plus inject self if ranked 6th or lower
  const top5 = sortedPlayers.slice(0, 5);
  const myRank = sortedPlayers.findIndex(p => p.id === myId);
  const selfInTop5 = myRank < 5;
  const showSelf = !selfInTop5 && myRank !== -1;
  const hiddenCount = sortedPlayers.length - 5;

  const displayList = top5;

  return (
    <div className="flex flex-wrap justify-center gap-2 md:gap-3 mb-2">
      {displayList.map((player, index) => {
        const isMe = player.id === myId;
        const hotStreak = player.streak >= 3;

        return (
          <motion.div
            key={player.id}
            layout
            layoutId={`leaderboard-mini-${player.id}`}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className={`relative flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border transition-all ${
              index === 0
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
                : isMe
                  ? 'bg-teal-500/20 border-teal-400/50 text-white'
                  : 'bg-white/5 border-white/10 text-white/80'
            } ${hotStreak ? 'streak-glow' : ''}`}
          >
            {hotStreak && (
              <motion.span
                className="absolute inset-0 rounded-full border-2 border-orange-400/60"
                animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.12, 1] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              />
            )}
            <div className="font-bold text-sm">#{index + 1}</div>
            <div className="text-sm font-medium max-w-[72px] truncate">
              {player.name}{isMe ? ' ✦' : ''}
            </div>
            <div className="font-mono text-sm font-bold">{player.score}</div>
            {hotStreak && (
              <motion.div
                animate={{ scale: [1, 1.25, 1] }}
                transition={{ duration: 0.8, repeat: Infinity }}
                className="flex items-center text-orange-400 text-xs font-bold"
              >
                <Flame className="w-3 h-3 fill-orange-400" />
                {player.streak}
              </motion.div>
            )}
          </motion.div>
        );
      })}

      {/* Self pill if outside top 5 */}
      {showSelf && (() => {
        const me = sortedPlayers[myRank];
        const hotStreak = me.streak >= 3;
        return (
          <>
            {hiddenCount > 5 && (
              <div className="flex items-center px-2 text-white/30 text-xs font-medium">···</div>
            )}
            <motion.div
              key={me.id}
              layout
              layoutId={`leaderboard-mini-${me.id}`}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className={`relative flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border bg-teal-500/20 border-teal-400/50 text-white ${hotStreak ? 'streak-glow' : ''}`}
            >
              <div className="font-bold text-sm">#{myRank + 1}</div>
              <div className="text-sm font-medium max-w-[72px] truncate">{me.name} ✦</div>
              <div className="font-mono text-sm font-bold">{me.score}</div>
              {hotStreak && (
                <motion.div
                  animate={{ scale: [1, 1.25, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                  className="flex items-center text-orange-400 text-xs font-bold"
                >
                  <Flame className="w-3 h-3 fill-orange-400" />
                  {me.streak}
                </motion.div>
              )}
            </motion.div>
          </>
        );
      })()}
    </div>
  );
}
