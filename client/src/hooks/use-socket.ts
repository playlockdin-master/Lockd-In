import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Room, Player, type RegionId } from '@shared/schema';

// ---------------------------------------------------------------------------
// ANALYTICS HELPER
// Typed wrapper around window.gtag so we don't need an npm package.
// Silently no-ops if gtag hasn't loaded yet (e.g. ad blockers).
// ---------------------------------------------------------------------------
function track(eventName: string, params?: Record<string, string | number | boolean>) {
  try {
    const g = (window as any).gtag;
    if (typeof g === 'function') g('event', eventName, params ?? {});
  } catch {
    // never let analytics crash the game
  }
}

export interface TopicStat {
  topic: string;
  correct: number;
  total: number;
}

export interface GameState {
  room: Room | null;
  me: Player | null;
  isConnected: boolean;
  error: string | null;
  serverRestarted: boolean;
  roomExpired: boolean;
  isReconnecting: boolean;
  wasKicked: boolean;
  kickMessage: string | null;
  topicRejection: { badTopic: string; reason: string; newTopic: string } | null;
  topicSuggestions: string[];
  loadingSuggestions: boolean;
  topicStats: TopicStat[]; // per-topic accuracy for current player
  bestStreak: number;      // highest streak reached this game
}

export function useSocket() {
  const [gameState, setGameState] = useState<GameState>({
    room: null,
    me: null,
    isConnected: false,
    error: null,
    serverRestarted: false,
    roomExpired: false,
    isReconnecting: false,
    wasKicked: false,
    kickMessage: null,
    topicRejection: null,
    topicSuggestions: [],
    loadingSuggestions: false,
    topicStats: [],
    bestStreak: 0,
  });
  
  const [connectTimeout, setConnectTimeout] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  // Track whether this is a reconnect (socket already had a previous connection)
  const hasConnectedBeforeRef = useRef(false);
  // ── Yellow #7 fix: use a ref instead of reading stale closure state ────────
  const isConnectedRef = useRef(false);

  useEffect(() => {
    // If still not connected after 8 seconds, show an error
    const timer = setTimeout(() => {
      if (!isConnectedRef.current) setConnectTimeout(true);
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  // Stable ref so the socket closure can call clearIdentity without stale capture
  const clearIdentityRef = useRef<() => void>(() => {});

  useEffect(() => {
    // Keep ref in sync
    clearIdentityRef.current = () => {
      sessionStorage.removeItem('playerName');
      sessionStorage.removeItem('avatarId');
      try { localStorage.removeItem('flooq_identity'); } catch {}
    };
  });

  useEffect(() => {
    const clearIdentity_socket = () => clearIdentityRef.current();
    const newSocket = io({
      reconnectionAttempts: 10,       // more attempts for mobile network switches
      reconnectionDelay: 500,         // start retrying faster (was 1000ms)
      reconnectionDelayMax: 3000,     // cap backoff at 3s instead of default 5s
      timeout: 10000,                 // connection timeout
    });
    
    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      const isReconnect = hasConnectedBeforeRef.current;
      hasConnectedBeforeRef.current = true;
      isConnectedRef.current = true;

      setGameState(prev => ({ ...prev, isConnected: true, isReconnecting: false, error: null }));

      // On reconnect, re-join the room so the server re-registers the new socket ID.
      // We only do this if we were already in a room — GameRoom's own useEffect handles
      // the initial join.
      if (isReconnect) {
        const playerName = sessionStorage.getItem('playerName');
        const avatarId   = sessionStorage.getItem('avatarId') ?? 'ghost';
        const match = window.location.pathname.match(/\/room\/([A-Z0-9]+)/i);
        const roomCode = match?.[1];
        // Don't re-join if the player was kicked (identity already cleared,
        // URL already replaced with '/' — but guard here too for safety)
        const wasKickedAlready = !playerName;
        if (playerName && roomCode && roomCode.toLowerCase() !== 'new' && !wasKickedAlready) {
          newSocket.emit('joinRoom', { playerName, roomCode: roomCode.toUpperCase(), avatarId });
        }
      }
    });

    newSocket.on('disconnect', () => {
      isConnectedRef.current = false;
      setGameState(prev => ({ ...prev, isConnected: false, isReconnecting: true }));
    });

    newSocket.on('error', (data: { message: string }) => {
      // Fix #2: if we're reconnecting and the server says the room doesn't exist,
      // it almost certainly restarted and lost state. Show a friendlier message
      // than the generic "No room with that code exists" error.
      const isReconnectRoomMissing =
        hasConnectedBeforeRef.current &&
        data.message?.toLowerCase().includes('no room with that code');
      if (isReconnectRoomMissing) {
        setGameState(prev => ({ ...prev, serverRestarted: true, error: null }));
      } else {
        setGameState(prev => ({ ...prev, error: data.message }));
      }
    });

    newSocket.on('gameState', (roomData: Room) => {
      setGameState(prev => {
        const me = roomData.players.find(p => p.id === newSocket.id) || null;
        const topicRejection = roomData.currentQuestion ? null : prev.topicRejection;
        const isNewTopicSelection =
          roomData.status === 'topic_selection' && prev.room?.status !== 'topic_selection';
        const topicSuggestions = isNewTopicSelection ? [] : prev.topicSuggestions;
        const loadingSuggestions = isNewTopicSelection ? false : prev.loadingSuggestions;

        // ── Analytics: fire events on meaningful state transitions ──────────
        const prevStatus = prev.room?.status;
        const nextStatus = roomData.status;

        if (prevStatus !== 'question' && nextStatus === 'question' && roomData.currentTopic) {
          // A new question arrived — track round start
          track('round_started', {
            topic: roomData.currentTopic,
            round: roomData.currentRound,
            players: roomData.players.length,
          });
        }

        // ── Per-topic accuracy tracking ──────────────────────────────────────
        // When status transitions FROM 'question' TO 'results', the round just ended.
        // At this point me.lastAnswerCorrect reflects this round's result.
        let topicStats = prev.topicStats;
        let bestStreak = prev.bestStreak;
        if (prevStatus === 'question' && nextStatus === 'results' && roomData.currentTopic && me) {
          const topic = roomData.currentTopic;
          const wasCorrect = me.lastAnswerCorrect === true;
          const answered   = me.lastAnswerCorrect !== undefined;
          const existing   = topicStats.find(s => s.topic === topic);
          if (existing) {
            topicStats = topicStats.map(s =>
              s.topic === topic
                ? { ...s, correct: s.correct + (wasCorrect ? 1 : 0), total: s.total + (answered ? 1 : 0) }
                : s
            );
          } else {
            topicStats = [...topicStats, { topic, correct: wasCorrect ? 1 : 0, total: answered ? 1 : 0 }];
          }
          bestStreak = Math.max(bestStreak, me.streak);
        }

        // Reset stats on new game (lobby after ended)
        if (prevStatus === 'ended' && nextStatus === 'lobby') {
          topicStats = [];
          bestStreak = 0;
        }

        if (prevStatus !== 'ended' && nextStatus === 'ended') {
          // Game finished — most important event
          track('game_completed', {
            rounds_played: roomData.currentRound,
            players: roomData.players.length,
            mode: roomData.mode,
            target: roomData.target,
          });
        }

        if (prevStatus !== 'lobby' && nextStatus === 'lobby' && prev.room?.status === 'ended') {
          // Players chose to play again
          track('play_again', { players: roomData.players.length });
        }

        return { ...prev, room: roomData, me, error: null, topicRejection, topicSuggestions, loadingSuggestions, topicStats, bestStreak };
      });
    });

    newSocket.on('topicRejected', (data: { badTopic: string; reason: string; newTopic: string }) => {
      setGameState(prev => ({ ...prev, topicRejection: data }));
    });

    newSocket.on('topicSuggestions', (data: { suggestions: string[] }) => {
      setGameState(prev => ({ ...prev, topicSuggestions: data.suggestions, loadingSuggestions: false }));
    });

    // Fix #5: server warns 30s before deleting an ended room
    newSocket.on('roomExpired', () => {
      setGameState(prev => ({ ...prev, roomExpired: true }));
    });

    // Fix #3 — server kicked this player
    newSocket.on('kicked', (data: { message: string }) => {
      clearIdentity_socket();
      // Immediately navigate away from the room URL so the player can't
      // simply refresh to re-join. Replace history so Back button doesn't
      // return them to the room.
      window.history.replaceState(null, '', '/');
      setGameState(prev => ({ ...prev, wasKicked: true, kickMessage: data.message, error: null, room: null, me: null }));
    });

    newSocket.on('reaction', (data: { playerId: string, emoji: string }) => {
      const event = new CustomEvent('player-reaction', { detail: data });
      window.dispatchEvent(event);
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const updateSettings = useCallback((mode: 'round' | 'score', target: number, topicTimeSecs?: number, questionTimeSecs?: number, regionMode?: 'global' | 'regional', regionId?: RegionId, countryCode?: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('updateSettings', { mode, target, topicTimeSecs, questionTimeSecs, regionMode, regionId, countryCode });
  }, []);

  const joinRoom = useCallback((playerName: string, roomCode?: string, avatarId?: string) => {
    if (!socketRef.current) return;
    track('join_room', { is_new_room: !roomCode || roomCode === 'new' ? true : false });
    socketRef.current.emit('joinRoom', { playerName, roomCode, avatarId: avatarId ?? 'ghost' });
  }, []);

  const setReady = useCallback((isReady: boolean) => {
    if (!socketRef.current) return;
    socketRef.current.emit('setReady', { isReady });
  }, []);

  const startGame = useCallback((mode: 'round' | 'score', target: number, topicTimeSecs?: number, questionTimeSecs?: number, regionMode?: 'global' | 'regional', regionId?: RegionId, countryCode?: string) => {
    if (!socketRef.current) return;
    track('game_started', { mode, target });
    socketRef.current.emit('startGame', { mode, target, topicTimeSecs, questionTimeSecs, regionMode, regionId, countryCode });
  }, []);

  const selectTopic = useCallback((topic: string, difficulty?: 'Easy' | 'Medium' | 'Hard') => {
    if (!socketRef.current) return;
    track('topic_selected', { topic, ...(difficulty ? { difficulty } : {}) });
    socketRef.current.emit('selectTopic', { topic, ...(difficulty ? { difficulty } : {}) });
  }, []);

  const submitAnswer = useCallback((answerIndex: number) => {
    if (!socketRef.current) return;
    track('answer_submitted');
    socketRef.current.emit('submitAnswer', { answerIndex });
  }, []);

  const sendReaction = useCallback((emoji: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('react', { emoji });
  }, []);

  const updateAvatar = useCallback((avatarId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('updateAvatar', { avatarId });
  }, []);

  const leaveRoom = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit('leaveRoom');
  }, []);

  // Fix #3 — host kick
  const kickPlayer = useCallback((targetId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('kickPlayer', { targetId });
  }, []);

  const resetGame = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit('resetGame');
  }, []);

  const playAgain = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit('playAgain');
  }, []);

  const clearError = useCallback(() => {
    setGameState(prev => ({ ...prev, error: null }));
  }, []);

  // Fix #3 — listen for kick event
  // (registered inside the socket effect but exposed here for clarity)

  // Fix #2 + #5: allow UI to dismiss these states
  const clearWasKicked = useCallback(() => {
    setGameState(prev => ({ ...prev, wasKicked: false, kickMessage: null }));
  }, []);

  const clearServerRestarted = useCallback(() => {
    setGameState(prev => ({ ...prev, serverRestarted: false }));
  }, []);

  const clearRoomExpired = useCallback(() => {
    setGameState(prev => ({ ...prev, roomExpired: false }));
  }, []);

  const clearTopicRejection = useCallback(() => {
    setGameState(prev => ({ ...prev, topicRejection: null }));
  }, []);

  const requestTopicSuggestions = useCallback(() => {
    if (!socketRef.current) return;
    setGameState(prev => ({ ...prev, loadingSuggestions: true, topicSuggestions: [] }));
    socketRef.current.emit('getTopicSuggestions');
  }, []);

  return {
    ...gameState,
    connectTimeout,
    joinRoom,
    leaveRoom,
    updateSettings,
    updateAvatar,
    setReady,
    startGame,
    selectTopic,
    submitAnswer,
    sendReaction,
    resetGame,
    playAgain,
    clearError,
    kickPlayer,
    clearWasKicked,
    clearServerRestarted,
    clearRoomExpired,
    clearTopicRejection,
    requestTopicSuggestions,
  };
}
