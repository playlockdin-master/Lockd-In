import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { ParticleBackground } from "@/components/ParticleBackground";
import { Avatar } from "@/components/Avatar";
import {
  Trophy, Target, Zap, CheckCircle, BarChart2, Clock,
  ArrowLeft, BarChart, Hash, Medal, TrendingUp, Globe
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PlayerStats {
  totalGames:    number;
  totalScore:    number;
  bestStreak:    number;
  totalAnswered: number;
  totalCorrect:  number;
  accuracy:      number;
}

interface TopicStat {
  topic:         string;
  totalAnswered: number;
  totalCorrect:  number;
  accuracy:      number;
}

interface GameRecord {
  gameId:      string;
  roomCode:    string;
  mode:        string;
  target:      number;
  finalScore:  number;
  bestStreak:  number;
  playerCount: number;
  rank:        number;
  startedAt:   string;
  endedAt:     string | null;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="glass-panel rounded-2xl p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-white/40 text-xs font-semibold uppercase tracking-wider mb-1">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-display font-black text-white">{value}</div>
      {sub && <div className="text-white/35 text-xs">{sub}</div>}
    </div>
  );
}

function AccuracyBar({ accuracy }: { accuracy: number }) {
  const color =
    accuracy >= 80 ? "bg-teal-400"
    : accuracy >= 60 ? "bg-yellow-400"
    : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${accuracy}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
      <span className="text-xs font-bold text-white/60 w-9 text-right">{accuracy}%</span>
    </div>
  );
}

function RankBadge({ rank, total }: { rank: number; total: number }) {
  if (rank === 1)  return <span className="text-yellow-400 font-bold text-xs">🥇 1st</span>;
  if (rank === 2)  return <span className="text-slate-300 font-bold text-xs">🥈 2nd</span>;
  if (rank === 3)  return <span className="text-amber-500 font-bold text-xs">🥉 3rd</span>;
  return <span className="text-white/40 font-bold text-xs">#{rank} / {total}</span>;
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user, loading, login } = useAuth();

  const [stats,  setStats]  = useState<PlayerStats | null>(null);
  const [topics, setTopics] = useState<TopicStat[]>([]);
  const [games,  setGames]  = useState<GameRecord[]>([]);
  const [busy,   setBusy]   = useState(true);

  // No redirect for guests — show sign-in prompt instead

  useEffect(() => {
    if (!user) return;
    const uid = user.id;

    Promise.all([
      fetch(`/api/player/${uid}/stats`, { credentials: "include" }).then(r => r.json()),
      fetch(`/api/player/${uid}/topics`, { credentials: "include" }).then(r => r.json()),
      fetch(`/api/player/${uid}/games`,  { credentials: "include" }).then(r => r.json()),
    ]).then(([s, t, g]) => {
      if (!s.error) setStats(s);
      if (!t.error) setTopics(t.topics ?? []);
      if (!g.error) setGames(g.games ?? []);
    }).catch(console.error)
      .finally(() => setBusy(false));
  }, [user]);

  if (loading) return null;

  // Guest view — prompt to sign in
  if (!user) {
    return (
      <div className="relative min-h-screen p-4 pb-24 md:pb-10 flex items-center justify-center">
        <ParticleBackground />
        <motion.div
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          className="relative z-10 w-full max-w-sm text-center"
        >
          <div className="glass-panel-heavy rounded-3xl p-8 flex flex-col items-center gap-5 border border-teal-500/15">
            <div className="w-16 h-16 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
              <BarChart2 className="w-7 h-7 text-teal-400" />
            </div>
            <div>
              <h2 className="text-xl font-display font-black text-white mb-2">Track your progress</h2>
              <p className="text-white/45 text-sm leading-relaxed">Sign in with Google to save your stats, streaks, and game history across every session.</p>
            </div>
            <button
              onClick={login}
              className="w-full flex items-center justify-center gap-3 py-3 px-5 rounded-2xl border border-white/15 hover:border-teal-400/40 text-white/80 hover:text-white text-sm font-semibold transition-all glass-panel"
            >
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </button>
            <button onClick={() => setLocation("/")} className="text-white/30 hover:text-white/60 text-xs transition-colors">
              Back to home
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen p-4 pb-24 md:pb-10">
      <ParticleBackground />

      <div className="relative z-10 max-w-2xl mx-auto">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-6 pt-2"
        >
          <button
            onClick={() => setLocation("/")}
            className="hidden md:flex p-2 rounded-xl glass-panel text-white/50 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3 flex-1">
            <Avatar avatarId={user!.avatarId} mood="idle" streak={0} isLeader={false} size={40} />
            <div>
              <h1 className="text-xl font-display font-black text-white leading-tight">{user!.username}</h1>
              <p className="text-white/40 text-xs">Personal Dashboard</p>
            </div>
          </div>
          <button
            onClick={() => setLocation("/leaderboard")}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-panel text-teal-400 hover:text-teal-300 text-xs font-semibold transition-colors border border-teal-400/20"
          >
            <Globe className="w-3.5 h-3.5" />Leaderboard
          </button>
        </motion.div>

        {busy ? (
          <div className="flex items-center justify-center py-24 text-white/30 text-sm">
            Loading your stats…
          </div>
        ) : (
          <>
            {/* Summary stat cards */}
            {stats && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5"
              >
                <StatCard
                  icon={<Trophy className="w-3.5 h-3.5" />}
                  label="Total Score"
                  value={stats.totalScore.toLocaleString()}
                  sub="cumulative points"
                />
                <StatCard
                  icon={<BarChart className="w-3.5 h-3.5" />}
                  label="Games Played"
                  value={stats.totalGames}
                  sub={`${stats.totalAnswered} questions answered`}
                />
                <StatCard
                  icon={<Target className="w-3.5 h-3.5" />}
                  label="Accuracy"
                  value={`${stats.accuracy}%`}
                  sub={`${stats.totalCorrect} / ${stats.totalAnswered} correct`}
                />
                <StatCard
                  icon={<Zap className="w-3.5 h-3.5" />}
                  label="Best Streak"
                  value={`${stats.bestStreak}🔥`}
                  sub="consecutive correct"
                />
                <StatCard
                  icon={<CheckCircle className="w-3.5 h-3.5" />}
                  label="Correct"
                  value={stats.totalCorrect}
                  sub={`${100 - stats.accuracy}% incorrect`}
                />
                <StatCard
                  icon={<Medal className="w-3.5 h-3.5" />}
                  label="Avg Score"
                  value={stats.totalGames > 0
                    ? Math.round(stats.totalScore / stats.totalGames).toLocaleString()
                    : "—"
                  }
                  sub="per game"
                />
              </motion.div>
            )}

            {/* Topics breakdown */}
            {topics.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-panel rounded-2xl p-4 mb-5"
              >
                <h2 className="flex items-center gap-1.5 text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">
                  <BarChart2 className="w-3.5 h-3.5" />Accuracy by Topic
                </h2>
                <div className="space-y-3">
                  {topics.map((t, i) => (
                    <motion.div
                      key={t.topic}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.25 + i * 0.04 }}
                    >
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="text-white text-sm font-medium truncate max-w-[60%]">{t.topic}</span>
                        <span className="text-white/35 text-xs">{t.totalAnswered} answered</span>
                      </div>
                      <AccuracyBar accuracy={t.accuracy} />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Recent games */}
            {games.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="glass-panel rounded-2xl p-4"
              >
                <h2 className="flex items-center gap-1.5 text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">
                  <Clock className="w-3.5 h-3.5" />Recent Games
                </h2>
                <div className="space-y-2">
                  {games.map((g, i) => {
                    const date = new Date(g.startedAt);
                    const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                    const timeStr = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
                    return (
                      <motion.div
                        key={g.gameId}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.35 + i * 0.04 }}
                        className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/8 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
                            {g.rank === 1
                              ? <Trophy className="w-4 h-4 text-yellow-400" />
                              : <TrendingUp className="w-4 h-4 text-white/30" />
                            }
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <Hash className="w-3 h-3 text-white/25 flex-shrink-0" />
                              <span className="text-white/60 text-xs font-mono">{g.roomCode}</span>
                              <span className="text-white/25 text-xs">·</span>
                              <span className="text-white/35 text-xs capitalize">{g.mode}</span>
                            </div>
                            <div className="text-white/30 text-[10px]">{dateStr} {timeStr}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="text-right">
                            <div className="text-white font-mono font-bold text-sm">{g.finalScore}</div>
                            <div className="text-white/30 text-[10px]">pts</div>
                          </div>
                          <RankBadge rank={g.rank} total={g.playerCount} />
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Empty state */}
            {!stats && topics.length === 0 && games.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-20 text-white/30"
              >
                <Trophy className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-semibold">No games played yet</p>
                <p className="text-xs mt-1">Play a game to see your stats here!</p>
                <button
                  onClick={() => setLocation("/")}
                  className="mt-4 px-5 py-2 rounded-xl glass-panel text-teal-400 text-sm font-semibold border border-teal-400/20 hover:border-teal-400/40 transition-colors"
                >
                  Play Now
                </button>
              </motion.div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
