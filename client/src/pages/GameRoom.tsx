import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocation, useParams } from "wouter";
import { useSocket } from "@/hooks/use-socket";
import { ParticleBackground } from "@/components/ParticleBackground";
import { AudioController } from "@/components/AudioController";
import { ReactionOverlay } from "@/components/ReactionOverlay";
import { RoomSplash } from "@/components/RoomSplash";
import { RoundTransition } from "@/components/RoundTransition";
import { LobbyView } from "@/components/views/LobbyView";
import { TopicSelectionView } from "@/components/views/TopicSelectionView";
import { QuestionView } from "@/components/views/QuestionView";
import { ResultsView } from "@/components/views/ResultsView";
import { PodiumView } from "@/components/views/PodiumView";
import { AvatarPicker } from "@/components/Avatar";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { User, LogOut, Share2, Zap, Ban, RefreshCw, Search, DoorOpen, Timer } from "lucide-react";
import { useAudioSystem } from "@/hooks/use-audio";
import { validatePlayerName } from "@/lib/validate";
import { QotionLogo } from "@/components/QotionLogo";

// localStorage fallback with 2-hour TTL so identity survives tab closes
const IDENTITY_TTL_MS = 2 * 60 * 60 * 1000;
function saveIdentity(name: string, avatarId: string) {
  const payload = JSON.stringify({ name, avatarId, expiresAt: Date.now() + IDENTITY_TTL_MS });
  try { localStorage.setItem('qotion_identity', payload); } catch {}
  sessionStorage.setItem('playerName', name);
  sessionStorage.setItem('avatarId', avatarId);
}
function loadIdentity(): { name: string; avatarId: string } | null {
  // sessionStorage first (same tab)
  const ssName = sessionStorage.getItem('playerName');
  if (ssName) return { name: ssName, avatarId: sessionStorage.getItem('avatarId') ?? 'ghost' };
  // localStorage fallback (different tab / after tab close)
  try {
    const raw = localStorage.getItem('qotion_identity');
    if (!raw) return null;
    const { name, avatarId, expiresAt } = JSON.parse(raw);
    if (Date.now() > expiresAt) { localStorage.removeItem('qotion_identity'); return null; }
    // Restore to sessionStorage for this tab
    sessionStorage.setItem('playerName', name);
    sessionStorage.setItem('avatarId', avatarId);
    return { name, avatarId };
  } catch { return null; }
}
function clearIdentity() {
  sessionStorage.removeItem('playerName');
  sessionStorage.removeItem('avatarId');
  try {
    localStorage.removeItem('qotion_identity');
    localStorage.removeItem('qotion_player_id'); // permanent identity
  } catch {}
}

// ── Nickname modal shown when arriving via a shared link ──────────────────────
function NicknameModal({ roomCode, onJoin }: { roomCode: string; onJoin: (name: string, avatarId: string) => void }) {
  const [name, setName] = useState('');
  const [avatarId, setAvatarId] = useState('ghost');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { playSound } = useAudioSystem();

  useEffect(() => {
    const isTouchDevice = navigator.maxTouchPoints > 0;
    if (isTouchDevice) {
      const t = setTimeout(() => inputRef.current?.focus(), 350);
      return () => clearTimeout(t);
    } else {
      inputRef.current?.focus();
    }
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const err = validatePlayerName(name);
    if (err) { setError(err); return; }
    playSound('click');
    const trimmed = name.trim();
    saveIdentity(trimmed, avatarId);
    onJoin(trimmed, avatarId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <ParticleBackground />
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 24 }}
        className="relative z-10 glass-panel p-6 rounded-3xl w-full max-w-sm text-center"
      >
        <div className="mb-1 flex justify-center">
          <QotionLogo size="md" />
        </div>
        <p className="text-white/50 text-sm mb-1">You've been invited to room</p>
        <div className="text-2xl font-display font-black tracking-widest mb-4" style={{ color: '#2dd4bf' }}>{roomCode}</div>

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div>
            <label className="block text-sm font-semibold text-white/70 mb-2 ml-1">Choose your nickname</label>
            <Input
              ref={inputRef}
              placeholder="Enter nickname..."
              value={name}
              onChange={e => { setName(e.target.value); setError(''); }}
              icon={<User className="w-5 h-5" />}
              maxLength={20}
              error={error || undefined}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-white/70 mb-2 ml-1">Pick your character</label>
            <AvatarPicker selected={avatarId} onSelect={setAvatarId} />
          </div>
          <Button size="lg" className="w-full" type="submit" disabled={!name.trim()}>
            Join Game
          </Button>
        </form>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function GameRoom() {
  const { code } = useParams();
  const [, setLocation] = useLocation();
  const [showSplash, setShowSplash] = useState(false);
  const [showTransition, setShowTransition] = useState(false);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [pendingAvatar, setPendingAvatar] = useState<string>('ghost');
  const prevStatusRef = useRef<string | null>(null);
  const prevRoundRef = useRef<number | null>(null); // null = not yet seeded
  // Captures the selector name at the moment results appear (end of a round),
  // so the RoundTransition overlay shows who picked the topic that was just played —
  // not the NEW round's selector which gets assigned moments later.
  const lastSelectorNameRef = useRef<string>('');
  // Prevents the join effect from firing again after a "room not found" error.
  const hasJoinedRef = useRef(false);

  const handleSplashDone = useCallback(() => setShowSplash(false), []);
  const handleTransitionDone = useCallback(() => setShowTransition(false), []);

  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const {
    room, me, isConnected, isReconnecting, connectTimeout, error, topicRejection, topicSuggestions, loadingSuggestions,
    serverRestarted, roomExpired, wasKicked, kickMessage, topicStats, bestStreak,
    joinRoom, leaveRoom, setReady, startGame, selectTopic, submitAnswer, sendReaction, updateSettings, submitPresetTopics, updateTopicMode,
    updateAvatar, resetGame, playAgain, clearError, clearTopicRejection, requestTopicSuggestions,
    clearServerRestarted, clearRoomExpired, clearWasKicked, kickPlayer,
  } = useSocket();

  const handleExit = useCallback(() => {
    if (!room || room.status === 'lobby' || room.status === 'ended') {
      leaveRoom();
      clearIdentity();
      clearRoomExpired();
      setLocation('/');
    } else {
      setShowExitConfirm(true);
    }
  }, [room, leaveRoom, clearRoomExpired, setLocation]);

  const handleConfirmExit = useCallback(() => {
    leaveRoom();
    clearIdentity();
    clearRoomExpired();
    setLocation('/');
  }, [leaveRoom, clearRoomExpired, setLocation]);

  const handleClearError = useCallback(() => clearError(), [clearError]);

  // Determine if we need a nickname before joining
  const storedName = loadIdentity()?.name ?? null;
  const needsNickname = !storedName && code !== 'new';

  useEffect(() => {
    const identity = loadIdentity();
    const playerName = pendingName ?? identity?.name;
    const avatarId   = pendingAvatar !== 'ghost' ? pendingAvatar : (identity?.avatarId ?? 'ghost');
    if (!playerName) return;
    if (isConnected && !room && !hasJoinedRef.current) {
      hasJoinedRef.current = true;
      setShowSplash(true);
      joinRoom(playerName, code === 'new' ? undefined : code, avatarId);
    }
  }, [isConnected, room, code, joinRoom, pendingName, pendingAvatar]);

  // Once the server assigns a real code, update the URL so it's shareable
  useEffect(() => {
    if (room && code === 'new') {
      setLocation(`/room/${room.code}`, { replace: true });
    }
  }, [room?.code, code, setLocation]);

  // Track selector name while in topic_selection, then fire the transition
  // overlay when status moves to 'question' (topic has just been confirmed).
  const lastTopicRef = useRef<string>('');
  const prevStatusForSelectorRef = useRef<string | null>(null);
  useEffect(() => {
    if (!room) return;
    const prev = prevStatusForSelectorRef.current;
    prevStatusForSelectorRef.current = room.status;

    // Keep selector name fresh while picker is choosing
    if (room.status === 'topic_selection' && room.topicSelectorId) {
      const name = room.players.find(p => p.id === room.topicSelectorId)?.name ?? '';
      if (name) lastSelectorNameRef.current = name;
    }

    // Fire overlay the moment topic_selection → question (topic is now known)
    if (room.status === 'question' && prev === 'topic_selection' && room.currentTopic) {
      lastTopicRef.current = room.currentTopic;
      setShowTransition(true);
    }
  }, [room?.status, room?.topicSelectorId, room?.currentTopic]);

  // Seed prevRoundRef / prevStatusRef on every update (kept for future use,
  // no longer drives the transition trigger).
  useEffect(() => {
    if (!room) return;
    if (prevRoundRef.current === null) {
      prevStatusRef.current = room.status;
      prevRoundRef.current = room.currentRound;
      return;
    }
    prevStatusRef.current = room.status;
    prevRoundRef.current = room.currentRound;
  }, [room?.status, room?.currentRound]);

  if (needsNickname && !pendingName) {
    return (
      <NicknameModal
        roomCode={code ?? ''}
        onJoin={(name, avatar) => {
          hasJoinedRef.current = false; // allow the join effect to fire for this new identity
          setPendingName(name);
          setPendingAvatar(avatar);
        }}
      />
    );
  }

  // Kicked by host — write message to sessionStorage then navigate to home.
  // Home.tsx reads it on mount and shows the kicked banner.
  if (wasKicked) {
    try {
      sessionStorage.setItem('qotion_kicked', kickMessage || 'The host removed you from the room.');
    } catch {}
    window.history.replaceState(null, '', '/');
    setLocation('/');
    return null;
  }

  // Server restarted and wiped this room — friendlier than a generic error
  if (serverRestarted) {
    return (
      <div className="flex items-center justify-center p-4" style={{ minHeight: '100dvh' }}>
        <ParticleBackground />
        <div className="relative z-10 glass-panel p-8 rounded-3xl text-center max-w-md w-full">
          <div className="text-4xl mb-3 flex justify-center"><RefreshCw className="w-10 h-10 text-yellow-400" /></div>
          <h2 className="text-2xl font-bold text-white mb-3">Server Restarted</h2>
          <p className="text-white/60 mb-6">
            The game server restarted and your session was lost.
            Start a new room to keep playing!
          </p>
          <Button onClick={() => { clearServerRestarted(); setLocation('/'); }} className="w-full">
            Start New Game
          </Button>
        </div>
      </div>
    );
  }

  if (error && !room) {
    return (
      <div className="flex items-center justify-center p-4" style={{ minHeight: '100dvh' }}>
        <ParticleBackground />
        <div className="relative z-10 glass-panel p-8 rounded-3xl text-center max-w-md w-full">
          <div className="text-4xl mb-3 flex justify-center"><Search className="w-10 h-10 text-white/40" /></div>
          <h2 className="text-2xl font-bold text-white mb-3">Can't Join Room</h2>
          <p className="text-white/60 mb-6">{error}</p>
          <Button onClick={() => setLocation('/')} className="w-full">Back to Home</Button>
        </div>
      </div>
    );
  }

  if (!room || !me) {
    if (connectTimeout) {
      return (
        <div className="flex items-center justify-center p-4" style={{ minHeight: '100dvh' }}>
          <ParticleBackground />
          <div className="relative z-10 glass-panel p-8 rounded-3xl text-center max-w-md w-full">
            <h2 className="text-2xl font-bold text-destructive mb-4">Connection Failed</h2>
            <p className="text-white/70 mb-6">Could not reach the game server. Please check your connection and try again.</p>
            <Button onClick={() => setLocation('/')} className="w-full">Return Home</Button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center p-4" style={{ minHeight: '100dvh' }}>
        <ParticleBackground />
        <div className="w-16 h-16 border-4 border-teal-400 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-white/60 font-medium">Entering Room...</p>
      </div>
    );
  }

  const renderView = () => {
    switch (room.status) {
      case 'lobby':
        return <LobbyView key="lobby" room={room} me={me} onReady={setReady} onStart={startGame} onUpdateSettings={updateSettings} onUpdateAvatar={updateAvatar} onKickPlayer={kickPlayer} onUpdateTopicMode={updateTopicMode} onSubmitPresetTopics={submitPresetTopics} />;
      case 'topic_selection':
        return <TopicSelectionView key={`topic-${room.currentRound}`} room={room} me={me} onSelectTopic={selectTopic} error={error} onClearError={handleClearError} topicRejection={topicRejection} topicSuggestions={topicSuggestions} loadingSuggestions={loadingSuggestions} onRequestSuggestions={requestTopicSuggestions} />;
      case 'question':
        return <QuestionView key={`question-${room.currentRound}`} room={room} me={me} onSubmitAnswer={submitAnswer} topicRejection={topicRejection} overlayVisible={showTransition} />;
      case 'generating':
        return (
          <div key="generating" className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full border-4 border-teal-400/20" />
              <div className="absolute inset-0 rounded-full border-4 border-t-primary animate-spin" />
            </div>
            <div className="space-y-2">
              <p className="text-white font-display font-bold text-2xl">Generating Questions</p>
              <p className="text-white/40 text-sm">Preparing {room.target} questions from your topics...</p>
            </div>
          </div>
        );
      case 'results':
        return <ResultsView key={`results-${room.currentRound}`} room={room} me={me} />;
      case 'ended':
        return <PodiumView key="ended" room={room} me={me} onPlayAgain={playAgain} onLeave={handleConfirmExit} topicStats={topicStats} bestStreak={bestStreak} />;
      default:
        return <div key="default" className="text-white">Unknown state</div>;
    }
  };

  return (
    <div className="relative flex flex-col overflow-x-hidden w-full" style={{ minHeight: '100dvh' }}>
      {showSplash && <RoomSplash onDone={handleSplashDone} />}

      {/* Reconnecting banner — shown when our socket drops mid-game */}
      <AnimatePresence>
        {(isReconnecting || (room && me && !me.isConnected)) && room && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 glass-panel px-5 py-3 rounded-2xl text-center max-w-sm w-full mx-4 border border-yellow-400/30 flex items-center gap-3"
          >
            <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <div>
              <p className="text-yellow-300 font-semibold text-sm">Reconnecting...</p>
              <p className="text-white/50 text-xs">Your progress is saved</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Room expiry warning — shown 30s before server deletes the ended room */}
      <AnimatePresence>
        {roomExpired && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 glass-panel px-5 py-3 rounded-2xl text-center max-w-sm w-full mx-4 border border-yellow-400/30"
          >
            <p className="text-yellow-300 font-semibold text-sm flex items-center justify-center gap-1.5"><Timer className="w-3.5 h-3.5" />Room session ending soon</p>
            <p className="text-white/60 text-xs mt-0.5">Start a new game to keep playing</p>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs"
                onClick={() => { clearRoomExpired(); setLocation('/'); }}
              >
                New Game
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs border-white/20 text-white/50"
                onClick={clearRoomExpired}
              >
                Dismiss
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Exit confirmation modal */}
      <AnimatePresence>
        {showExitConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-panel p-6 rounded-3xl text-center max-w-sm w-full"
            >
              <div className="text-4xl mb-3 flex justify-center"><DoorOpen className="w-10 h-10 text-white/50" /></div>
              <h2 className="text-xl font-display font-bold text-white mb-2">Leave the game?</h2>
              <p className="text-white/50 text-sm mb-6">The game is in progress. Your progress won't be saved.</p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowExitConfirm(false)}>
                  Stay
                </Button>
                <Button variant="secondary" className="flex-1 text-red-400 border-red-400/30 hover:bg-red-400/10" onClick={handleConfirmExit}>
                  Leave
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <RoundTransition
        visible={showTransition}
        round={room.currentRound}
        totalRounds={room.mode === 'round' ? room.target : undefined}
        selectorName={lastSelectorNameRef.current}
        topic={lastTopicRef.current}
        onDone={handleTransitionDone}
      />

      <ParticleBackground />
      <ReactionOverlay />

      {/* Top Bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-3 py-2 md:px-6 md:py-3 backdrop-blur-md border-b shrink-0 min-w-0 overflow-hidden"
        style={{ background: 'rgba(8,14,26,0.85)', borderColor: 'rgba(45,212,191,0.1)' }}>
        {/* Left: logo + share + leave */}
        <div className="flex items-center gap-1.5 shrink-0 flex-1">
          <QotionLogo size="sm" />
          {room && (
            <button
              onClick={() => {
                const url = `${window.location.origin}/room/${room.code}`;
                if (navigator.share) { navigator.share({ title: 'Join my Qotion room!', url }).catch(() => {}); }
                else { navigator.clipboard?.writeText(url).catch(() => {}); }
              }}
              title="Share room link"
              className="flex items-center gap-1 px-1.5 py-1 rounded-lg text-white/30 hover:text-teal-400 hover:bg-teal-400/10 transition-colors text-xs font-medium"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-xs font-mono text-white/40">{room.code}</span>
            </button>
          )}
          <button
            onClick={handleExit}
            title="Leave room"
            className="flex items-center gap-1 px-1.5 py-1 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-400/10 transition-colors text-xs font-medium"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>

        {/* Centre: round/score pill */}
        <div className="glass-panel px-2 py-1 rounded-full text-xs font-bold text-white mx-1 text-center shrink-0 whitespace-nowrap">
          {room.mode === 'round'
            ? `R${room.currentRound}/${room.target}`
            : (() => {
                const leader = [...room.players].sort((a, b) => b.score - a.score)[0];
                const leaderScore = leader?.score ?? 0;
                const pct = Math.min(100, Math.round((leaderScore / room.target) * 100));
                const nearWin = pct >= 80;
                return (
                  <span className={nearWin ? 'text-yellow-300 flex items-center gap-0.5' : ''}>
                    {nearWin && <Zap className="w-3 h-3 fill-current inline" />}{leaderScore}/{room.target}
                  </span>
                );
              })()
          }
        </div>

        {/* Right: reactions + audio — reactions are icon-only on mobile */}
        <div className="flex items-center gap-1 shrink-0 flex-1 justify-end">
          {(room.status === 'question' || room.status === 'results') && (
            <div className="flex bg-black/40 rounded-full px-0.5 py-0.5 border border-white/10">
              {[
                {
                  id: '👍',
                  svg: (
                    <svg viewBox="0 0 24 24" className="w-4 h-4 md:w-5 md:h-5" xmlns="http://www.w3.org/2000/svg" fill="none">
                      <path d="M7 22V11M2 13v7a2 2 0 002 2h11.5a2 2 0 001.97-1.66l1.2-7A2 2 0 0016.7 11H13V6a3 3 0 00-3-3l-3 7z" stroke="#60A5FA" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )
                },
                {
                  id: '😂',
                  svg: (
                    <svg viewBox="0 0 24 24" className="w-4 h-4 md:w-5 md:h-5" xmlns="http://www.w3.org/2000/svg" fill="none">
                      <circle cx="12" cy="12" r="9" stroke="#FCD34D" strokeWidth="1.8"/>
                      <path d="M8 13.5s1 3 4 3 4-3 4-3" stroke="#FCD34D" strokeWidth="1.8" strokeLinecap="round"/>
                      <circle cx="9" cy="9.5" r="1" fill="#FCD34D"/>
                      <circle cx="15" cy="9.5" r="1" fill="#FCD34D"/>
                      <path d="M7 11c.5-1 1.5-1.5 2-1M17 11c-.5-1-1.5-1.5-2-1" stroke="#FCD34D" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                  )
                },
                {
                  id: '🔥',
                  svg: (
                    <svg viewBox="0 0 24 24" className="w-4 h-4 md:w-5 md:h-5" xmlns="http://www.w3.org/2000/svg" fill="none">
                      <path d="M12 2c0 0-5 4.5-5 9a5 5 0 0010 0c0-2-1-3.5-2-4.5 0 1.5-1 2.5-2 2.5C13 9 14 7 12 2z" stroke="#F97316" strokeWidth="1.6" strokeLinejoin="round" fill="#F97316" fillOpacity="0.25"/>
                      <path d="M12 13c0 0-2.5 1.5-2.5 3.5a2.5 2.5 0 005 0C14.5 14.5 12 13 12 13z" fill="#FCD34D" stroke="#F97316" strokeWidth="1" strokeLinejoin="round"/>
                    </svg>
                  )
                },
                {
                  id: '🤯',
                  svg: (
                    <svg viewBox="0 0 24 24" className="w-4 h-4 md:w-5 md:h-5" xmlns="http://www.w3.org/2000/svg" fill="none">
                      <circle cx="12" cy="13" r="7" stroke="#C084FC" strokeWidth="1.8"/>
                      <circle cx="9.5" cy="12" r="1" fill="#C084FC"/>
                      <circle cx="14.5" cy="12" r="1" fill="#C084FC"/>
                      <path d="M9.5 16.5s1-1.5 2.5-1.5 2.5 1.5 2.5 1.5" stroke="#C084FC" strokeWidth="1.5" strokeLinecap="round"/>
                      <path d="M9 6l1 2M12 4v2M15 6l-1 2" stroke="#C084FC" strokeWidth="1.5" strokeLinecap="round"/>
                      <path d="M7.5 8l1.5 1.5M16.5 8l-1.5 1.5" stroke="#C084FC" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                  )
                },
              ].map(({ id, svg }) => (
                <button
                  key={id}
                  onClick={() => sendReaction(id)}
                  className="w-6 h-6 md:w-9 md:h-9 flex items-center justify-center hover:scale-125 transition-transform active:scale-95"
                >
                  {svg}
                </button>
              ))}
            </div>
          )}
          <AudioController />
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 w-full flex flex-col items-center px-2 py-3 md:px-8 md:py-6 overflow-y-auto">
        <AnimatePresence mode="wait">
          {renderView()}
        </AnimatePresence>
      </main>
    </div>
  );
}
