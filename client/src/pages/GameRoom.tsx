import { useEffect, useRef, useState, useCallback } from "react";
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
import { User, LogOut } from "lucide-react";
import { useAudioSystem } from "@/hooks/use-audio";
import { validatePlayerName } from "@/lib/validate";

// Fix #2 — localStorage fallback with 2-hour TTL so identity survives tab closes
const IDENTITY_TTL_MS = 2 * 60 * 60 * 1000;
function saveIdentity(name: string, avatarId: string) {
  const payload = JSON.stringify({ name, avatarId, expiresAt: Date.now() + IDENTITY_TTL_MS });
  try { localStorage.setItem('lockdin_identity', payload); } catch {}
  sessionStorage.setItem('playerName', name);
  sessionStorage.setItem('avatarId', avatarId);
}
function loadIdentity(): { name: string; avatarId: string } | null {
  // sessionStorage first (same tab)
  const ssName = sessionStorage.getItem('playerName');
  if (ssName) return { name: ssName, avatarId: sessionStorage.getItem('avatarId') ?? 'ghost' };
  // localStorage fallback (different tab / after tab close)
  try {
    const raw = localStorage.getItem('lockdin_identity');
    if (!raw) return null;
    const { name, avatarId, expiresAt } = JSON.parse(raw);
    if (Date.now() > expiresAt) { localStorage.removeItem('lockdin_identity'); return null; }
    // Restore to sessionStorage for this tab
    sessionStorage.setItem('playerName', name);
    sessionStorage.setItem('avatarId', avatarId);
    return { name, avatarId };
  } catch { return null; }
}
function clearIdentity() {
  sessionStorage.removeItem('playerName');
  sessionStorage.removeItem('avatarId');
  try { localStorage.removeItem('lockdin_identity'); } catch {}
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
        <div className="font-display font-black text-3xl text-white mb-1 inline-flex items-center">
          <span>LOCK</span>
          <span className="text-primary mx-0.5" style={{ display: 'inline-block', transform: 'rotate(15deg) skewX(-8deg)' }}>D</span>
          <span className="bg-primary text-white px-2 py-0.5 rounded-lg">IN</span>
        </div>
        <p className="text-white/50 text-sm mb-1">You've been invited to room</p>
        <div className="text-2xl font-display font-black text-primary tracking-widest mb-4">{roomCode}</div>

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

  const handleSplashDone = useCallback(() => setShowSplash(false), []);
  const handleTransitionDone = useCallback(() => setShowTransition(false), []);

  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const {
    room, me, isConnected, isReconnecting, connectTimeout, error, topicRejection, topicSuggestions, loadingSuggestions,
    serverRestarted, roomExpired, wasKicked, kickMessage,
    joinRoom, leaveRoom, setReady, startGame, selectTopic, submitAnswer, sendReaction, updateSettings,
    updateAvatar, resetGame, playAgain, clearError, clearTopicRejection, requestTopicSuggestions,
    clearServerRestarted, clearRoomExpired, clearWasKicked, kickPlayer,
  } = useSocket();

  const handleExit = useCallback(() => {
    if (!room || room.status === 'lobby' || room.status === 'ended') {
      leaveRoom();
      clearIdentity();
      setLocation('/');
    } else {
      setShowExitConfirm(true);
    }
  }, [room, leaveRoom, setLocation]);

  const handleConfirmExit = useCallback(() => {
    leaveRoom();
    clearIdentity();
    setLocation('/');
  }, [leaveRoom, setLocation]);

  const handleClearError = useCallback(() => clearError(), [clearError]);

  // Determine if we need a nickname before joining
  const storedName = loadIdentity()?.name ?? null;
  const needsNickname = !storedName && code !== 'new';

  useEffect(() => {
    const identity = loadIdentity();
    const playerName = pendingName ?? identity?.name;
    const avatarId   = pendingAvatar !== 'ghost' ? pendingAvatar : (identity?.avatarId ?? 'ghost');
    if (!playerName) return;
    if (isConnected && !room) {
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

  // Show round transition when a new round starts.
  // prevRoundRef starts as null so the very first gameState snapshot (including
  // late-joiners who land mid-game) seeds the ref without triggering the overlay.
  useEffect(() => {
    if (!room) return;
    if (prevRoundRef.current === null) {
      // First snapshot — just seed, never animate
      prevStatusRef.current = room.status;
      prevRoundRef.current = room.currentRound;
      return;
    }
    const wasNotTopicSelection = prevStatusRef.current !== 'topic_selection';
    const isNewRound = room.currentRound > prevRoundRef.current;
    if (room.status === 'topic_selection' && wasNotTopicSelection && isNewRound && room.currentRound > 1) {
      setShowTransition(true);
    }
    prevStatusRef.current = room.status;
    prevRoundRef.current = room.currentRound;
  }, [room?.status, room?.currentRound]);

  if (needsNickname && !pendingName) {
    return (
      <NicknameModal
        roomCode={code ?? ''}
        onJoin={(name, avatar) => { setPendingName(name); setPendingAvatar(avatar); }}
      />
    );
  }

  const selectorName = room?.players.find(p => p.id === room.topicSelectorId)?.name ?? '';

  // Kicked by host — show a dedicated screen instead of the join modal
  if (wasKicked) {
    return (
      <div className="flex items-center justify-center p-4" style={{ minHeight: '100dvh' }}>
        <ParticleBackground />
        <div className="relative z-10 glass-panel p-8 rounded-3xl text-center max-w-md w-full">
          <div className="text-4xl mb-3">🚫</div>
          <h2 className="text-2xl font-bold text-white mb-3">You were removed</h2>
          <p className="text-white/60 mb-6">
            {kickMessage || 'The host removed you from the game.'}
          </p>
          <Button onClick={() => { clearWasKicked(); setLocation('/'); }} className="w-full">
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  // Fix #2: server restarted and wiped this room — friendlier than a generic error
  if (serverRestarted) {
    return (
      <div className="flex items-center justify-center p-4" style={{ minHeight: '100dvh' }}>
        <ParticleBackground />
        <div className="relative z-10 glass-panel p-8 rounded-3xl text-center max-w-md w-full">
          <div className="text-4xl mb-3">🔄</div>
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
          <div className="text-4xl mb-3">🔍</div>
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
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-white/60 font-medium">Entering Room...</p>
      </div>
    );
  }

  const renderView = () => {
    switch (room.status) {
      case 'lobby':
        return <LobbyView key="lobby" room={room} me={me} onReady={setReady} onStart={startGame} onUpdateSettings={updateSettings} onUpdateAvatar={updateAvatar} onKickPlayer={kickPlayer} />;
      case 'topic_selection':
        return <TopicSelectionView key={`topic-${room.currentRound}`} room={room} me={me} onSelectTopic={selectTopic} error={error} onClearError={handleClearError} topicRejection={topicRejection} topicSuggestions={topicSuggestions} loadingSuggestions={loadingSuggestions} onRequestSuggestions={requestTopicSuggestions} />;
      case 'question':
        return <QuestionView key={`question-${room.currentRound}`} room={room} me={me} onSubmitAnswer={submitAnswer} topicRejection={topicRejection} />;
      case 'results':
        return <ResultsView key={`results-${room.currentRound}`} room={room} me={me} />;
      case 'ended':
        return <PodiumView key="ended" room={room} me={me} onPlayAgain={playAgain} onLeave={handleConfirmExit} />;
      default:
        return <div key="default" className="text-white">Unknown state</div>;
    }
  };

  return (
    <div className="relative flex flex-col overflow-x-hidden w-full" style={{ minHeight: '100dvh' }}>
      {showSplash && <RoomSplash onDone={handleSplashDone} />}

      {/* Fix #5b — Reconnecting banner — shown when socket drops mid-game */}
      <AnimatePresence>
        {isReconnecting && room && (
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

      {/* Fix #5: Room expiry warning — shown 30s before server deletes the ended room */}
      <AnimatePresence>
        {roomExpired && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 glass-panel px-5 py-3 rounded-2xl text-center max-w-sm w-full mx-4 border border-yellow-400/30"
          >
            <p className="text-yellow-300 font-semibold text-sm">⏳ Room session ending soon</p>
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
              <div className="text-4xl mb-3">🚪</div>
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
        selectorName={selectorName}
        onDone={handleTransitionDone}
      />

      <ParticleBackground />
      <ReactionOverlay />

      {/* Top Bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-3 py-2 md:px-6 md:py-3 bg-black/50 backdrop-blur-md border-b border-white/5 shrink-0 min-w-0 overflow-hidden">
        {/* Left: logo + leave */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="font-display font-black text-base md:text-2xl tracking-tighter text-white/90 inline-flex items-center">
            <span>LOCK</span>
            <span className="text-primary mx-0.5" style={{ display: 'inline-block', transform: 'rotate(15deg) skewX(-8deg)' }}>D</span>
            <span className="bg-primary text-white px-1 md:px-2 py-0.5 rounded-lg text-sm md:text-xl">IN</span>
          </div>
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
                  <span className={nearWin ? 'text-yellow-300' : ''}>
                    {nearWin ? '⚡' : ''}{leaderScore}/{room.target}
                  </span>
                );
              })()
          }
        </div>

        {/* Right: reactions + audio — reactions are icon-only on mobile */}
        <div className="flex items-center gap-1 shrink-0">
          {(room.status === 'question' || room.status === 'results') && (
            <div className="flex bg-black/40 rounded-full px-0.5 py-0.5 border border-white/10">
              {['👍', '😂', '🔥', '🤯'].map(emoji => (
                <button
                  key={emoji}
                  onClick={() => sendReaction(emoji)}
                  className="w-6 h-6 md:w-9 md:h-9 flex items-center justify-center text-xs md:text-lg hover:scale-125 transition-transform active:scale-95"
                >
                  {emoji}
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
