import { useState, useCallback, useRef, createContext, useContext, useEffect } from 'react';

type SoundType = 'click' | 'tick' | 'correct' | 'incorrect' | 'notification';

const SOUND_URLS: Record<SoundType, string> = {
  click:        '/assets/click.wav',
  tick:         '/assets/tick.wav',
  correct:      '/assets/correct.wav',
  incorrect:    '/assets/incorrect.wav',
  notification: '/assets/notification.wav',
};

const SOUND_VOLUMES: Record<SoundType, number> = {
  click:        0.45,
  tick:         0.28,
  correct:      0.55,
  incorrect:    0.5,
  notification: 0.5,
};

const POOL_SIZES: Partial<Record<SoundType, number>> = { tick: 3, click: 2 };

const SFX_FADE_OUT_MS = 120;
const SFX_MUTE_KEY    = 'lockdin_sfx_muted';
const BGM_MUTE_KEY    = 'lockdin_bgm_muted';
const BGM_URL         = '/assets/ambient-bgm.wav';
const BGM_VOLUME      = 0.12;
const BGM_FADE_STEPS  = 40;
const BGM_FADE_MS     = 1500;

const AudioCtx = createContext<{
  isSfxMuted: boolean;
  isBgmMuted: boolean;
  toggleSfx:  () => void;
  toggleBgm:  () => void;
  playSound:  (type: SoundType) => void;
} | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [isSfxMuted, setIsSfxMuted] = useState(() => {
    try { return localStorage.getItem(SFX_MUTE_KEY) === 'true'; } catch { return false; }
  });
  const [isBgmMuted, setIsBgmMuted] = useState(() => {
    try { return localStorage.getItem(BGM_MUTE_KEY) === 'true'; } catch { return false; }
  });

  const isSfxMutedRef = useRef(isSfxMuted);
  const isBgmMutedRef = useRef(isBgmMuted);
  const poolRef       = useRef<Partial<Record<SoundType, { audios: HTMLAudioElement[]; idx: number }>>>({});
  const builtRef      = useRef(false);
  const bgmRef        = useRef<HTMLAudioElement | null>(null);
  const bgmFadeRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tracks whether the BGM element has been created and a play() was attempted
  // in a user-gesture context, making it "unlocked" for future programmatic calls.
  const bgmUnlockedRef = useRef(false);

  // Keep refs in sync with state so callbacks always see current values
  useEffect(() => {
    isSfxMutedRef.current = isSfxMuted;
    try { localStorage.setItem(SFX_MUTE_KEY, String(isSfxMuted)); } catch {}
  }, [isSfxMuted]);

  useEffect(() => {
    isBgmMutedRef.current = isBgmMuted;
    try { localStorage.setItem(BGM_MUTE_KEY, String(isBgmMuted)); } catch {}
  }, [isBgmMuted]);

  const clearFade = useCallback(() => {
    if (bgmFadeRef.current) { clearInterval(bgmFadeRef.current); bgmFadeRef.current = null; }
  }, []);

  // ── fadeIn / fadeOut ────────────────────────────────────────────────────────
  // Both must be called synchronously inside a user-gesture handler on Safari.
  // Never call these from a useEffect — Safari does not treat state-update flushes
  // as user-gesture contexts, so bgm.play() will be blocked with NotAllowedError.

  const fadeIn = useCallback(() => {
    const bgm = bgmRef.current;
    if (!bgm) return;
    clearFade();
    bgm.volume = 0;
    // play() MUST be called here, synchronously within the gesture stack.
    // The .catch swallows Safari's NotAllowedError if called outside a gesture.
    bgm.play().catch(() => {});
    const step = BGM_VOLUME / BGM_FADE_STEPS;
    const ms   = BGM_FADE_MS / BGM_FADE_STEPS;
    bgmFadeRef.current = setInterval(() => {
      if (!bgmRef.current) { clearFade(); return; }
      const next = Math.min(BGM_VOLUME, bgmRef.current.volume + step);
      bgmRef.current.volume = next;
      if (next >= BGM_VOLUME) clearFade();
    }, ms);
  }, [clearFade]);

  const fadeOut = useCallback(() => {
    const bgm = bgmRef.current;
    if (!bgm) return;
    clearFade();
    const startVol = bgm.volume;
    if (startVol <= 0) { bgm.pause(); return; } // already silent — just pause
    const step = startVol / BGM_FADE_STEPS;
    const ms   = BGM_FADE_MS / BGM_FADE_STEPS;
    bgmFadeRef.current = setInterval(() => {
      if (!bgmRef.current) { clearFade(); return; }
      const next = Math.max(0, bgmRef.current.volume - step);
      bgmRef.current.volume = next;
      if (next <= 0) { bgmRef.current.pause(); clearFade(); }
    }, ms);
  }, [clearFade]);

  // ── SFX pool: prime on first user interaction ────────────────────────────────
  const buildPool = useCallback(() => {
    if (builtRef.current) return;
    builtRef.current = true;
    (Object.keys(SOUND_URLS) as SoundType[]).forEach(type => {
      const count = POOL_SIZES[type] ?? 1;
      const audios: HTMLAudioElement[] = [];
      for (let i = 0; i < count; i++) {
        const a = new Audio(SOUND_URLS[type]);
        a.preload = 'auto';
        a.volume  = SOUND_VOLUMES[type];
        // Prime the element: a play/pause during a gesture unlocks it for later
        // programmatic calls in all browsers including Safari.
        a.play().then(() => a.pause()).catch(() => {
          // NotAllowedError on Safari before gesture — harmless, element still loads
        });
        audios.push(a);
      }
      poolRef.current[type] = { audios, idx: 0 };
    });
  }, []);

  // ── Init: on first user interaction, create BGM element and unlock it ───────
  useEffect(() => {
    const start = () => {
      buildPool();
      if (bgmUnlockedRef.current) return;
      bgmUnlockedRef.current = true;

      const bgm = new Audio(BGM_URL);
      bgm.loop    = true;
      bgm.preload = 'auto';
      bgm.volume  = 0;
      bgmRef.current = bgm;

      if (!isBgmMutedRef.current) {
        // Start BGM immediately while still inside the gesture — this "unlocks"
        // the element so subsequent programmatic play() calls work on Safari.
        fadeIn();
      } else {
        // Even when muted, call play+pause to unlock the element so toggleBgm
        // can start playback later without needing a new gesture.
        bgm.play().then(() => bgm.pause()).catch(() => {});
      }
    };

    // Try immediately in case the document already has focus and autoplay is allowed
    // (desktop Chrome/Firefox). On Safari this will silently fail — that's fine.
    buildPool();
    document.addEventListener('click',      start, { once: true });
    document.addEventListener('touchstart', start, { once: true, passive: true });
    document.addEventListener('keydown',    start, { once: true });
    return () => {
      document.removeEventListener('click',      start);
      document.removeEventListener('touchstart', start);
      document.removeEventListener('keydown',    start);
    };
  }, [buildPool, fadeIn]);

  // Cleanup on unmount
  useEffect(() => () => { clearFade(); bgmRef.current?.pause(); }, [clearFade]);

  // ── Toggle handlers ─────────────────────────────────────────────────────────
  // CRITICAL: fadeIn/fadeOut MUST be called synchronously here, inside the
  // user-gesture call stack. Do NOT call them from a useEffect reacting to state
  // changes — that fires outside the gesture context and Safari will block play().

  const toggleSfx = useCallback(() => {
    setIsSfxMuted(prev => !prev);
  }, []);

  const toggleBgm = useCallback(() => {
    const nextMuted = !isBgmMutedRef.current;
    isBgmMutedRef.current = nextMuted; // update ref immediately, before state flush
    setIsBgmMuted(nextMuted);
    try { localStorage.setItem(BGM_MUTE_KEY, String(nextMuted)); } catch {}

    if (!bgmUnlockedRef.current) return; // BGM not initialised yet — state saved, will apply on first interaction

    // Call fade synchronously while still in the gesture handler
    if (nextMuted) {
      fadeOut();
    } else {
      fadeIn();
    }
  }, [fadeIn, fadeOut]);

  // ── Sound playback ──────────────────────────────────────────────────────────
  const playSound = useCallback((type: SoundType) => {
    if (isSfxMutedRef.current) return;
    const targetVolume = SOUND_VOLUMES[type];

    const playSfx = (audio: HTMLAudioElement) => {
      try {
        // Guard: setting currentTime on an unloaded element can throw in Safari
        if (audio.readyState >= 1) audio.currentTime = 0;
        audio.volume = targetVolume;
        audio.play().then(() => {
          const dur = audio.duration;
          if (!isNaN(dur) && dur > 0) {
            const fadeStartAt = Math.max(0, dur * 1000 - SFX_FADE_OUT_MS);
            setTimeout(() => {
              if (!audio.paused) {
                let s = 0;
                const steps = 12;
                const delta = audio.volume / steps;
                const id = setInterval(() => {
                  audio.volume = Math.max(0, audio.volume - delta);
                  if (++s >= steps) clearInterval(id);
                }, SFX_FADE_OUT_MS / steps);
              }
            }, fadeStartAt);
          }
        }).catch(() => {});
      } catch {}
    };

    const pool = poolRef.current[type];
    if (pool) {
      const audio = pool.audios[pool.idx % pool.audios.length];
      pool.idx++;
      playSfx(audio);
    } else {
      try {
        const a = new Audio(SOUND_URLS[type]);
        a.preload = 'auto';
        a.volume  = targetVolume;
        playSfx(a);
      } catch {}
    }
  }, []);

  return (
    <AudioCtx.Provider value={{ isSfxMuted, isBgmMuted, toggleSfx, toggleBgm, playSound }}>
      {children}
    </AudioCtx.Provider>
  );
}

export function useAudioSystem() {
  const ctx = useContext(AudioCtx);
  if (!ctx) throw new Error('useAudioSystem must be used within AudioProvider');
  return ctx;
}
