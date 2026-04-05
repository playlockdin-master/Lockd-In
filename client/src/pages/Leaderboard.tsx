import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { ParticleBackground } from "@/components/ParticleBackground";
import { Avatar } from "@/components/Avatar";
import { Trophy, Globe, ArrowLeft, LayoutDashboard, ChevronDown } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface GlobalEntry {
  userId:     string;
  username:   string;
  avatarId:   string;
  totalScore: number;
  totalGames: number;
  bestStreak: number;
}

interface TopicEntry {
  userId:        string;
  username:      string;
  avatarId:      string;
  totalAnswered: number;
  totalCorrect:  number;
  accuracy:      number;
}

// ── Rank display ───────────────────────────────────────────────────────────────

function RankCell({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-yellow-400 font-display font-black text-lg">🥇</span>;
  if (rank === 2) return <span className="text-slate-300 font-display font-black text-lg">🥈</span>;
  if (rank === 3) return <span className="text-amber-500 font-display font-black text-lg">🥉</span>;
  return <span className="text-white/30 font-display font-bold text-sm w-6 text-center">{rank}</span>;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function GlobalLeaderboard({ currentUserId }: { currentUserId?: string }) {
  const [rows, setRows] = useState<GlobalEntry[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    fetch("/api/leaderboard/global")
      .then(r => r.json())
      .then(d => setRows(d.leaderboard ?? []))
      .catch(console.error)
      .finally(() => setBusy(false));
  }, []);

  if (busy) {
    return <div className="flex justify-center py-16 text-white/30 text-sm">Loading…</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-16 text-white/30">
        <Globe className="w-10 h-10 mx-auto mb-3 opacity-20" />
        <p className="text-sm font-semibold">No ranked players yet</p>
        <p className="text-xs mt-1">Play a few games to appear here!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((entry, i) => {
        const isMe = entry.userId === currentUserId;
        return (
          <motion.div
            key={entry.userId}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors ${
              isMe
                ? "bg-teal-500/15 border border-teal-400/30"
                : i < 3
                  ? "bg-white/8"
                  : "bg-white/5 hover:bg-white/8"
            }`}
          >
            <div className="w-7 flex items-center justify-center flex-shrink-0">
              <RankCell rank={i + 1} />
            </div>
            <Avatar avatarId={entry.avatarId} mood="idle" streak={0} isLeader={i === 0} size={36} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={`font-semibold text-sm truncate ${isMe ? "text-teal-300" : "text-white"}`}>
                  {entry.username}
                </span>
                {isMe && <span className="text-[10px] text-teal-400 font-bold flex-shrink-0">(you)</span>}
              </div>
              <div className="text-white/30 text-xs">{entry.totalGames} games · {entry.bestStreak}🔥 best streak</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className={`font-mono font-black text-base ${i === 0 ? "text-yellow-400" : "text-white"}`}>
                {entry.totalScore.toLocaleString()}
              </div>
              <div className="text-white/30 text-[10px]">pts total</div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function TopicLeaderboard({ topic, currentUserId }: { topic: string; currentUserId?: string }) {
  const [rows, setBusy_rows] = useState<TopicEntry[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    setBusy(true);
    fetch(`/api/leaderboard/topic/${encodeURIComponent(topic)}`)
      .then(r => r.json())
      .then(d => setBusy_rows(d.leaderboard ?? []))
      .catch(console.error)
      .finally(() => setBusy(false));
  }, [topic]);

  if (busy) {
    return <div className="flex justify-center py-16 text-white/30 text-sm">Loading…</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-white/30">
        <p className="text-sm">Not enough data for this topic yet.</p>
        <p className="text-xs mt-1">At least 5 questions must be answered by a player.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((entry, i) => {
        const isMe = entry.userId === currentUserId;
        const color =
          entry.accuracy >= 80 ? "text-teal-400"
          : entry.accuracy >= 60 ? "text-yellow-400"
          : "text-red-400";

        return (
          <motion.div
            key={entry.userId}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors ${
              isMe ? "bg-teal-500/15 border border-teal-400/30" : "bg-white/5 hover:bg-white/8"
            }`}
          >
            <div className="w-7 flex items-center justify-center flex-shrink-0">
              <RankCell rank={i + 1} />
            </div>
            <Avatar avatarId={entry.avatarId} mood="idle" streak={0} isLeader={i === 0} size={36} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={`font-semibold text-sm truncate ${isMe ? "text-teal-300" : "text-white"}`}>
                  {entry.username}
                </span>
                {isMe && <span className="text-[10px] text-teal-400 font-bold flex-shrink-0">(you)</span>}
              </div>
              <div className="text-white/30 text-xs">{entry.totalAnswered} answered</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className={`font-mono font-black text-base ${color}`}>{entry.accuracy}%</div>
              <div className="text-white/30 text-[10px]">{entry.totalCorrect}/{entry.totalAnswered}</div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function Leaderboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const [activeTab,    setActiveTab]    = useState<"global" | string>("global");
  const [topicList,    setTopicList]    = useState<string[]>([]);
  const [showTopicDrop, setShowTopicDrop] = useState(false);

  useEffect(() => {
    fetch("/api/leaderboard/topics")
      .then(r => r.json())
      .then(d => setTopicList(d.topics ?? []))
      .catch(console.error);
  }, []);

  const selectedTopicLabel = activeTab === "global" ? null : activeTab;

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

          <div className="flex items-center gap-2 flex-1">
            <Trophy className="w-5 h-5 text-yellow-400" />
            <h1 className="text-xl font-display font-black text-white">Leaderboard</h1>
          </div>

          {user && (
            <button
              onClick={() => setLocation("/dashboard")}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-panel text-teal-400 hover:text-teal-300 text-xs font-semibold transition-colors border border-teal-400/20"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />Dashboard
            </button>
          )}
        </motion.div>

        {/* Tab bar */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-center gap-2 mb-5 flex-wrap"
        >
          {/* Global tab */}
          <button
            onClick={() => setActiveTab("global")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === "global"
                ? "bg-teal-500/20 border border-teal-400/40 text-teal-300"
                : "glass-panel text-white/50 hover:text-white"
            }`}
          >
            <Globe className="w-3.5 h-3.5" />Global
          </button>

          {/* Topic dropdown */}
          {topicList.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowTopicDrop(v => !v)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  activeTab !== "global"
                    ? "bg-teal-500/20 border border-teal-400/40 text-teal-300"
                    : "glass-panel text-white/50 hover:text-white"
                }`}
              >
                {selectedTopicLabel ?? "By Topic"}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showTopicDrop ? "rotate-180" : ""}`} />
              </button>

              <AnimatePresence>
                {showTopicDrop && (
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full mt-1 left-0 z-50 glass-panel-heavy rounded-2xl overflow-hidden shadow-2xl border border-white/10 min-w-[180px] max-h-64 overflow-y-auto"
                  >
                    {topicList.map(t => (
                      <button
                        key={t}
                        onClick={() => { setActiveTab(t); setShowTopicDrop(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors hover:bg-teal-500/10 ${
                          activeTab === t ? "text-teal-300 bg-teal-500/10" : "text-white/70"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </motion.div>

        {/* Content panel */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="glass-panel rounded-2xl p-4"
        >
          {activeTab === "global" ? (
            <>
              <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />Top 50 — All Time Score
              </h2>
              <GlobalLeaderboard currentUserId={user?.id} />
            </>
          ) : (
            <>
              <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5" />{activeTab} — Best Accuracy
              </h2>
              <TopicLeaderboard topic={activeTab} currentUserId={user?.id} />
            </>
          )}
        </motion.div>

        <p className="text-center text-white/20 text-[10px] mt-4">
          Topic leaderboards require at least 5 answered questions per player.
        </p>
      </div>
    </div>
  );
}
