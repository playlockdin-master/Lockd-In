import { Room, Player } from "@shared/schema";
import { Card } from "../Card";
import { Timer } from "../Timer";
import { Avatar } from "../Avatar";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useState, useEffect } from "react";
import { useAudioSystem } from "@/hooks/use-audio";
import { CheckCircle, CheckCircle2, XCircle, TrendingUp, TrendingDown, Minus, Zap, Eye } from "lucide-react";

interface Props {
  room: Room;
  me: Player;
  onSubmitAnswer: (index: number) => void;
  topicRejection?: { badTopic: string; reason: string; newTopic: string } | null;
}

export function QuestionView({ room, me, onSubmitAnswer, topicRejection }: Props) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const { playSound } = useAudioSystem();
  // Respect prefers-reduced-motion — Framer Motion's repeat:Infinity
  // animations run on the JS thread via rAF at 60fps, which causes thermal throttling
  // on mid-range Android. Gate all infinite spinner animations behind this hook.
  const reduceMotion = useReducedMotion();

  const question = room.currentQuestion;
  const myRoomAnswer = room.answers[me.id];
  const isLateJoiner = myRoomAnswer?.answerIndex === -2; // -2 = joined mid-round (server sentinel); -1 = timed out
  const hasAnswered = isLateJoiner ? false : (selectedIdx !== null || myRoomAnswer !== undefined);
  const myAnswerIdx = isLateJoiner ? null : (selectedIdx ?? myRoomAnswer?.answerIndex ?? null);
  const revealAnswer = room.status === 'results';
  // For the answer count progress bar, only count real answers (not late-joiner sentinels)
  const answerCount = Object.values(room.answers).filter(a => a.answerIndex >= 0).length;

  const handleSelect = (idx: number) => {
    if (hasAnswered || isLateJoiner) return;
    setSelectedIdx(idx);
    playSound('click');
    onSubmitAnswer(idx);
  };

  useEffect(() => {
    setSelectedIdx(null);
  }, [room.currentQuestion?.text]);

  if (!question) return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center pb-6 px-1 pt-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full"
      >
        <Card className="text-center w-full py-10">
          {/* Topic rejection banner — shown when AI couldn't use the submitted topic */}
          <AnimatePresence>
            {topicRejection && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mb-6 mx-auto max-w-xs rounded-2xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-left"
              >
                <p className="text-red-300 font-semibold text-sm mb-1">
                  ❌ Can't use <span className="italic">"{topicRejection.badTopic}"</span>
                </p>
                <p className="text-white/50 text-xs mb-2">{topicRejection.reason}</p>
                <p className="text-white/70 text-xs">
                  🎲 Switching to: <span className="text-primary font-bold">{topicRejection.newTopic}</span>
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Animated pulse rings */}
          <div className="relative w-20 h-20 mx-auto mb-6 flex items-center justify-center">
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                className="absolute rounded-full border border-primary/40"
                style={{ width: 32 + i * 22, height: 32 + i * 22 }}
                animate={reduceMotion ? {} : { scale: [1, 1.15, 1], opacity: [0.6, 0.15, 0.6] }}
                transition={{ duration: 1.6, repeat: reduceMotion ? 0 : Infinity, delay: i * 0.3, ease: 'easeInOut' }}
              />
            ))}
            <motion.div
              animate={reduceMotion ? {} : { rotate: 360 }}
              transition={{ duration: 1.2, repeat: reduceMotion ? 0 : Infinity, ease: "linear" }}
              className="w-10 h-10 relative z-10"
            >
              <svg className="w-full h-full text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </motion.div>
          </div>

          <motion.h2
            className="text-xl md:text-2xl font-display font-bold text-white mb-1"
            animate={reduceMotion ? {} : { opacity: [1, 0.7, 1] }}
            transition={{ duration: 2, repeat: reduceMotion ? 0 : Infinity }}
          >
            {topicRejection ? 'Finding a better topic…' : 'Locking in your question...'}
          </motion.h2>

          <motion.p
            className="text-white/40 text-sm md:text-base mb-4 italic flex items-center justify-center gap-1.5"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Zap className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
            AI is on it — faster than you can say "I knew that"
          </motion.p>

          {room.currentTopic && (
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/30 mt-1">
              <span className="text-white/50 text-sm">Topic:</span>
              <span className="text-primary font-bold text-sm md:text-base">{room.currentTopic}</span>
            </div>
          )}

          {/* Scanning line */}
          <div className="relative w-48 h-1 mx-auto mt-6 rounded-full bg-white/10 overflow-hidden">
            <motion.div
              className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent"
              animate={reduceMotion ? {} : { x: ['-100%', '400%'] }}
              transition={{ duration: 1.2, repeat: reduceMotion ? 0 : Infinity, ease: 'easeInOut' }}
            />
          </div>
        </Card>
      </motion.div>
    </div>
  );

  const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);
  const myRank = sortedPlayers.findIndex(p => p.id === me.id) + 1;
  const leader = sortedPlayers[0];
  const ptsBehind = myRank > 1 && leader ? leader.score - me.score : 0;
  const allTied = sortedPlayers.every(p => p.score === me.score);

  const difficultyColors = {
    Easy:   "text-green-400 bg-green-400/10 border-green-400/20",
    Medium: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
    Hard:   "text-red-400 bg-red-400/10 border-red-400/20",
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-2 md:gap-4">

      {/* Mini leaderboard - horizontal scroll on mobile */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-2 px-2" style={{ scrollbarWidth: 'none' }}>
        {sortedPlayers.slice(0, 5).map((p, idx) => (
          <motion.div
            key={p.id}
            layout
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border shrink-0 text-xs font-bold ${
              idx === 0
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-200'
                : p.id === me.id
                  ? 'bg-primary/20 border-primary/40 text-white'
                  : 'bg-white/5 border-white/10 text-white/70'
            }`}
          >
            <Avatar avatarId={p.avatarId ?? 'ghost'} size={20} mood="idle" />
            <span className="max-w-[56px] truncate">{p.id === me.id ? 'You' : p.name}</span>
            {!p.isConnected
              ? <span className="text-[9px] text-yellow-400/80 animate-pulse">↺</span>
              : <span className="font-mono">{p.score}</span>
            }
          </motion.div>
        ))}
      </div>

      {/* Meta row — wraps on very small screens */}
      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium glass-panel min-w-0 max-w-[160px]">
          <span className="text-white/50 shrink-0">Topic:</span>
          <span className="text-primary font-bold truncate">{room.currentTopic}</span>
        </span>
        <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold border shrink-0 ${difficultyColors[question.difficulty]}`}>
          {question.difficulty}
        </span>
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border shrink-0 ${
          myRank === 1 ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300' : 'bg-white/5 border-white/10 text-white/50'
        }`}>
          {allTied ? <><Minus className="w-3 h-3" />Tied</>
            : myRank === 1 ? <><TrendingUp className="w-3 h-3" />#1</>
            : <><TrendingDown className="w-3 h-3" />#{myRank}</>}
        </span>
        <div className="ml-auto shrink-0">
          <Timer deadline={room.questionDeadline!} totalTime={room.questionTimeSecs ?? 25} />
        </div>
      </div>

      {/* Score mode: progress bar toward target, turns red when close */}
      {room.mode === 'score' && (() => {
        const leaderScore = Math.max(0, ...room.players.map(p => p.score));
        const pct = Math.min(100, Math.round((leaderScore / room.target) * 100));
        const isClose = pct >= 80;
        return (
          <div className="w-full flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${isClose ? 'bg-red-400' : 'bg-primary'}`}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <span className={`text-[10px] font-bold shrink-0 flex items-center gap-0.5 ${isClose ? 'text-red-400' : 'text-white/40'}`}>
              {isClose && <Zap className="w-2.5 h-2.5 fill-current" />}{leaderScore}/{room.target}
            </span>
          </div>
        );
      })()}

      {/* Question card */}
      <Card className="w-full relative p-3 md:p-6">
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-white/10 rounded-t-3xl overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-primary to-accent"
            animate={{ width: `${(answerCount / room.players.length) * 100}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>

        <motion.h2
          className="text-sm md:text-2xl font-display font-bold text-white mb-3 md:mb-5 leading-snug pt-2"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {question.text}
        </motion.h2>

        <div className="grid grid-cols-2 gap-2 md:gap-3">
          {question.options.map((opt, idx) => {
            const isSelected = myAnswerIdx === idx;
            const isCorrect  = idx === question.correctIndex;

            let stateClass = 'bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/30';
            if (revealAnswer) {
              if (isCorrect)                     stateClass = 'bg-success/20 border-2 border-success';
              else if (isSelected && !isCorrect) stateClass = 'bg-destructive/20 border-2 border-destructive';
              else                               stateClass = 'bg-white/5 border border-white/5 opacity-40';
            } else if (isSelected) {
              stateClass = 'bg-primary/20 border-2 border-primary box-glow';
            }

            return (
              <motion.button
                key={idx}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.07 }}
                onClick={() => handleSelect(idx)}
                disabled={hasAnswered || isLateJoiner}
                className={`relative p-2.5 md:p-4 rounded-xl text-left transition-all duration-200 overflow-hidden min-h-[54px] md:min-h-[72px] active:scale-[0.97] ${stateClass}`}
              >
                <div className="flex items-start gap-2">
                  <div className={`w-5 h-5 md:w-7 md:h-7 rounded-full flex items-center justify-center font-bold shrink-0 text-[10px] md:text-sm mt-0.5 ${
                    revealAnswer && isCorrect                  ? 'bg-success text-white'
                    : revealAnswer && isSelected && !isCorrect ? 'bg-destructive text-white'
                    : isSelected                               ? 'bg-primary text-white'
                    :                                            'bg-white/10 text-white/50'
                  }`}>
                    {['A','B','C','D'][idx]}
                  </div>
                  <span className={`text-[11px] md:text-base font-medium leading-snug flex-1 ${
                    revealAnswer && isCorrect                  ? 'text-white'
                    : revealAnswer && isSelected && !isCorrect ? 'text-white/80'
                    : revealAnswer                             ? 'text-white/40'
                    : isSelected                               ? 'text-white'
                    :                                            'text-white/80'
                  }`}>
                    {opt}
                  </span>
                  <AnimatePresence>
                    {revealAnswer && isCorrect && (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="shrink-0 mt-0.5">
                        <CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4 text-success" />
                      </motion.span>
                    )}
                    {revealAnswer && isSelected && !isCorrect && (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="shrink-0 mt-0.5">
                        <XCircle className="w-3.5 h-3.5 md:w-4 md:h-4 text-destructive" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </motion.button>
            );
          })}
        </div>

        <AnimatePresence>
          {hasAnswered && !revealAnswer && (
            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-center text-white/40 text-xs mt-3"
            >
              Locked in! Waiting for others…
            </motion.p>
          )}
          {isLateJoiner && !revealAnswer && (
            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-center text-yellow-400/70 text-xs mt-3"
            >
              👀 You joined mid-round — observing this question
            </motion.p>
          )}
          {revealAnswer && (
            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-center text-white/30 text-xs mt-3"
            >
              Next round loading…
            </motion.p>
          )}
        </AnimatePresence>
      </Card>

      {/* Live player status */}
      <div className="flex flex-wrap gap-1.5 justify-center pb-1">
        {room.players.map(p => {
          const answered = room.answers[p.id] !== undefined && room.answers[p.id].answerIndex >= 0;
          const isObserver = room.answers[p.id]?.answerIndex === -2; // -2 = late joiner sentinel
          return (
            <motion.div
              key={p.id}
              layout
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                answered ? 'bg-white/15 text-white' : isObserver ? 'bg-yellow-500/10 text-yellow-300/60' : 'bg-white/5 text-white/40'
              }`}
            >
              {answered
                ? <CheckCircle className="w-3 h-3 text-green-400 shrink-0" />
                : isObserver
                  ? <Eye className="w-3 h-3 text-yellow-400/70 shrink-0" />
                  : <span className="w-2.5 h-2.5 rounded-full border border-white/30 shrink-0 animate-pulse" />
              }
              <span className="truncate max-w-[60px]">{p.id === me.id ? 'You' : p.name}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
