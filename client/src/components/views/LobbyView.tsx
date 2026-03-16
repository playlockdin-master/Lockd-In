import { Room, Player, TOPIC_TIME_MIN, TOPIC_TIME_MAX, QUESTION_TIME_MIN, QUESTION_TIME_MAX } from "@shared/schema";
import { Card } from "../Card";
import { Button } from "../Button";
import { Avatar, AvatarPicker } from "../Avatar";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Users, Crown, CheckCircle2, Share2, Pencil } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useAudioSystem } from "@/hooks/use-audio";

interface Props {
  room: Room;
  me: Player;
  onReady: (isReady: boolean) => void;
  onStart: (mode: 'round' | 'score', target: number, topicTimeSecs: number, questionTimeSecs: number) => void;
  onUpdateSettings: (mode: 'round' | 'score', target: number, topicTimeSecs: number, questionTimeSecs: number) => void;
  onUpdateAvatar?: (avatarId: string) => void;
  onKickPlayer?: (targetId: string) => void;
}

export function LobbyView({ room, me, onReady, onStart, onUpdateSettings, onUpdateAvatar, onKickPlayer }: Props) {
  const [copied, setCopied] = useState(false);
  const [changingAvatar, setChangingAvatar] = useState(false);
  const { playSound } = useAudioSystem();

  const mode   = room.mode;
  const target = room.target;
  // Mirror the server's values so sliders stay in sync for all players
  const topicTimeSecs    = room.topicTimeSecs    ?? 25;
  const questionTimeSecs = room.questionTimeSecs ?? 18;

  const allReady     = room.players.every(p => p.isReady);
  const settingsLocked = allReady;

  // Fix — watch me.isHost so when the host TRANSFERS to this player
  // mid-session (original host left), we auto-mark them ready.
  // The empty-dep original only fired on mount, so the new host was
  // left unready and canStart stayed false forever.
  const prevIsHostRef = useRef(false);
  useEffect(() => {
    if (me.isHost && !me.isReady && !prevIsHostRef.current) {
      onReady(true);
    }
    prevIsHostRef.current = me.isHost;
  }, [me.isHost, me.isReady, onReady]);

  // Determine leaderboard leader (top score player) — in lobby everyone is 0, so first player is host
  const topScore = room.players.length > 0 ? Math.max(...room.players.map(p => p.score)) : 0;
  const leaderId = topScore > 0
    ? room.players.find(p => p.score === topScore)?.id
    : undefined;

  const handleModeChange = (newMode: 'round' | 'score') => {
    onUpdateSettings(newMode, newMode === 'round' ? 10 : 1000, topicTimeSecs, questionTimeSecs);
    playSound('click');
  };

  const handleTargetChange = (newTarget: number) => {
    onUpdateSettings(mode, newTarget, topicTimeSecs, questionTimeSecs);
    playSound('click');
  };

  const handleTopicTimeChange = (secs: number) => {
    onUpdateSettings(mode, target, secs, questionTimeSecs);
    playSound('click');
  };

  const handleQuestionTimeChange = (secs: number) => {
    onUpdateSettings(mode, target, topicTimeSecs, secs);
    playSound('click');
  };

  const handleCopy = () => {
    const text = room.code;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else { fallbackCopy(text); }
    setCopied(true); playSound('click');
    setTimeout(() => setCopied(false), 2000);
  };

  const fallbackCopy = (text: string) => {
    try {
      const el = document.createElement('textarea');
      el.value = text; el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
      document.body.appendChild(el); el.focus(); el.select();
      document.execCommand('copy'); document.body.removeChild(el);
    } catch (_) {}
  };

  const handleShare = () => {
    const url = `${window.location.origin}/room/${room.code}`;
    if (navigator.share) {
      navigator.share({ title: 'Join my LOCKD IN room!', url }).catch(() => {});
    } else {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(url).catch(() => fallbackCopy(url));
      } else { fallbackCopy(url); }
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }
    playSound('click');
  };

  const handleAvatarChange = (newId: string) => {
    sessionStorage.setItem('avatarId', newId);
    // Emit avatar update via socket so the server updates the player in-place
    // without triggering a rejoin or splash animation.
    if (onUpdateAvatar) {
      onUpdateAvatar(newId);
    }
    setChangingAvatar(false);
  };

  const canStart = me.isHost && allReady && room.players.length > 1;

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center pb-10">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="mb-6 md:mb-8 text-center w-full"
      >
        <h2 className="text-sm md:text-xl text-white/70 uppercase tracking-widest font-semibold mb-1 md:mb-2">Room Code</h2>
        <div
          onClick={handleCopy}
          className="text-3xl md:text-7xl font-display font-black tracking-widest text-white cursor-pointer hover:text-primary transition-colors flex items-center justify-center gap-2 md:gap-4 group"
        >
          {room.code}
          <Copy className={`w-5 h-5 md:w-12 md:h-12 transition-all ${copied ? 'text-green-400' : 'text-white/20 group-hover:text-primary'}`} />
        </div>
        {copied && <p className="text-green-400 font-medium mt-1 text-sm">Copied!</p>}
        <button
          onClick={handleShare}
          className="mt-2 md:mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white/70 hover:text-white text-xs md:text-sm font-medium transition-all"
        >
          <Share2 className="w-3.5 h-3.5 md:w-4 md:h-4" /> Share Invite Link
        </button>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 w-full">
        {/* Players list with avatars */}
        <Card className="flex flex-col h-full">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-display font-bold text-white flex items-center gap-2">
              <Users className="w-6 h-6 text-primary" /> Players
            </h3>
            <span className="bg-white/10 px-3 py-1 rounded-full text-sm font-medium">
              {room.players.length} / 8
            </span>
          </div>

          {/* Post-game: hint that some players may still be on the results screen */}
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
                <motion.div
                  key={p.id}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: isViewingResults ? 0.5 : 1 }}
                  className={`flex items-center justify-between p-2.5 rounded-xl border transition-opacity ${
                    isViewingResults
                      ? 'bg-white/3 border-white/5'
                      : 'bg-white/5 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar
                      avatarId={p.avatarId ?? 'ghost'}
                      mood="idle"
                      streak={p.streak}
                      isLeader={p.id === leaderId}
                      size={36}
                    />
                    <span className={`text-base font-medium flex items-center gap-2 ${isViewingResults ? 'text-white/40' : 'text-white'}`}>
                      {p.name}
                      {p.isHost && <Crown className="w-4 h-4 text-yellow-400" />}
                      {p.id === me.id && <span className="text-xs bg-white/20 px-2 py-0.5 rounded text-white/70">You</span>}
                      {isViewingResults && (
                        <span className="text-[10px] text-white/30 font-normal italic">viewing results…</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isViewingResults
                      ? <div className="w-6 h-6 rounded-full border-2 border-white/10" />
                      : p.isReady
                        ? <CheckCircle2 className="w-6 h-6 text-green-400" />
                        : <div className="w-6 h-6 rounded-full border-2 border-white/20" />
                    }
                    {/* Fix #3 — host kick button */}
                    {me.isHost && p.id !== me.id && room.status === 'lobby' && onKickPlayer && (
                      <button
                        onClick={() => onKickPlayer(p.id)}
                        title={`Kick ${p.name}`}
                        className="w-5 h-5 flex items-center justify-center rounded-full text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-colors text-xs font-bold leading-none"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </motion.div>
                );
              })}
            </div>
            {room.players.length > 4 && (
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black/40 to-transparent rounded-b-xl" />
            )}
          </div>

          {/* Change avatar button for self */}
          <button
            onClick={() => setChangingAvatar(v => !v)}
            className="mt-4 flex items-center gap-2 text-xs text-white/40 hover:text-white/70 transition-colors self-start"
          >
            <Pencil className="w-3 h-3" />
            {changingAvatar ? 'Cancel' : 'Change my character'}
          </button>

          <AnimatePresence>
            {changingAvatar && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden mt-3"
              >
                <AvatarPicker
                  selected={me.avatarId ?? 'ghost'}
                  onSelect={(id) => { handleAvatarChange(id); setChangingAvatar(false); }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        {/* Controls */}
        <Card className="flex flex-col justify-between">
          <div>
            <h3 className="text-2xl font-display font-bold text-white mb-6">Game Settings</h3>

            {me.isHost ? (
              <div className="space-y-6">
                <div>
                  <label className="text-white/70 text-sm font-medium mb-2 block">Mode</label>
                  <div className="flex gap-2">
                    <Button variant={mode === 'round' ? 'primary' : 'outline'} className="flex-1" onClick={() => handleModeChange('round')} disabled={settingsLocked}>Rounds</Button>
                    <Button variant={mode === 'score' ? 'primary' : 'outline'} className="flex-1" onClick={() => handleModeChange('score')} disabled={settingsLocked}>Score Limit</Button>
                  </div>
                  {settingsLocked && <p className="text-white/30 text-xs mt-2 text-center">Settings locked — all players ready</p>}
                </div>
                <div>
                  <label className="text-white/70 text-sm font-medium mb-2 block">
                    {mode === 'round' ? 'Number of Rounds' : 'Target Score'}
                  </label>
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

                {/* Timer settings */}
                <div className="space-y-4 pt-2 border-t border-white/10">
                  <p className="text-white/40 text-xs uppercase tracking-widest font-medium">Timers</p>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-white/70 text-sm font-medium">Topic selection</label>
                      <span className="text-primary font-bold text-sm tabular-nums w-8 text-right">{topicTimeSecs}s</span>
                    </div>
                    <input
                      type="range"
                      min={TOPIC_TIME_MIN}
                      max={TOPIC_TIME_MAX}
                      step={5}
                      value={topicTimeSecs}
                      disabled={settingsLocked}
                      onChange={e => handleTopicTimeChange(Number(e.target.value))}
                      className="w-full accent-primary disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <div className="flex justify-between text-white/20 text-xs mt-0.5">
                      <span>{TOPIC_TIME_MIN}s</span><span>{TOPIC_TIME_MAX}s</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-white/70 text-sm font-medium">Answer time</label>
                      <span className="text-primary font-bold text-sm tabular-nums w-8 text-right">{questionTimeSecs}s</span>
                    </div>
                    <input
                      type="range"
                      min={QUESTION_TIME_MIN}
                      max={QUESTION_TIME_MAX}
                      step={5}
                      value={questionTimeSecs}
                      disabled={settingsLocked}
                      onChange={e => handleQuestionTimeChange(Number(e.target.value))}
                      className="w-full accent-primary disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <div className="flex justify-between text-white/20 text-xs mt-0.5">
                      <span>{QUESTION_TIME_MIN}s</span><span>{QUESTION_TIME_MAX}s</span>
                    </div>
                  </div>
                </div>

              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center space-y-4">
                <p className="text-white/70">Waiting for host to configure game...</p>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 w-full space-y-1">
                  <p className="text-white font-medium text-lg">
                    {room.mode === 'round' ? `${room.target} Rounds` : `First to ${room.target} Pts`}
                  </p>
                  <p className="text-white/40 text-sm">
                    Topic: {topicTimeSecs}s · Answer: {questionTimeSecs}s
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 space-y-4">
            {!me.isReady ? (
              <Button size="lg" className="w-full" onClick={() => { onReady(true); playSound('click'); }}>
                I'm Ready!
              </Button>
            ) : (
              <Button size="lg" variant="outline" className="w-full text-green-400 border-green-400/30 hover:bg-green-400/10" onClick={() => { onReady(false); playSound('click'); }}>
                <CheckCircle2 className="w-5 h-5 mr-2" /> Ready
              </Button>
            )}

            {me.isHost && (
              <>
                <Button size="lg" variant={canStart ? "success" : "secondary"} className="w-full" disabled={!canStart} onClick={() => { onStart(mode, target, topicTimeSecs, questionTimeSecs); playSound('notification'); }}>
                  {canStart ? 'Start Game'
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
