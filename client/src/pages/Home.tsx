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
      const msg = sessionStorage.getItem('flooq_kicked');
      if (msg) {
        setKickedMessage(msg);
        sessionStorage.removeItem('flooq_kicked');
      }
    } catch {}
  }, []);
  const { playSound } = useAudioSystem();

  const handleAction = (action: 'create' | 'join') => {
    setNameError("");
    setCodeError("");

    const nameErr = validatePlayerName(name);
    if (nameErr) {
      setNameError(nameErr);
      return;
    }

    if (action === 'join') {
      const trimmedCode = roomCode.trim();
      if (!trimmedCode) {
        setCodeError("Room code is required");
        return;
      }
      if (!/^[A-Z0-9]{4,8}$/.test(trimmedCode)) {
        setCodeError("Room code must be 4–8 characters");
        return;
      }
    }

    playSound('click');
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 200,
              background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
            }}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 24 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
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
              <p className="text-white/55 text-sm mb-6 leading-relaxed">
                {kickedMessage}
              </p>
              <Button className="w-full" onClick={() => setKickedMessage(null)}>
                Back to Lobby
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 w-full">
        {/* Logo */}
        <motion.div
          className="text-center mb-6 md:mb-10"
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          {/* Flooq Logo — icon + wordmark */}
          <div className="inline-flex items-center gap-4 md:gap-6">
            {/* F icon with orbiting dot */}
            <div className="relative flex-shrink-0" style={{ width: 64, height: 64 }}>
              <svg viewBox="0 0 80 80" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="flooqArc" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#A855F7"/>
                    <stop offset="100%" stopColor="#3B82F6"/>
                  </linearGradient>
                </defs>
                {/* Purple circle bg */}
                <circle cx="40" cy="40" r="38" fill="#5B21B6"/>
                {/* Arc track */}
                <circle cx="40" cy="40" r="30" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5"/>
                {/* Arc fill — static 75%, no rotation animation on the arc itself */}
                <circle cx="40" cy="40" r="30" fill="none" stroke="white" strokeWidth="2.5"
                  strokeDasharray="141 47" strokeLinecap="round"
                  transform="rotate(-90 40 40)"
                />
                {/* Orbiting dot — uses SVG animateTransform which is reliable */}
                <circle cx="40" cy="10" r="4.5" fill="white">
                  <animateTransform attributeName="transform" type="rotate"
                    from="0 40 40" to="360 40 40" dur="6s" repeatCount="indefinite"/>
                </circle>
                {/* F mark — white */}
                <rect x="29" y="23" width="4.5" height="34" rx="2" fill="white"/>
                <rect x="29" y="23" width="22" height="4.5" rx="2" fill="white"/>
                <rect x="29" y="37" width="16" height="4.5" rx="2" fill="white"/>
              </svg>
            </div>

            {/* Wordmark */}
            <div className="flex flex-col items-start gap-1">
              <h1 className="font-display font-black tracking-tighter leading-none" style={{ fontSize: 'clamp(52px, 10vw, 88px)', letterSpacing: '-3px' }}>
                <span className="text-white">f</span>
                <span className="text-primary text-glow">l</span>
                <span className="text-white">oo</span>
                <span className="text-primary text-glow">q</span>
              </h1>
              <div className="h-0.5 w-full rounded-full" style={{ background: 'linear-gradient(90deg, #A855F7, #3B82F6)' }}/>
              <p className="text-white/35 font-medium tracking-widest uppercase" style={{ fontSize: '10px', letterSpacing: '4px' }}>
                Choose your topic
              </p>
            </div>
          </div>
        </motion.div>

        <Card className="glass-panel-heavy max-w-md mx-auto w-full">
          <div className="space-y-5">
            {/* Nickname */}
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

            {/* Avatar picker */}
            <div>
              <label className="block text-sm font-semibold text-white/70 mb-3 ml-1">Pick your character</label>
              <AvatarPicker selected={avatarId} onSelect={setAvatarId} />
            </div>

            {/* Join / Create */}
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

        {/* How it works — 3 steps */}
        <motion.div
          className="max-w-md mx-auto w-full mt-6 md:mt-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4, ease: "easeOut" }}
        >
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                icon: (
                  <svg viewBox="0 0 36 36" className="w-8 h-8" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="18" cy="18" r="16" fill="#5B21B6" opacity="0.7"/>
                    <circle cx="18" cy="18" r="10" fill="none" stroke="#A855F7" strokeWidth="2"/>
                    <circle cx="18" cy="18" r="5" fill="none" stroke="#C084FC" strokeWidth="1.5"/>
                    <circle cx="18" cy="18" r="2" fill="white"/>
                    <line x1="18" y1="2" x2="18" y2="8" stroke="#A855F7" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="18" y1="28" x2="18" y2="34" stroke="#A855F7" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="2" y1="18" x2="8" y2="18" stroke="#A855F7" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="28" y1="18" x2="34" y2="18" stroke="#A855F7" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                ),
                step: "1", title: "Pick a topic", desc: "Science, History, Geography — anything"
              },
              {
                icon: (
                  <svg viewBox="0 0 36 36" className="w-8 h-8" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="18" cy="18" r="16" fill="#1E3A5F" opacity="0.7"/>
                    <path d="M18 6 L20.5 14 L29 14 L22.5 19.5 L25 28 L18 23 L11 28 L13.5 19.5 L7 14 L15.5 14 Z" fill="none" stroke="#60A5FA" strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M18 10 L19.8 15.5 L25.5 15.5 L21 19 L22.8 24.5 L18 21 L13.2 24.5 L15 19 L10.5 15.5 L16.2 15.5 Z" fill="#3B82F6" opacity="0.5"/>
                    <circle cx="18" cy="18" r="2.5" fill="white"/>
                    <circle cx="18" cy="18" r="1" fill="#60A5FA"/>
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

