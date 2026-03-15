import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { Swords } from "lucide-react";

interface Props {
  round: number;
  totalRounds?: number;
  selectorName: string;
  visible: boolean;
  onDone: () => void;
}

export function RoundTransition({ round, totalRounds, selectorName, visible, onDone }: Props) {
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [visible, onDone]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="round-transition"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[90] flex items-center justify-center"
          style={{
            background: "radial-gradient(ellipse at center, rgba(109,40,217,0.18) 0%, rgba(7,7,14,0.85) 70%)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
        >
          <div className="flex flex-col items-center gap-4 select-none">
            {/* Round pill */}
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 280, damping: 22 }}
              className="px-5 py-2 rounded-full bg-primary/20 border border-primary/40 text-primary font-bold text-sm tracking-widest uppercase"
            >
              Round {round}{totalRounds ? ` of ${totalRounds}` : ""}
            </motion.div>

            {/* Big icon */}
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 250, damping: 18 }}
            >
              <Swords className="w-14 h-14 md:w-20 md:h-20 text-white/80" />
            </motion.div>

            {/* Selector name */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="text-center"
            >
              <p className="text-white/50 text-sm md:text-base uppercase tracking-widest mb-1">Topic chosen by</p>
              <p className="text-white font-display font-black text-2xl md:text-4xl">{selectorName}</p>
            </motion.div>

            {/* Animated bar sweeping across */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.5, duration: 1.4, ease: "easeInOut" }}
              className="w-48 md:w-64 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent origin-left"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
