import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

interface Props {
  onDone: () => void;
}

export function RoomSplash({ onDone }: Props) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
    }, 1600);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence onExitComplete={onDone}>
      {visible && (
        <motion.div
          key="splash"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{
            background: "radial-gradient(ellipse at center, rgba(109,40,217,0.25) 0%, rgba(7,7,14,0.98) 70%)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
          }}
        >
          {/* Particle ring */}
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: [0.6, 1.15, 1], opacity: [0, 0.4, 0] }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="absolute w-72 h-72 rounded-full border border-primary/40"
          />
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: [0.6, 1.4, 1.2], opacity: [0, 0.2, 0] }}
            transition={{ duration: 1.4, ease: "easeOut", delay: 0.1 }}
            className="absolute w-72 h-72 rounded-full border border-accent/30"
          />

          {/* Logo */}
          <div className="flex flex-col items-center gap-4 select-none">
            <motion.div
              initial={{ scale: 0.5, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
              className="relative"
            >
              <h1 className="text-6xl md:text-8xl font-display font-black tracking-tighter text-white leading-none inline-flex items-center">
                <span>LOCK</span>
                <motion.span
                  initial={{ opacity: 0, rotate: 0 }}
                  animate={{ opacity: 1, rotate: 15 }}
                  transition={{ delay: 0.25, duration: 0.3 }}
                  className="text-primary mx-0.5 md:mx-1"
                  style={{ display: 'inline-block', transform: 'rotate(15deg) skewX(-8deg)', transformOrigin: 'center' }}
                >
                  D
                </motion.span>
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35, duration: 0.3 }}
                  className="inline-block bg-primary text-white px-3 py-0.5 rounded-xl md:rounded-2xl"
                  style={{ boxShadow: "0 0 40px rgba(168,85,247,0.7)" }}
                >
                  IN
                </motion.span>
              </h1>
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55, duration: 0.4 }}
              className="text-white/50 text-base md:text-lg font-medium tracking-widest uppercase"
            >
              Get ready to play
            </motion.p>

            {/* Loading dots */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="flex gap-1.5 mt-2"
            >
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15 }}
                  className="w-2 h-2 rounded-full bg-primary"
                />
              ))}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
