import { useState } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { ParticleBackground } from "@/components/ParticleBackground";
import { AudioController } from "@/components/AudioController";
import { AvatarPicker } from "@/components/Avatar";
import { motion } from "framer-motion";
import { Gamepad2, Hash, User } from "lucide-react";
import { useAudioSystem } from "@/hooks/use-audio";
import { validatePlayerName } from "@/lib/validate";

export default function Home() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [avatarId, setAvatarId] = useState("ghost");
  const [roomCode, setRoomCode] = useState("");
  const [nameError, setNameError] = useState("");
  const [codeError, setCodeError] = useState("");
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
              { icon: "🎯", step: "1", title: "Pick a topic", desc: "Chess, Bollywood, Brawlhalla — anything" },
              { icon: "⚡", step: "2", title: "AI generates", desc: "A question only real fans get right" },
              { icon: "🏆", step: "3", title: "Race to answer", desc: "15 seconds. Speed + accuracy = points" },
            ].map(({ icon, step, title, desc }) => (
              <div key={step} className="glass-panel rounded-2xl p-3 text-center flex flex-col items-center gap-1.5">
                <span className="text-2xl">{icon}</span>
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

