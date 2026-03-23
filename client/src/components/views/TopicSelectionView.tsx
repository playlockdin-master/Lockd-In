import { Room, Player } from "@shared/schema";
import { Card } from "../Card";
import { Button } from "../Button";
import { Input } from "../Input";
import { Timer } from "../Timer";
import { Avatar } from "../Avatar";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Search, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { useAudioSystem } from "@/hooks/use-audio";

interface Props {
  room: Room;
  me: Player;
  onSelectTopic: (topic: string, difficulty?: 'Easy' | 'Medium' | 'Hard') => void;
  error: string | null;
  onClearError: () => void;
  topicRejection: { badTopic: string; reason: string; newTopic: string } | null;
  topicSuggestions: string[];
  loadingSuggestions: boolean;
  onRequestSuggestions: () => void;
}

// Simple broad topics — used as instant fallback before AI suggestions load.
// Keep in sync with TOPIC_DATASET in server/ai.ts.
const FALLBACK_TOPICS = [
  "Vikings", "Chess", "Sharks", "Volcanoes", "Ramen",
  "Pirates", "Jazz", "Greek Mythology", "Robotics", "Dinosaurs",
  "Reggae", "Samurai", "Sushi", "Cryptography", "Penguins",
  "Dragons", "Formula 1", "Black Holes", "Chocolate", "Archaeology",
];

export function TopicSelectionView({ room, me, onSelectTopic, error, onClearError, topicRejection, topicSuggestions, loadingSuggestions, onRequestSuggestions }: Props) {
  const [topic, setTopic] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard' | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const { playSound } = useAudioSystem();
  const hasFetchedRef = useRef(false);
  // Disable repeat:Infinity Framer Motion animations for users who prefer reduced motion —
  // they run on the JS thread at 60fps and cause thermal throttling on mid-range devices.
  const reduceMotion = useReducedMotion();

  const isMyTurn = room.topicSelectorId === me.id;
  const selector = room.players.find(p => p.id === room.topicSelectorId);
  const isLoadingQuestion = !!room.currentTopic;

  // Reset suggestion fetch guard and collapse panel whenever selector changes
  useEffect(() => {
    hasFetchedRef.current = false;
    setShowSuggestions(false);
  }, [room.topicSelectorId]);

  // Reset submitting flag if topic selection restarts (e.g. AI fail)
  useEffect(() => {
    if (!isLoadingQuestion) setSubmitting(false);
  }, [isLoadingQuestion]);

  // Delay autoFocus on touch devices to prevent iOS keyboard pushing timer off-screen
  useEffect(() => {
    if (!isMyTurn || isLoadingQuestion) return;
    const isTouchDevice = navigator.maxTouchPoints > 0;
    if (isTouchDevice) {
      const t = setTimeout(() => inputRef.current?.focus(), 350);
      return () => clearTimeout(t);
    } else {
      inputRef.current?.focus();
    }
  }, [isMyTurn, isLoadingQuestion]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!topic.trim() || !isMyTurn || submitting) return;
    setSubmitting(true);
    playSound('click');
    onSelectTopic(topic.trim(), difficulty);
  };

  const handleChipClick = (suggestion: string) => {
    playSound('click');
    setTopic(suggestion);
    onClearError();
    inputRef.current?.focus();
  };

  const handleToggleSuggestions = () => {
    const next = !showSuggestions;
    setShowSuggestions(next);
    playSound('click');
    // Fetch AI suggestions lazily — only the first time the panel is opened
    if (next && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      onRequestSuggestions();
    }
  };

  // Show AI suggestions if loaded, otherwise the simple fallback list
  const displayChips = topicSuggestions.length > 0 ? topicSuggestions : FALLBACK_TOPICS;

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center pb-6 px-1">

      {/* Round announcement */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-3 px-4 py-1 rounded-full glass-panel text-xs font-semibold text-white/60 tracking-widest uppercase"
      >
        Round {room.currentRound}
        {room.mode === 'round' ? ` of ${room.target}` : ''}
      </motion.div>

      {!isLoadingQuestion && (
        <div className="mb-4 md:mb-8">
          <Timer deadline={room.topicDeadline!} totalTime={room.topicTimeSecs ?? 25} />
        </div>
      )}

      {/* Turn indicator */}
      <div className="mb-4 md:mb-8 w-full text-center">
        <div className="inline-block px-4 py-2 rounded-full glass-panel border border-primary/30">
          <p className="text-sm text-white/70">
            {isMyTurn ? (
              <span className="text-primary font-semibold inline-flex items-center gap-1.5">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 inline" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.5"/>
                  <circle cx="8" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.75"/>
                  <circle cx="8" cy="8" r="1.75" fill="currentColor"/>
                </svg>
                Your turn to pick a topic
              </span>
            ) : (
              <span>
                <span className="text-primary font-semibold">{selector?.name}</span>
                <span className="text-white/70"> is choosing...</span>
              </span>
            )}
          </p>
        </div>
      </div>

      <AnimatePresence mode="wait">

        {/* — AI generating question — */}
        {isLoadingQuestion && (
          <motion.div
            key="loading"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full"
          >
            <Card className="text-center w-full py-10">
              <AnimatePresence>
                {topicRejection && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mb-6 mx-2 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/40 text-left"
                  >
                    <p className="text-destructive font-semibold text-sm mb-1 flex items-center gap-1.5">
                      <svg viewBox="0 0 16 16" className="w-4 h-4 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none">
                        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                        <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      Can't make a trivia question from <span className="italic">"{topicRejection.badTopic}"</span>
                    </p>
                    <p className="text-white/50 text-xs mb-2">{topicRejection.reason}</p>
                    <p className="text-white/70 text-xs flex items-center gap-1.5">
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none">
                        <path d="M2 5h8l-2-2M10 5l2 2M2 11h8l-2-2M10 11l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Switching to: <span className="text-primary font-bold">{topicRejection.newTopic}</span>
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

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
                  <Sparkles className="w-full h-full text-primary" />
                </motion.div>
              </div>

              <motion.h2
                className="text-xl md:text-2xl font-display font-bold text-white mb-1"
                animate={reduceMotion ? {} : { opacity: [1, 0.7, 1] }}
                transition={{ duration: 2, repeat: reduceMotion ? 0 : Infinity }}
              >
                Locking in your question...
              </motion.h2>
              <motion.p
                className="text-white/40 text-sm md:text-base mb-4 italic inline-flex items-center gap-1.5"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <svg viewBox="0 0 16 16" className="w-4 h-4 flex-shrink-0 not-italic" xmlns="http://www.w3.org/2000/svg" fill="none">
                  <path d="M9 2L4 9h5l-2 5 7-8H9l1-4z" fill="currentColor" opacity="0.7" stroke="currentColor" strokeWidth="0.5" strokeLinejoin="round"/>
                </svg>
                AI is on it — faster than you can say "I knew that"
              </motion.p>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/30 mt-1">
                <span className="text-white/50 text-sm">Topic:</span>
                <span className="text-primary font-bold text-sm md:text-base">{room.currentTopic}</span>
              </div>
              <div className="relative w-48 h-1 mx-auto mt-6 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent"
                  animate={reduceMotion ? {} : { x: ['-100%', '400%'] }}
                  transition={{ duration: 1.2, repeat: reduceMotion ? 0 : Infinity, ease: 'easeInOut' }}
                />
              </div>
            </Card>
          </motion.div>
        )}

        {/* — My turn to pick — */}
        {!isLoadingQuestion && isMyTurn && (
          <motion.div key="my-turn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full">
            <Card className="w-full border-primary/50 border-2">
              <h2 className="text-2xl md:text-3xl font-display font-bold text-primary mb-1 text-center">
                <span className="inline-flex items-center gap-2">
                  <svg viewBox="0 0 24 24" className="w-7 h-7 inline" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4"/>
                    <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.65"/>
                    <circle cx="12" cy="12" r="2.5" fill="currentColor"/>
                    <line x1="12" y1="2" x2="12" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="2" y1="12" x2="6" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="18" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Your Turn!
                </span>
              </h2>
              <p className="text-sm md:text-base text-white/50 mb-5 text-center">Name any subject — AI will craft the perfect question!</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  ref={inputRef}
                  value={topic}
                  onChange={(e) => { setTopic(e.target.value); onClearError(); }}
                  placeholder="e.g. Physics, World History, Space Exploration..."
                  icon={<Search className="w-5 h-5" />}
                  className="text-base md:text-lg py-3 md:py-4"
                  maxLength={60}
                />

                <AnimatePresence>
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-destructive text-sm font-medium text-center"
                    >
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>

                {/* Difficulty selector */}
                <div className="space-y-2">
                  <p className="text-xs text-white/40 text-center font-medium uppercase tracking-widest">Difficulty <span className="normal-case text-white/25">(optional)</span></p>
                  <div className="flex gap-2 justify-center">
                    {(['Easy', 'Medium', 'Hard'] as const).map((d) => {
                      const checked = difficulty === d;
                      const colors = {
                        Easy:   { ring: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-400', dot: 'bg-emerald-400' },
                        Medium: { ring: 'border-amber-500/60  bg-amber-500/10  text-amber-400',   dot: 'bg-amber-400'   },
                        Hard:   { ring: 'border-rose-500/60   bg-rose-500/10   text-rose-400',     dot: 'bg-rose-400'   },
                      }[d];
                      return (
                        <motion.button
                          key={d}
                          type="button"
                          whileTap={{ scale: 0.95 }}
                          onClick={() => { setDifficulty(checked ? undefined : d); playSound('click'); }}
                          className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-semibold transition-all select-none
                            ${checked ? colors.ring : 'border-white/10 bg-white/5 text-white/40 hover:border-white/20 hover:text-white/60'}`}
                        >
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${checked ? colors.dot : 'bg-white/20'}`} />
                          {d}
                        </motion.button>
                      );
                    })}
                  </div>
                  {difficulty && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-xs text-center text-white/30"
                    >
                      AI will aim for a <span className="text-white/50 font-medium">{difficulty}</span> question
                    </motion.p>
                  )}
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  disabled={!topic.trim() || submitting}
                >
                  {submitting ? 'Locking In...' : 'Lock In Topic'}
                </Button>
              </form>

              {/* Collapsible suggestions — hidden by default so the input is the focus */}
              <div className="mt-5 border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={handleToggleSuggestions}
                  className="flex items-center gap-1.5 mx-auto text-xs text-white/40 hover:text-white/70 transition-colors font-medium select-none"
                >
                  {showSuggestions
                    ? <><ChevronUp className="w-3.5 h-3.5" />Hide suggestions</>
                    : <><ChevronDown className="w-3.5 h-3.5" />Need ideas? Show suggestions</>
                  }
                  {loadingSuggestions && showSuggestions && (
                    <motion.div
                      animate={reduceMotion ? {} : { rotate: 360 }}
                      transition={{ duration: 1, repeat: reduceMotion ? 0 : Infinity, ease: "linear" }}
                      className="w-3 h-3 border border-white/30 border-t-white/70 rounded-full ml-1"
                    />
                  )}
                </button>

                <AnimatePresence>
                  {showSuggestions && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-3 flex flex-wrap gap-2 justify-center">
                        {loadingSuggestions && topicSuggestions.length === 0
                          ? [90, 110, 80, 100, 70, 95].map((w, i) => (
                              <div key={i} className="h-8 rounded-full bg-white/5 animate-pulse" style={{ width: w }} />
                            ))
                          : displayChips.map((s, i) => (
                              <motion.button
                                key={s}
                                type="button"
                                initial={{ opacity: 0, scale: 0.85 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.025 }}
                                onClick={() => handleChipClick(s)}
                                disabled={submitting}
                                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all
                                  ${topic === s
                                    ? 'bg-primary/20 border-primary text-primary'
                                    : 'bg-white/5 border-white/10 text-white/60 hover:border-primary/40 hover:text-white/90 hover:bg-primary/10'
                                  }`}
                              >
                                {s}
                              </motion.button>
                            ))
                        }
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

            </Card>
          </motion.div>
        )}

        {/* — Waiting for someone else to pick — */}
        {!isLoadingQuestion && !isMyTurn && (
          <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full">
            <Card className="text-center w-full">
              <motion.div
                animate={reduceMotion ? {} : { scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: reduceMotion ? 0 : Infinity }}
                className="flex justify-center mb-4 md:mb-6"
              >
                <Avatar avatarId={selector?.avatarId ?? 'ghost'} mood="idle" size={64} />
              </motion.div>
              <h2 className="text-xl md:text-2xl font-display font-bold text-white mb-2">
                {selector?.name} is choosing...
              </h2>
              <p className="text-sm md:text-base text-white/50">Get ready for anything.</p>
            </Card>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
