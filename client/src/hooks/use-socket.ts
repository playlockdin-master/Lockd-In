import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Room, Player, type RegionId } from '@shared/schema';

// ---------------------------------------------------------------------------
// ANALYTICS HELPER
// ---------------------------------------------------------------------------
function track(eventName: string, params?: Record<string, string | number | boolean>) {
  try {
    const g = (window as any).gtag;
    if (typeof g === 'function') g('event', eventName, params ?? {});
  } catch { /* never let analytics crash the game */ }
}

// ---------------------------------------------------------------------------
// PERMANENT PLAYER IDENTITY
// The server assigns each player a UUID (playerId) that is independent of
// their socket.id. We persist it in localStorage so it survives tab closes,
// refreshes, and network drops. On reconnect we send it back so the server
// can match us to our existing player slot without relying on name alone.
// ---------------------------------------------------------------------------
const PLAYER_ID_KEY   = 'flooq_player_id';
const IDENTITY_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function loadStoredPlayerId(): string | null {
  try { return localStorage.getItem(PLAYER_ID_KEY); } catch { return null; }
}
function saveStoredPlayerId(id: string) {
  try { localStorage.setItem(PLAYER_ID_KEY, id); } catch {}
}
function clearStoredPlayerId() {
  try { localStorage.removeItem(PLAYER_ID_KEY); } catch {}
}

export interface TopicStat {
  topic: string;
  correct: number;
  total: number;
}

export interface GameState {
  room: Room | null;
  me: Player | null;
  myPlayerId: string | null;   // permanent player identity (UUID)
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
  topicStats: TopicStat[];
  bestStreak: number;
}

export function useSocket() {
  const [gameState, setGameState] = useState<GameState>({
    room:             null,
    me:               null,
    myPlayerId:       loadStoredPlayerId(),
    isConnected:      false,
    error:            null,
    serverRestarted:  false,
    roomExpired:      false,
    isReconnecting:   false,
    wasKicked:        false,
    kickMessage:      null,
    topicRejection:   null,
    topicSuggestions: [],
    loadingSuggestions: false,
    topicStats:       [],
    bestStreak:       0,
  });

  const [connectTimeout, setConnectTimeout] = useState(false);
  const socketRef            = useRef<Socket | null>(null);
  const hasConnectedBeforeRef = useRef(false);
  const isConnectedRef        = useRef(false);
  // Current permanent playerId — updated whenever server sends playerIdentity
  const myPlayerIdRef         = useRef<string | null>(loadStoredPlayerId());

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isConnectedRef.current) setConnectTimeout(true);
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  const clearIdentityRef = useRef<() => void>(() => {});
  useEffect(() => {
    clearIdentityRef.current = () => {
      sessionStorage.removeItem('playerName');
      sessionStorage.removeItem('avatarId');
      clearStoredPlayerId();
      try { localStorage.removeItem('flooq_identity'); } catch {}
    };
  });

  useEffect(() => {
    const clearIdentity_socket = () => clearIdentityRef.current();

    const newSocket = io({
      reconnectionAttempts: 10,
      reconnectionDelay:    500,
      reconnectionDelayMax: 3000,
      timeout:              10000,
    });

    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      const isReconnect = hasConnectedBeforeRef.current;
      hasConnectedBeforeRef.current = true;
      isConnectedRef.current        = true;

      setGameState(prev => ({ ...prev, isConnected: true, isReconnecting: false, error: null }));

      // On socket reconnect, re-join with our stored permanent playerId so the
      // server matches us to our existing player slot.
      if (isReconnect) {
        const playerName = sessionStorage.getItem('playerName');
        const avatarId   = sessionStorage.getItem('avatarId') ?? 'ghost';
        const match      = window.location.pathname.match(/\/room\/([A-Z0-9]+)/i);
        const roomCode   = match?.[1];
        const wasKicked  = !playerName;
        if (playerName && roomCode && roomCode.toLowerCase() !== 'new' && !wasKicked) {
          newSocket.emit('joinRoom', {
            playerName,
            roomCode: roomCode.toUpperCase(),
            avatarId,
            playerId: myPlayerIdRef.current ?? undefined, // send back our permanent id
          });
        }
      }
    });

    newSocket.on('disconnect', () => {
      isConnectedRef.current = false;
      setGameState(prev => ({ ...prev, isConnected: false, isReconnecting: true }));
    });

    // Server assigns us a permanent playerId on every successful join.
    // We store it and use it for all subsequent reconnects.
    newSocket.on('playerIdentity', ({ playerId }: { playerId: string }) => {
      if (playerId) {
        myPlayerIdRef.current = playerId;
        saveStoredPlayerId(playerId);
        setGameState(prev => ({ ...prev, myPlayerId: playerId }));
      }
    });

    newSocket.on('error', (data: { message: string }) => {
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
        // Resolve "me" by permanent playerId first (reliable across reconnects),
        // then fall back to name match for legacy compatibility.
        const pid = myPlayerIdRef.current;
        let me: Player | null = null;

        if (pid) {
          me = roomData.players.find(p => p.id === pid) ?? null;
        }
        // Fallback: match by stored name (handles edge case where server has
        // not yet sent playerIdentity for this connection)
        if (!me) {
          const storedName = sessionStorage.getItem('playerName');
          if (storedName) {
            me = roomData.players.find(
              p => p.name.toLowerCase() === storedName.toLowerCase()
            ) ?? null;
            // If we found ourselves by name, also update myPlayerIdRef
            if (me && me.id && me.id !== pid) {
              myPlayerIdRef.current = me.id;
              saveStoredPlayerId(me.id);
            }
          }
        }

        const topicRejection    = roomData.currentQuestion ? null : prev.topicRejection;
        const isNewTopicSel     = roomData.status === 'topic_selection' && prev.room?.status !== 'topic_selection';
        const topicSuggestions  = isNewTopicSel ? [] : prev.topicSuggestions;
        const loadingSuggestions = isNewTopicSel ? false : prev.loadingSuggestions;

        // Analytics
        const prevStatus = prev.room?.status;
        const nextStatus = roomData.status;

        if (prevStatus !== 'question' && nextStatus === 'question' && roomData.currentTopic) {
          track('round_started', { topic: roomData.currentTopic, round: roomData.currentRound, players: roomData.players.length });
        }

        // Per-topic accuracy tracking
        let topicStats = prev.topicStats;
        let bestStreak = prev.bestStreak;
        if (prevStatus === 'question' && nextStatus === 'results' && roomData.currentTopic && me) {
          const topic      = roomData.currentTopic;
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

        if (prevStatus === 'ended' && nextStatus === 'lobby') { topicStats = []; bestStreak = 0; }

        if (prevStatus !== 'ended' && nextStatus === 'ended') {
          track('game_completed', { rounds_played: roomData.currentRound, players: roomData.players.length, mode: roomData.mode, target: roomData.target });
        }
        if (prevStatus !== 'lobby' && nextStatus === 'lobby' && prev.room?.status === 'ended') {
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

    newSocket.on('roomExpired', () => {
      setGameState(prev => ({ ...prev, roomExpired: true }));
    });

    newSocket.on('kicked', (data: { message: string }) => {
      clearIdentity_socket();
      // Store kick message for the home page to pick up, then redirect immediately
      try { sessionStorage.setItem('flooq_kicked', data.message || 'The host removed you from the room.'); } catch {}
      newSocket.disconnect();
      window.history.replaceState(null, '', '/');
      window.location.href = '/';
    });

    newSocket.on('reaction', (data: { playerId: string; emoji: string }) => {
      window.dispatchEvent(new CustomEvent('player-reaction', { detail: data }));
    });

    return () => { newSocket.disconnect(); };
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────

  const joinRoom = useCallback((playerName: string, roomCode?: string, avatarId?: string) => {
    if (!socketRef.current) return;
    track('join_room', { is_new_room: !roomCode || roomCode === 'new' });
    socketRef.current.emit('joinRoom', {
      playerName,
      roomCode,
      avatarId: avatarId ?? 'ghost',
      playerId: myPlayerIdRef.current ?? undefined, // send permanent id if we have one
    });
  }, []);

  const updateSettings = useCallback((mode: 'round' | 'score', target: number, topicTimeSecs?: number, questionTimeSecs?: number, regionMode?: 'global' | 'regional', regionId?: RegionId, countryCode?: string) => {
    socketRef.current?.emit('updateSettings', { mode, target, topicTimeSecs, questionTimeSecs, regionMode, regionId, countryCode });
  }, []);

  const setReady = useCallback((isReady: boolean) => {
    socketRef.current?.emit('setReady', { isReady });
  }, []);

  const startGame = useCallback((mode: 'round' | 'score', target: number, topicTimeSecs?: number, questionTimeSecs?: number, regionMode?: 'global' | 'regional', regionId?: RegionId, countryCode?: string) => {
    track('game_started', { mode, target });
    socketRef.current?.emit('startGame', { mode, target, topicTimeSecs, questionTimeSecs, regionMode, regionId, countryCode });
  }, []);

  const selectTopic = useCallback((topic: string, difficulty?: 'Easy' | 'Medium' | 'Hard') => {
    track('topic_selected', { topic, ...(difficulty ? { difficulty } : {}) });
    socketRef.current?.emit('selectTopic', { topic, ...(difficulty ? { difficulty } : {}) });
  }, []);

  const updateTopicMode = useCallback((topicMode: 'live' | 'preset') => {
    socketRef.current?.emit('updateTopicMode', { topicMode });
  }, []);

  const submitPresetTopics = useCallback((topics: { topic: string; difficulty: 'Easy' | 'Medium' | 'Hard' }[]) => {
    socketRef.current?.emit('submitPresetTopics', { topics });
  }, []);

  const submitAnswer = useCallback((answerIndex: number) => {
    track('answer_submitted');
    socketRef.current?.emit('submitAnswer', { answerIndex });
  }, []);

  const sendReaction = useCallback((emoji: string) => {
    socketRef.current?.emit('react', { emoji });
  }, []);

  const updateAvatar = useCallback((avatarId: string) => {
    socketRef.current?.emit('updateAvatar', { avatarId });
  }, []);

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit('leaveRoom');
  }, []);

  const kickPlayer = useCallback((targetId: string) => {
    socketRef.current?.emit('kickPlayer', { targetId });
  }, []);

  const resetGame = useCallback(() => {
    socketRef.current?.emit('resetGame');
  }, []);

  const playAgain = useCallback(() => {
    socketRef.current?.emit('playAgain');
  }, []);

  const clearError = useCallback(() => {
    setGameState(prev => ({ ...prev, error: null }));
  }, []);

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
    updateTopicMode,
    submitPresetTopics,
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
