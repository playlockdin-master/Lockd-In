import { useLocation } from "wouter";
import { ParticleBackground } from "@/components/ParticleBackground";
import { Button } from "@/components/Button";
import { FlooqLogo } from "@/components/FlooqLogo";
import { motion } from "framer-motion";
import { Ban, Home } from "lucide-react";

export default function Kicked() {
  const [, setLocation] = useLocation();

  const params = new URLSearchParams(window.location.search);
  const reason = params.get("reason") ?? "The host removed you from the room.";

  return (
    <div className="relative flex flex-col items-center justify-center text-center px-4" style={{ minHeight: '100dvh' }}>
      <ParticleBackground />

      <motion.div
        className="relative z-10 flex flex-col items-center gap-6 max-w-sm w-full"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <FlooqLogo size="lg" />

        <div className="w-20 h-20 rounded-full bg-red-500/15 flex items-center justify-center">
          <Ban className="w-10 h-10 text-red-400" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-display font-bold text-white">
            You were kicked
          </h1>
          <p className="text-white/50 text-base max-w-xs">
            {reason}
          </p>
        </div>

        <Button size="lg" className="w-full" onClick={() => {
          window.history.replaceState(null, '', '/');
          setLocation('/');
        }}>
          <Home className="w-5 h-5 mr-2" />
          Back to Lobby
        </Button>
      </motion.div>
    </div>
  );
}
