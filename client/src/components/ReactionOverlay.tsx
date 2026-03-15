import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ActiveReaction {
  id: string;
  emoji: string;
  x: number;
}

export function ReactionOverlay() {
  const [reactions, setReactions] = useState<ActiveReaction[]>([]);

  useEffect(() => {
    const handleReaction = (e: CustomEvent<{ playerId: string; emoji: string }>) => {
      const newReaction = {
        id: Math.random().toString(36).substr(2, 9),
        emoji: e.detail.emoji,
        x: Math.random() * 80 + 10, // 10% to 90% width
      };

      setReactions(prev => [...prev, newReaction]);

      // Remove after animation
      setTimeout(() => {
        setReactions(prev => prev.filter(r => r.id !== newReaction.id));
      }, 2000);
    };

    window.addEventListener('player-reaction' as any, handleReaction);
    return () => window.removeEventListener('player-reaction' as any, handleReaction);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      <AnimatePresence>
        {reactions.map(r => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: '100vh', scale: 0.5 }}
            animate={{ opacity: [0, 1, 1, 0], y: '-20vh', scale: [0.5, 1.5, 2, 1] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2, ease: "easeOut" }}
            className="absolute text-5xl md:text-7xl filter drop-shadow-lg"
            style={{ left: `${r.x}%`, bottom: '-10%' }}
          >
            {r.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
