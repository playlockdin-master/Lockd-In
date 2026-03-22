import { useLocation } from "wouter";
import { ParticleBackground } from "@/components/ParticleBackground";
import { Button } from "@/components/Button";
import { FlooqLogo } from "@/components/FlooqLogo";
import { motion } from "framer-motion";
import { Home } from "lucide-react";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="relative flex flex-col items-center justify-center text-center px-4" style={{ minHeight: '100dvh' }}>
      <ParticleBackground />

      <motion.div
        className="relative z-10 flex flex-col items-center gap-6"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <FlooqLogo size="lg" />

        {/* 404 number */}
        <div className="relative">
          <div className="text-[120px] md:text-[180px] font-display font-black leading-none"
            style={{ color: 'transparent', WebkitTextStroke: '2px rgba(168,85,247,0.3)' }}>
            404
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[120px] md:text-[180px] font-display font-black leading-none"
              style={{ color: 'transparent', WebkitTextStroke: '1px rgba(168,85,247,0.15)',
                backgroundImage: 'linear-gradient(135deg, #A855F7 0%, #3B82F6 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              404
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-display font-bold text-white">
            Room not found
          </h1>
          <p className="text-white/50 text-base max-w-xs">
            This page doesn't exist — maybe the room expired, or the link is wrong.
          </p>
        </div>

        <Button size="lg" onClick={() => setLocation('/')}>
          <Home className="w-5 h-5 mr-2" />
          Back to Flooq
        </Button>
      </motion.div>
    </div>
  );
}
