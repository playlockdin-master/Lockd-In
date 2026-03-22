import { Room, Player, TOPIC_TIME_MIN, TOPIC_TIME_MAX, QUESTION_TIME_MIN, QUESTION_TIME_MAX, REGIONS, RegionId } from "@shared/schema";
import { Card } from "../Card";
import { Button } from "../Button";
import { Avatar, AvatarPicker } from "../Avatar";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Users, Crown, CheckCircle2, Share2, Pencil, Globe, MapPin, BookOpen, Plus, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useAudioSystem } from "@/hooks/use-audio";

interface Props {
  room: Room;
  me: Player;
  onReady: (isReady: boolean) => void;
  onStart: (mode: 'round' | 'score', target: number, topicTimeSecs: number, questionTimeSecs: number, regionMode?: 'global' | 'regional', regionId?: RegionId, countryCode?: string) => void;
  onUpdateSettings: (mode: 'round' | 'score', target: number, topicTimeSecs: number, questionTimeSecs: number, regionMode?: 'global' | 'regional', regionId?: RegionId, countryCode?: string) => void;
  onUpdateTopicMode?: (topicMode: 'live' | 'preset') => void;
  onSubmitPresetTopics?: (topics: { topic: string; difficulty: 'Easy' | 'Medium' | 'Hard' }[]) => void;
  onUpdateAvatar?: (avatarId: string) => void;
  onKickPlayer?: (targetId: string) => void;
}

export function LobbyView({ room, me, onReady, onStart, onUpdateSettings, onUpdateAvatar, onKickPlayer, onUpdateTopicMode, onSubmitPresetTopics }: Props) {
  const [copied, setCopied] = useState(false);
  const [changingAvatar, setChangingAvatar] = useState(false);
  const { playSound } = useAudioSystem();

  const mode   = room.mode;
  const target = room.target;
  const topicTimeSecs    = room.topicTimeSecs    ?? 25;
  const questionTimeSecs = room.questionTimeSecs ?? 25;

  const [localTopicTime,    setLocalTopicTime]    = useState(topicTimeSecs);
  const [localQuestionTime, setLocalQuestionTime] = useState(questionTimeSecs);
  const [localRegionMode,   setLocalRegionMode]   = useState<'global' | 'regional'>(room.regionMode ?? 'global');
  const [localRegionId,     setLocalRegionId]     = useState<RegionId | undefined>(room.regionId);
  const [localCountryCode,  setLocalCountryCode]  = useState<string | undefined>(room.countryCode);

  type PresetEntry = { topic: string; difficulty: 'Easy' | 'Medium' | 'Hard' };
  const [presetTopicInput, setPresetTopicInput] = useState('');
  const [presetDifficulty, setPresetDifficulty] = useState<'Easy' | 'Medium' | 'Hard' | 'Random'>('Random');
  const [presetTopicsLocal, setPresetTopicsLocal] = useState<PresetEntry[]>([]);

  const mySubmittedTopics: PresetEntry[] = (room.presetTopics ?? {})[me.id] ?? [];
  // isPresetMode defined below in clean mode logic section
  // Host must submit ≥1; others have submitted if their id is in presetTopics (even empty array)
  const allPlayersReady = room.players.every(p => {
    const submitted = room.presetTopics?.[p.id];
    if (p.isHost) return submitted !== undefined && submitted.length > 0;
    return submitted !== undefined; // non-host just needs to have responded (can be empty)
  });

  const handleAddPresetTopic = () => {
    const trimmed = presetTopicInput.trim();
    if (!trimmed || presetTopicsLocal.length >= 5) return;
    const diff = presetDifficulty === 'Random' ? (['Easy', 'Medium', 'Hard'] as const)[Math.floor(Math.random() * 3)] : presetDifficulty;
    setPresetTopicsLocal(prev => [...prev, { topic: trimmed, difficulty: diff }]);
    setPresetTopicInput('');
  };
  const handleRemovePresetTopic = (i: number) => {
    setPresetTopicsLocal(prev => prev.filter((_, idx) => idx !== i));
  };
  const handleSubmitPresetTopics = () => {
    if (me.isHost && presetTopicsLocal.length === 0) return;
    onSubmitPresetTopics?.(presetTopicsLocal);
    playSound('click');
  };
  const handleSkipPresetTopics = () => {
    // Non-host can skip — submits empty array to signal they're done
    onSubmitPresetTopics?.([]);
    playSound('click');
  };

  const prevTopicRef      = useRef(topicTimeSecs);
  const prevQuestionRef   = useRef(questionTimeSecs);

  useEffect(() => {
    if (topicTimeSecs !== prevTopicRef.current) { setLocalTopicTime(topicTimeSecs); prevTopicRef.current = topicTimeSecs; }
  }, [topicTimeSecs]);

  useEffect(() => {
    if (questionTimeSecs !== prevQuestionRef.current) { setLocalQuestionTime(questionTimeSecs); prevQuestionRef.current = questionTimeSecs; }
  }, [questionTimeSecs]);

  // Sync region state from server — fires whenever any region field changes,
  // including host switching regionId while staying in 'regional' mode.
  useEffect(() => {
    setLocalRegionMode(room.regionMode ?? 'global');
    setLocalRegionId(room.regionId);
    setLocalCountryCode(room.countryCode);
  }, [room.regionMode, room.regionId, room.countryCode]);

  const allReady       = room.players.every(p => p.isReady);
  const settingsLocked = allReady;

  const prevIsHostRef = useRef(false);
  useEffect(() => {
    if (me.isHost && !me.isReady && !prevIsHostRef.current) onReady(true);
    prevIsHostRef.current = me.isHost;
  }, [me.isHost, me.isReady, onReady]);

  const topScore = room.players.length > 0 ? Math.max(...room.players.map(p => p.score)) : 0;
  const leaderId = topScore > 0 ? room.players.find(p => p.score === topScore)?.id : undefined;

  // Settings helpers
  const emit = (overrides: Partial<{ rm: 'global'|'regional'; ri: RegionId|undefined; cc: string|undefined; tt: number; qt: number; m: 'round'|'score'; t: number }> = {}) => {
    onUpdateSettings(
      overrides.m  ?? mode,
      overrides.t  ?? target,
      overrides.tt ?? localTopicTime,
      overrides.qt ?? localQuestionTime,
      overrides.rm ?? localRegionMode,
      overrides.ri !== undefined ? overrides.ri : localRegionId,
      overrides.cc !== undefined ? overrides.cc : localCountryCode,
    );
  };

  // ── Clean mode logic ──────────────────────────────────────────────────────
  // topicMode ('live' | 'preset') and mode ('round' | 'score') are fully independent.
  const isPresetMode = room.topicMode === 'preset';

  // Switching topic style — fires a dedicated event, never touches mode/target
  const handleTopicStyleChange = (style: 'live' | 'preset') => {
    onUpdateTopicMode?.(style);
    playSound('click');
  };

  // Switching win condition — always sends mode as 'round' or 'score', never 'preset'
  const handleModeChange = (wc: 'round' | 'score') => {
    emit({ m: wc, t: wc === 'score' ? 1000 : 10 });
    playSound('click');
  };

  const handleTargetChange = (t: number) => { emit({ t }); playSound('click'); };
  const handleTopicTimeChange    = (tt: number) => setLocalTopicTime(tt);
  const handleTopicTimeCommit    = (tt: number) => { emit({ tt }); playSound('click'); };
  const handleQuestionTimeChange = (qt: number) => setLocalQuestionTime(qt);
  const handleQuestionTimeCommit = (qt: number) => { emit({ qt }); playSound('click'); };

  const handleRegionModeChange = (rm: 'global'|'regional') => {
    setLocalRegionMode(rm);
    if (rm === 'global') { setLocalRegionId(undefined); setLocalCountryCode(undefined); emit({ rm, ri: undefined, cc: undefined }); }
    else emit({ rm });
    playSound('click');
  };

  const handleRegionIdChange = (ri: RegionId) => {
    setLocalRegionId(ri); setLocalCountryCode(undefined);
    emit({ rm: 'regional', ri, cc: undefined });
    playSound('click');
  };

  const handleCountryCodeChange = (cc: string|undefined) => {
    setLocalCountryCode(cc);
    emit({ rm: 'regional', ri: localRegionId, cc });
    playSound('click');
  };

  // Copy / share
  const fallbackCopy = (text: string) => {
    try { const el = document.createElement('textarea'); el.value = text; el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0'; document.body.appendChild(el); el.focus(); el.select(); document.execCommand('copy'); document.body.removeChild(el); } catch (_) {}
  };
  const handleCopy = () => {
    const text = room.code;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => fallbackCopy(text)); else fallbackCopy(text);
    setCopied(true); playSound('click'); setTimeout(() => setCopied(false), 2000);
  };
  const handleShare = () => {
    const url = `${window.location.origin}/room/${room.code}`;
    if (navigator.share) { navigator.share({ title: 'Join my Flooq room!', url }).catch(() => {}); }
    else { if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).catch(() => fallbackCopy(url)); else fallbackCopy(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    playSound('click');
  };

  const handleAvatarChange = (newId: string) => {
    sessionStorage.setItem('avatarId', newId);
    if (onUpdateAvatar) onUpdateAvatar(newId);
    setChangingAvatar(false);
  };

  const canStart = me.isHost && allReady && room.players.length > 1;
  // Extra guard: regional mode must have a region chosen before the game can start
  const regionIncomplete = localRegionMode === 'regional' && !localRegionId;
  const presetIncomplete = isPresetMode && !allPlayersReady;
  const canActuallyStart = canStart && !regionIncomplete && !presetIncomplete;

  // Read-only region label for non-host view
  const activeRegionDef  = REGIONS.find(r => r.id === room.regionId);
  const activeCountryDef = activeRegionDef?.countries.find(c => c.code === room.countryCode);
  const regionLabel = room.regionMode === 'regional' && activeRegionDef
    ? `${activeCountryDef ? activeCountryDef.flag : activeRegionDef.flag} ${activeCountryDef ? activeCountryDef.label : activeRegionDef.label}`
    : null;

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center pb-10">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mb-6 md:mb-8 text-center w-full">
        <h2 className="text-sm md:text-xl text-white/70 uppercase tracking-widest font-semibold mb-1 md:mb-2">Room Code</h2>
        <div onClick={handleCopy} className="text-3xl md:text-7xl font-display font-black tracking-widest text-white cursor-pointer hover:text-primary transition-colors flex items-center justify-center gap-2 md:gap-4 group">
          {room.code}
          <Copy className={`w-5 h-5 md:w-12 md:h-12 transition-all ${copied ? 'text-green-400' : 'text-white/20 group-hover:text-primary'}`} />
        </div>
        {copied && <p className="text-green-400 font-medium mt-1 text-sm">Copied!</p>}
        <button onClick={handleShare} className="mt-2 md:mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white/70 hover:text-white text-xs md:text-sm font-medium transition-all">
          <Share2 className="w-3.5 h-3.5 md:w-4 md:h-4" /> Share Invite Link
        </button>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 w-full">

        {/* Players */}
        <Card className="flex flex-col h-full">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-display font-bold text-white flex items-center gap-2"><Users className="w-6 h-6 text-primary" /> Players</h3>
            <span className="bg-white/10 px-3 py-1 rounded-full text-sm font-medium">{room.players.length} / 8</span>
          </div>

          {(room.viewingResultsIds ?? []).length > 0 && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/40 text-xs font-medium">
              <span className="text-sm">👀</span>
              {(room.viewingResultsIds ?? []).length === 1 ? '1 player is' : `${(room.viewingResultsIds ?? []).length} players are`} still viewing results
            </div>
          )}

          <div className="relative flex-1">
            <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
              {room.players.map((p) => {
                const isViewingResults = (room.viewingResultsIds ?? []).includes(p.id);
                return (
                  <motion.div key={p.id} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: isViewingResults ? 0.5 : 1 }}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-opacity ${isViewingResults ? 'bg-white/3 border-white/5' : 'bg-white/5 border-white/10'}`}>
                    <div className="flex items-center gap-3">
                      <Avatar avatarId={p.avatarId ?? 'ghost'} mood="idle" streak={p.streak} isLeader={p.id === leaderId} size={36} />
                      <span className={`text-base font-medium flex items-center gap-2 ${isViewingResults ? 'text-white/40' : 'text-white'}`}>
                        {p.name}
                        {p.isHost && <Crown className="w-4 h-4 text-yellow-400" />}
                        {p.id === me.id && <span className="text-xs bg-white/20 px-2 py-0.5 rounded text-white/70">You</span>}
                        {p.isReconnecting && <span className="text-[10px] text-yellow-400/70 font-normal italic animate-pulse">reconnecting…</span>}
                        {isViewingResults && <span className="text-[10px] text-white/30 font-normal italic">viewing results…</span>}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isViewingResults ? <div className="w-6 h-6 rounded-full border-2 border-white/10" />
                        : p.isReady ? <CheckCircle2 className="w-6 h-6 text-green-400" />
                        : <div className="w-6 h-6 rounded-full border-2 border-white/20" />}
                      {me.isHost && p.id !== me.id && room.status === 'lobby' && onKickPlayer && (
                        <button onClick={() => onKickPlayer(p.id)} title={`Kick ${p.name}`}
                          className="w-5 h-5 flex items-center justify-center rounded-full text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-colors text-xs font-bold leading-none">✕</button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
            {room.players.length > 4 && <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black/40 to-transparent rounded-b-xl" />}
          </div>

          <button onClick={() => setChangingAvatar(v => !v)} className="mt-4 flex items-center gap-2 text-xs text-white/40 hover:text-white/70 transition-colors self-start">
            <Pencil className="w-3 h-3" />{changingAvatar ? 'Cancel' : 'Change my character'}
          </button>
          <AnimatePresence>
            {changingAvatar && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mt-3">
                <AvatarPicker selected={me.avatarId ?? 'ghost'} onSelect={(id) => { handleAvatarChange(id); setChangingAvatar(false); }} />
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        {/* Settings */}
        <Card className="flex flex-col justify-between">
          <div>
            <h3 className="text-2xl font-display font-bold text-white mb-6">Game Settings</h3>

            {me.isHost ? (
              <div className="space-y-6">

                {/* Topic Style */}
                <div>
                  <label className="text-white/70 text-sm font-medium mb-2 block">How topics are chosen</label>
                  <div className="flex gap-2">
                    <button onClick={() => handleTopicStyleChange('live')} disabled={settingsLocked}
                      className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${!isPresetMode ? 'bg-primary/20 border-primary/60 text-white' : 'bg-white/5 border-white/10 text-white/50 hover:border-white/30 hover:text-white/80'}`}>
                      Live Topics
                    </button>
                    <button onClick={() => handleTopicStyleChange('preset')} disabled={settingsLocked}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${isPresetMode ? 'bg-primary/20 border-primary/60 text-white' : 'bg-white/5 border-white/10 text-white/50 hover:border-white/30 hover:text-white/80'}`}>
                      <BookOpen className="w-3.5 h-3.5" /> Preset Topics
                    </button>
                  </div>
                  <p className="text-white/25 text-xs mt-1.5 text-center">
                    {!isPresetMode ? 'Each player types a topic before every round' : 'Everyone submits topics upfront — no interruptions'}
                  </p>
                </div>

                {/* Win Condition */}
                <div>
                  <label className="text-white/70 text-sm font-medium mb-2 block">Win condition</label>
                  <div className="flex gap-2">
                    <Button variant={mode === 'round' ? 'primary' : 'outline'} className="flex-1" onClick={() => handleModeChange('round')} disabled={settingsLocked}>Rounds</Button>
                    <Button variant={mode === 'score' ? 'primary' : 'outline'} className="flex-1" onClick={() => handleModeChange('score')} disabled={settingsLocked}>Score Limit</Button>
                  </div>
                  {settingsLocked && <p className="text-white/30 text-xs mt-2 text-center">Settings locked — all players ready</p>}
                </div>

                {/* Target */}
                <div>
                  <label className="text-white/70 text-sm font-medium mb-2 block">{mode === 'round' ? 'Number of Rounds' : 'Target Score'}</label>
                  <div className="grid grid-cols-2 gap-2">
                    {mode === 'round' ? (
                      <>
                        <Button variant={target === 10 ? 'primary' : 'outline'} onClick={() => handleTargetChange(10)} disabled={settingsLocked}>10 Rounds</Button>
                        <Button variant={target === 20 ? 'primary' : 'outline'} onClick={() => handleTargetChange(20)} disabled={settingsLocked}>20 Rounds</Button>
                      </>
                    ) : (
                      <>
                        <Button variant={target === 1000 ? 'primary' : 'outline'} onClick={() => handleTargetChange(1000)} disabled={settingsLocked}>1000 Pts</Button>
                        <Button variant={target === 2000 ? 'primary' : 'outline'} onClick={() => handleTargetChange(2000)} disabled={settingsLocked}>2000 Pts</Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Timers */}
                <div className="space-y-4 pt-2 border-t border-white/10">
                  <p className="text-white/40 text-xs uppercase tracking-widest font-medium">Timers</p>
                  {!isPresetMode && <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-white/70 text-sm font-medium">Topic selection</label>
                      <span className="text-primary font-bold text-sm tabular-nums w-8 text-right">{localTopicTime}s</span>
                    </div>
                    <input type="range" min={TOPIC_TIME_MIN} max={TOPIC_TIME_MAX} step={5} value={localTopicTime} disabled={settingsLocked}
                      onChange={e => handleTopicTimeChange(Number(e.target.value))}
                      onMouseUp={e => handleTopicTimeCommit(Number((e.target as HTMLInputElement).value))}
                      onTouchEnd={e => handleTopicTimeCommit(Number((e.target as HTMLInputElement).value))}
                      className="w-full accent-primary disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed" />
                    <div className="flex justify-between text-white/20 text-xs mt-0.5"><span>{TOPIC_TIME_MIN}s</span><span>{TOPIC_TIME_MAX}s</span></div>
                  </div>}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-white/70 text-sm font-medium">Answer time</label>
                      <span className="text-primary font-bold text-sm tabular-nums w-8 text-right">{localQuestionTime}s</span>
                    </div>
                    <input type="range" min={QUESTION_TIME_MIN} max={QUESTION_TIME_MAX} step={5} value={localQuestionTime} disabled={settingsLocked}
                      onChange={e => handleQuestionTimeChange(Number(e.target.value))}
                      onMouseUp={e => handleQuestionTimeCommit(Number((e.target as HTMLInputElement).value))}
                      onTouchEnd={e => handleQuestionTimeCommit(Number((e.target as HTMLInputElement).value))}
                      className="w-full accent-primary disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed" />
                    <div className="flex justify-between text-white/20 text-xs mt-0.5"><span>{QUESTION_TIME_MIN}s</span><span>{QUESTION_TIME_MAX}s</span></div>
                  </div>
                </div>

                {/* ── Preset Topics (shown for all players when preset mode active) ── */}
                {isPresetMode && (
                  <div className="space-y-3 pt-2 border-t border-white/10">
                    <p className="text-white/40 text-xs uppercase tracking-widest font-medium">Your Topics</p>
                    <p className="text-white/40 text-xs">{me.isHost ? 'Add 1–5 topics (required). Choose difficulty per topic.' : 'Add up to 5 topics (optional). Skip if you have none.'}</p>

                    {mySubmittedTopics.length > 0 || room.presetTopics?.[me.id] !== undefined ? (
                      <div className="space-y-1.5">
                        {mySubmittedTopics.map((entry, i) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20 text-green-300 text-sm font-medium">
                            <span className="flex-1">{entry.topic}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-300">{entry.difficulty}</span>
                          </div>
                        ))}
                        {mySubmittedTopics.length === 0 && <p className="text-white/30 text-xs text-center">You skipped topic submission</p>}
                        <p className="text-green-400/60 text-xs text-center">✓ Submitted</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {presetTopicsLocal.map((entry, i) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm">
                            <span className="flex-1">{entry.topic}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/50">{entry.difficulty}</span>
                            <button onClick={() => handleRemovePresetTopic(i)} className="text-white/30 hover:text-white/70 transition-colors"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ))}
                        {presetTopicsLocal.length < 5 && (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={presetTopicInput}
                              onChange={e => setPresetTopicInput(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') handleAddPresetTopic(); }}
                              placeholder="e.g. Spider-Man, Cricket..."
                              maxLength={50}
                              className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-primary/60 transition-colors"
                            />
                            <div className="flex gap-1.5">
                              {(['Random', 'Easy', 'Medium', 'Hard'] as const).map(d => (
                                <button key={d} onClick={() => setPresetDifficulty(d)}
                                  className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-all ${presetDifficulty === d ? (d === 'Easy' ? 'bg-green-500/20 border-green-500/40 text-green-300' : d === 'Medium' ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : d === 'Hard' ? 'bg-red-500/20 border-red-500/40 text-red-300' : 'bg-primary/20 border-primary/40 text-primary') : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'}`}>
                                  {d}
                                </button>
                              ))}
                              <button onClick={handleAddPresetTopic} disabled={!presetTopicInput.trim()}
                                className="px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                        <div className="flex gap-2">
                          {presetTopicsLocal.length > 0 && (
                            <Button size="sm" className="flex-1" onClick={handleSubmitPresetTopics}>
                              Submit ({presetTopicsLocal.length}/5)
                            </Button>
                          )}
                          {!me.isHost && (
                            <Button size="sm" variant="outline" className="flex-1" onClick={handleSkipPresetTopics}>
                              Skip / No topics
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Player submission status */}
                    <div className="space-y-1 pt-1 border-t border-white/5">
                      {room.players.map(p => {
                        const pTopics = room.presetTopics?.[p.id];
                        const hasResponded = pTopics !== undefined;
                        const count = pTopics?.length ?? 0;
                        return (
                          <div key={p.id} className="flex items-center justify-between text-xs">
                            <span className="text-white/50">{p.name}{p.isHost ? ' 👑' : ''}</span>
                            <span className={hasResponded ? 'text-green-400' : 'text-white/20'}>
                              {hasResponded ? (count > 0 ? `✓ ${count} topic(s)` : '✓ skipped') : 'waiting...'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Question Context ───────────────────────────────────── */}
                <div className="space-y-3 pt-2 border-t border-white/10">
                  <p className="text-white/40 text-xs uppercase tracking-widest font-medium">Question Context</p>

                  <div className="flex gap-2">
                    {(['global', 'regional'] as const).map(rm => (
                      <button key={rm} onClick={() => handleRegionModeChange(rm)} disabled={settingsLocked}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                          localRegionMode === rm
                            ? 'bg-primary/20 border-primary/60 text-white'
                            : 'bg-white/5 border-white/10 text-white/50 hover:border-white/30 hover:text-white/80'
                        }`}>
                        {rm === 'global' ? <Globe className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
                        {rm === 'global' ? 'Global' : 'Regional'}
                      </button>
                    ))}
                  </div>

                  <AnimatePresence mode="wait">
                    {localRegionMode === 'global' && (
                      <motion.p key="global-hint" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        className="text-white/25 text-xs text-center">
                        Universal topics only — no cultural bias
                      </motion.p>
                    )}

                    {localRegionMode === 'regional' && (
                      <motion.div key="regional-picker" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="space-y-3">

                        {/* Region grid */}
                        <div className="grid grid-cols-2 gap-2">
                          {REGIONS.map(r => (
                            <button key={r.id} onClick={() => handleRegionIdChange(r.id)} disabled={settingsLocked}
                              className={`px-3 py-2.5 rounded-xl border text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                                localRegionId === r.id
                                  ? 'bg-primary/20 border-primary/60 text-white'
                                  : 'bg-white/5 border-white/10 text-white/50 hover:border-white/30 hover:text-white/80'
                              }`}>
                              <span className="text-base leading-none">{r.flag}</span>
                              <p className="text-xs font-semibold mt-1 leading-tight">{r.label}</p>
                              <p className="text-[10px] text-white/30 leading-tight mt-0.5 line-clamp-1">{r.description}</p>
                            </button>
                          ))}
                        </div>

                        {/* Country drill-down */}
                        <AnimatePresence>
                          {localRegionId && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                              <div className="space-y-2 pt-1">
                                <p className="text-white/30 text-xs">Drill down to a country? <span className="text-white/20">(optional)</span></p>
                                <div className="flex flex-wrap gap-1.5">
                                  <button onClick={() => handleCountryCodeChange(undefined)} disabled={settingsLocked}
                                    className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                                      !localCountryCode ? 'bg-primary/20 border-primary text-primary' : 'bg-white/5 border-white/10 text-white/40 hover:border-white/30 hover:text-white/70'
                                    }`}>
                                    Whole region
                                  </button>
                                  {REGIONS.find(r => r.id === localRegionId)?.countries.map(c => (
                                    <button key={c.code} onClick={() => handleCountryCodeChange(c.code)} disabled={settingsLocked}
                                      className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                                        localCountryCode === c.code ? 'bg-primary/20 border-primary text-primary' : 'bg-white/5 border-white/10 text-white/40 hover:border-white/30 hover:text-white/70'
                                      }`}>
                                      {c.flag} {c.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {!localRegionId && (
                          <p className="text-amber-400/60 text-xs text-center">Select a region above to apply cultural context</p>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                {/* ─────────────────────────────────────────────────────── */}

              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center space-y-4 w-full">
                <p className="text-white/70">Waiting for host to configure game...</p>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 w-full space-y-1.5">
                  <p className="text-white font-medium text-lg">
                    {room.topicMode === 'preset' ? 'Preset Topics' : 'Live Topics'} · {room.mode === 'score' ? `First to ${room.target} Pts` : `${room.target} Rounds`}
                  </p>
                  <p className="text-white/40 text-sm">Answer: {questionTimeSecs}s</p>
                  <p className="text-white/40 text-sm flex items-center justify-center gap-1.5">
                    {room.regionMode === 'regional' && regionLabel
                      ? <><MapPin className="w-3 h-3 text-primary/60" /><span className="text-primary/80 font-medium">{regionLabel}</span></>
                      : <><Globe className="w-3 h-3 text-white/30" /><span>Global questions</span></>}
                  </p>
                </div>

                {isPresetMode && (
                  <div className="w-full space-y-3 text-left">
                    <p className="text-white/40 text-xs uppercase tracking-widest font-medium text-center">Your Topics</p>
                    <p className="text-white/40 text-xs text-center">Add up to 5 topics. You can skip if you have none.</p>
                    {room.presetTopics?.[me.id] !== undefined ? (
                      <div className="space-y-1.5">
                        {mySubmittedTopics.map((entry, i) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20 text-green-300 text-sm font-medium">
                            <span className="flex-1">{entry.topic}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20">{entry.difficulty}</span>
                          </div>
                        ))}
                        {mySubmittedTopics.length === 0 && <p className="text-white/30 text-xs text-center">You skipped</p>}
                        <p className="text-green-400/60 text-xs text-center">✓ Submitted</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {presetTopicsLocal.map((entry, i) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm">
                            <span className="flex-1">{entry.topic}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/50">{entry.difficulty}</span>
                            <button onClick={() => handleRemovePresetTopic(i)} className="text-white/30 hover:text-white/70"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ))}
                        {presetTopicsLocal.length < 5 && (
                          <div className="space-y-2">
                            <input type="text" value={presetTopicInput} onChange={e => setPresetTopicInput(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') handleAddPresetTopic(); }}
                              placeholder="e.g. Spider-Man, Cricket..." maxLength={50}
                              className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-primary/60 transition-colors" />
                            <div className="flex gap-1.5">
                              {(['Random', 'Easy', 'Medium', 'Hard'] as const).map(d => (
                                <button key={d} onClick={() => setPresetDifficulty(d)}
                                  className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-all ${presetDifficulty === d ? (d === 'Easy' ? 'bg-green-500/20 border-green-500/40 text-green-300' : d === 'Medium' ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : d === 'Hard' ? 'bg-red-500/20 border-red-500/40 text-red-300' : 'bg-primary/20 border-primary/40 text-primary') : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'}`}>
                                  {d}
                                </button>
                              ))}
                              <button onClick={handleAddPresetTopic} disabled={!presetTopicInput.trim()}
                                className="px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 disabled:opacity-30 disabled:cursor-not-allowed">
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                        <div className="flex gap-2">
                          {presetTopicsLocal.length > 0 && <Button size="sm" className="flex-1" onClick={handleSubmitPresetTopics}>Submit ({presetTopicsLocal.length}/5)</Button>}
                          <Button size="sm" variant="outline" className="flex-1" onClick={handleSkipPresetTopics}>Skip</Button>
                        </div>
                      </div>
                    )}
                    <div className="space-y-1 pt-1 border-t border-white/5">
                      {room.players.map(p => {
                        const pTopics = room.presetTopics?.[p.id];
                        const hasResponded = pTopics !== undefined;
                        const count = pTopics?.length ?? 0;
                        return (
                          <div key={p.id} className="flex items-center justify-between text-xs">
                            <span className="text-white/50">{p.name}{p.isHost ? ' 👑' : ''}</span>
                            <span className={hasResponded ? 'text-green-400' : 'text-white/20'}>
                              {hasResponded ? (count > 0 ? `✓ ${count} topic(s)` : '✓ skipped') : 'waiting...'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-8 space-y-4">
            {!me.isReady ? (
              <Button size="lg" className="w-full" onClick={() => { onReady(true); playSound('click'); }}>I'm Ready!</Button>
            ) : (
              <Button size="lg" variant="outline" className="w-full text-green-400 border-green-400/30 hover:bg-green-400/10" onClick={() => { onReady(false); playSound('click'); }}>
                <CheckCircle2 className="w-5 h-5 mr-2" /> Ready
              </Button>
            )}

            {me.isHost && (
              <>
                <Button
                  size="lg"
                  variant={canActuallyStart ? "success" : "secondary"}
                  className="w-full"
                  disabled={!canActuallyStart}
                  onClick={() => {
                    onStart(mode, target, localTopicTime, localQuestionTime, localRegionMode, localRegionId, localCountryCode);
                    playSound('notification');
                  }}
                >
                  {canActuallyStart ? 'Start Game'
                    : regionIncomplete ? 'Pick a region to start'
                    : presetIncomplete ? 'Waiting for players to submit topics...'
                    : !me.isReady ? 'Ready up to start'
                    : room.players.length < 2 ? 'Need at least 2 players'
                    : 'Waiting for everyone to ready up...'}
                </Button>
                {room.players.length < 2 && <p className="text-center text-white/30 text-xs">Need at least 2 players to start</p>}
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
