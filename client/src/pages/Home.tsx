import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { ParticleBackground } from "@/components/ParticleBackground";
import { AudioController } from "@/components/AudioController";
import { AvatarPicker } from "@/components/Avatar";
import { motion, AnimatePresence } from "framer-motion";
import { Gamepad2, Hash, User, Ban } from "lucide-react";
import { useAudioSystem } from "@/hooks/use-audio";
import { validatePlayerName } from "@/lib/validate";

// Typewriter hook — reveals text character by character
function useTypewriter(text: string, delay = 32) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed("");
    setDone(false);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(id); setDone(true); }
    }, delay);
    return () => clearInterval(id);
  }, [text, delay]);

  return { displayed, done };
}

export default function Home() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [avatarId, setAvatarId] = useState("ghost");
  const [roomCode, setRoomCode] = useState("");
  const [nameError, setNameError] = useState("");
  const [codeError, setCodeError] = useState("");
  const [kickedMessage, setKickedMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      const msg = sessionStorage.getItem('qotion_kicked');
      if (msg) {
        setKickedMessage(msg);
        sessionStorage.removeItem('qotion_kicked');
      }
    } catch {}
  }, []);

  const { playSound } = useAudioSystem();
  const { displayed: bubbleText, done: bubbleDone } = useTypewriter("Hey! Ready to challenge yourself? 🧠", 36);

  const handleAction = (action: 'create' | 'join') => {
    setNameError("");
    setCodeError("");

    const nameErr = validatePlayerName(name);
    if (nameErr) { setNameError(nameErr); return; }

    if (action === 'join') {
      const trimmedCode = roomCode.trim();
      if (!trimmedCode) { setCodeError("Room code is required"); return; }
      if (!/^[A-Z0-9]{4,8}$/.test(trimmedCode)) { setCodeError("Room code must be 4–8 characters"); return; }
    }

    playSound('click');
    try { localStorage.removeItem('qotion_player_id'); } catch {}
    sessionStorage.removeItem('playerName');
    sessionStorage.removeItem('avatarId');
    sessionStorage.setItem('playerName', name.trim());
    sessionStorage.setItem('avatarId', avatarId);

    if (action === 'create') {
      setLocation('/room/new');
    } else {
      setLocation(`/room/${roomCode.trim()}`);
    }
  };

  return (
    <div className="relative p-4 flex items-center justify-center" style={{ minHeight: '100dvh' }}>
      <ParticleBackground />
      <div className="absolute top-4 right-4 z-50">
        <AudioController />
      </div>

      {/* Kicked by host banner */}
      <AnimatePresence>
        {kickedMessage && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 200,
              background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
            }}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 24 }} animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 12 }}
              transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              className="glass-panel p-8 rounded-3xl text-center max-w-sm w-full"
            >
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center">
                  <Ban className="w-8 h-8 text-red-400" />
                </div>
              </div>
              <h2 className="text-2xl font-display font-bold text-white mb-2">Kicked from room</h2>
              <p className="text-white/55 text-sm mb-6 leading-relaxed">{kickedMessage}</p>
              <Button className="w-full" onClick={() => setKickedMessage(null)}>Back to Lobby</Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 w-full max-w-md mx-auto">

        {/* ── Logo ── */}
        <motion.div
          className="text-center mb-5 md:mb-7"
          initial={{ opacity: 0, y: -40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
            <img
              src="/qotion-logo.png"
              alt="Qotion"
              style={{ width: 'clamp(200px, 40vw, 320px)', height: 'auto', display: 'block' }}
            />
            <div style={{
              fontFamily: "'Plus Jakarta Sans', 'Outfit', sans-serif",
              fontSize: 'clamp(8px, 1.2vw, 11px)',
              fontWeight: 500,
              color: 'rgba(45, 212, 191, 0.7)',
              letterSpacing: '4px',
              textTransform: 'uppercase',
              paddingLeft: 2,
            }}>
              Questions in Motion
            </div>
          </div>
        </motion.div>

        {/* ── Mascot greeter row: mascot left + speech bubble right ── */}
        <motion.div
          className="flex items-end mb-2"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.25, ease: "easeOut" }}
        >
          {/* Mascot — idle float animation */}
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
            style={{ flexShrink: 0, lineHeight: 0, marginBottom: '-4px' }}
          >
            <img
              src="/mascot_wave.png"
              alt="Mascot waving"
              style={{
                width: 'clamp(170px, 34vw, 230px)',
                height: 'auto',
                display: 'block',
                isolation: 'isolate',
              }}
            />
          </motion.div>

          {/* Speech bubble */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85, x: -10 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ duration: 0.45, delay: 0.55, type: 'spring', stiffness: 260, damping: 22 }}
            style={{
              position: 'relative',
              isolation: 'isolate',
              background: 'rgba(15, 25, 40, 0.92)',
              border: '1px solid rgba(45, 212, 191, 0.3)',
              borderRadius: '16px 16px 16px 4px',
              padding: '12px 16px',
              boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
              marginLeft: '10px',
              marginBottom: '20px',
              flexShrink: 1,
              minHeight: '52px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {/* Tail pointing left toward mascot */}
            <div style={{
              position: 'absolute',
              left: '-8px',
              bottom: '14px',
              width: 0,
              height: 0,
              borderTop: '8px solid transparent',
              borderBottom: '8px solid transparent',
              borderRight: '9px solid rgba(15, 25, 40, 0.92)',
            }} />
            <div style={{
              position: 'absolute',
              left: '-10px',
              bottom: '13px',
              width: 0,
              height: 0,
              borderTop: '9px solid transparent',
              borderBottom: '9px solid transparent',
              borderRight: '10px solid rgba(45, 212, 191, 0.3)',
            }} />
            <p style={{
              color: 'white',
              fontSize: 'clamp(13px, 3.2vw, 15px)',
              fontWeight: 600,
              lineHeight: 1.4,
              margin: 0,
              minHeight: '1.4em',
            }}>
              {bubbleText}
              <AnimatePresence>
                {!bubbleDone && (
                  <motion.span
                    key="cursor"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    animate={{ opacity: [1, 0] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                    style={{ color: '#2dd4bf', marginLeft: 1 }}
                  >|</motion.span>
                )}
              </AnimatePresence>
            </p>
          </motion.div>
        </motion.div>

        {/* ── Form card ── */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.35, ease: "easeOut" }}
        >
          <Card className="glass-panel-heavy w-full">
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-white/70 mb-2 ml-1">Choose your nickname</label>
                <Input
                  placeholder="Enter nickname..."
                  value={name}
                  onChange={(e) => { setName(e.target.value); setNameError(""); }}
                  icon={<User className="w-5 h-5" />}
                  maxLength={20}
                  error={nameError || undefined}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-white/70 mb-3 ml-1">Pick your character</label>
                <AvatarPicker selected={avatarId} onSelect={setAvatarId} />
              </div>
              <div className="pt-4 border-t border-white/10 space-y-4">
                <Button size="lg" className="w-full" onClick={() => handleAction('create')}>
                  <Gamepad2 className="w-5 h-5 mr-2" />
                  Create New Room
                </Button>
                <div className="relative flex items-center py-2">
                  <div className="flex-grow border-t border-white/10"></div>
                  <span className="flex-shrink-0 mx-4 text-white/30 text-sm font-medium">OR JOIN EXISTING</span>
                  <div className="flex-grow border-t border-white/10"></div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      placeholder="Room Code"
                      value={roomCode}
                      onChange={(e) => { setRoomCode(e.target.value.toUpperCase()); setCodeError(""); }}
                      icon={<Hash className="w-5 h-5" />}
                      maxLength={6}
                      className="uppercase text-center tracking-widest font-bold"
                      error={codeError || undefined}
                    />
                  </div>
                  <Button variant="secondary" onClick={() => handleAction('join')} className="px-8 self-start">
                    Join
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* ── How it works ── */}
        <motion.div
          className="w-full mt-5"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5, ease: "easeOut" }}
        >
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                icon: (
                  <svg viewBox="0 0 36 36" className="w-8 h-8" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="18" cy="18" r="16" fill="#0d9488" opacity="0.7"/>
                    <circle cx="18" cy="18" r="10" fill="none" stroke="#2dd4bf" strokeWidth="2"/>
                    <circle cx="18" cy="18" r="5" fill="none" stroke="#5eead4" strokeWidth="1.5"/>
                    <circle cx="18" cy="18" r="2" fill="white"/>
                    <line x1="18" y1="2" x2="18" y2="8" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="18" y1="28" x2="18" y2="34" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="2" y1="18" x2="8" y2="18" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="28" y1="18" x2="34" y2="18" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                ),
                step: "1", title: "Pick a topic", desc: "Science, History, Geography — anything"
              },
              {
                icon: (
                  <svg viewBox="0 0 36 36" className="w-8 h-8" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="18" cy="18" r="16" fill="#0e4f5c" opacity="0.8"/>
                    <path d="M18 6 L20.5 14 L29 14 L22.5 19.5 L25 28 L18 23 L11 28 L13.5 19.5 L7 14 L15.5 14 Z" fill="none" stroke="#06b6d4" strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M18 10 L19.8 15.5 L25.5 15.5 L21 19 L22.8 24.5 L18 21 L13.2 24.5 L15 19 L10.5 15.5 L16.2 15.5 Z" fill="#0891b2" opacity="0.5"/>
                    <circle cx="18" cy="18" r="2.5" fill="white"/>
                    <circle cx="18" cy="18" r="1" fill="#67e8f9"/>
                  </svg>
                ),
                step: "2", title: "AI generates", desc: "A question only real experts get right"
              },
              {
                icon: (
                  <svg viewBox="0 0 36 36" className="w-8 h-8" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="18" cy="18" r="16" fill="#78350F" opacity="0.7"/>
                    <path d="M11 28 L11 16 Q11 8 18 6 Q25 8 25 16 L25 28" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M13 28 L13 17 Q13 10 18 9 Q23 10 23 17 L23 28" fill="#F59E0B" opacity="0.25"/>
                    <rect x="9" y="27" width="18" height="2.5" rx="1.25" fill="#F59E0B"/>
                    <rect x="12" y="24" width="12" height="1.5" rx="0.75" fill="#FCD34D" opacity="0.6"/>
                    <circle cx="18" cy="6" r="2.5" fill="#FCD34D"/>
                    <path d="M16 22 L17.5 19 L18 21 L19 18 L20 22" fill="none" stroke="#FCD34D" strokeWidth="1" strokeLinejoin="round"/>
                  </svg>
                ),
                step: "3", title: "Race to answer", desc: "15 seconds. Speed + accuracy = points"
              },
            ].map(({ icon, step, title, desc }) => (
              <div key={step} className="glass-panel rounded-2xl p-3 text-center flex flex-col items-center gap-1.5">
                {icon}
                <p className="text-white text-xs font-bold">{title}</p>
                <p className="text-white/40 text-[10px] leading-snug">{desc}</p>
              </div>
            ))}
          </div>
        </motion.div>

      </div>
    </div>
  );
}
