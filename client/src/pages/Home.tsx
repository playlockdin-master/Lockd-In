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
          <h1 className="text-5xl md:text-8xl font-display font-black tracking-tighter text-white mb-2 relative inline-flex items-center">
            <span>LOCK</span>
            <span
              className="inline-block text-primary mx-0.5 md:mx-1 text-glow"
              style={{ transform: 'rotate(15deg) skewX(-8deg)', transformOrigin: 'center' }}
            >
              D
            </span>
            <span className="inline-block bg-primary text-white px-3 md:px-4 py-0.5 md:py-1 rounded-xl md:rounded-2xl box-glow logo-shine">
              IN
            </span>
          </h1>
          <p className="text-base md:text-2xl text-white/60 font-medium tracking-wide mt-2 md:mt-4">
            Clock in, Lock in.
          </p>
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
      </div>
    </div>
  );
}

