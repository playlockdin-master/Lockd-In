import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ActiveReaction {
  id: string;
  emoji: string;
  x: number;
}

const REACTION_SVGS: Record<string, React.ReactElement> = {
  '👍': (
    <svg viewBox="0 0 48 48" className="w-full h-full drop-shadow-lg" xmlns="http://www.w3.org/2000/svg" fill="none">
      <circle cx="24" cy="24" r="22" fill="#1E3A5F" opacity="0.7"/>
      <path d="M14 43V22M5 26v14a4 4 0 004 4h23a4 4 0 003.94-3.32l2.4-14A4 4 0 0034.4 22H26V12a6 6 0 00-6-6L14 22z" stroke="#60A5FA" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  '😂': (
    <svg viewBox="0 0 48 48" className="w-full h-full drop-shadow-lg" xmlns="http://www.w3.org/2000/svg" fill="none">
      <circle cx="24" cy="24" r="22" fill="#78350F" opacity="0.7"/>
      <circle cx="24" cy="24" r="18" stroke="#FCD34D" strokeWidth="2.5"/>
      <path d="M16 27s2 6 8 6 8-6 8-6" stroke="#FCD34D" strokeWidth="3" strokeLinecap="round"/>
      <circle cx="18" cy="20" r="2" fill="#FCD34D"/>
      <circle cx="30" cy="20" r="2" fill="#FCD34D"/>
      <path d="M14 23c1-2 3-3 4-2M34 23c-1-2-3-3-4-2" stroke="#FCD34D" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  '🔥': (
    <svg viewBox="0 0 48 48" className="w-full h-full drop-shadow-lg" xmlns="http://www.w3.org/2000/svg" fill="none">
      <circle cx="24" cy="24" r="22" fill="#7C2D12" opacity="0.7"/>
      <path d="M24 6c0 0-10 9-10 18a10 10 0 0020 0c0-4-2-7-4-9 0 3-2 5-4 5 1-2 2-7-2-14z" stroke="#F97316" strokeWidth="2" strokeLinejoin="round" fill="#F97316" fillOpacity="0.3"/>
      <path d="M24 28c0 0-5 3-5 7a5 5 0 0010 0C29 31 24 28 24 28z" fill="#FCD34D" stroke="#F97316" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  '🤯': (
    <svg viewBox="0 0 48 48" className="w-full h-full drop-shadow-lg" xmlns="http://www.w3.org/2000/svg" fill="none">
      <circle cx="24" cy="24" r="22" fill="#4C1D95" opacity="0.7"/>
      <circle cx="24" cy="26" r="14" stroke="#C084FC" strokeWidth="2.5"/>
      <circle cx="19" cy="24" r="2" fill="#C084FC"/>
      <circle cx="29" cy="24" r="2" fill="#C084FC"/>
      <path d="M19 32s1.5-3 5-3 5 3 5 3" stroke="#C084FC" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M18 14l2 4M24 11v4M30 14l-2 4" stroke="#C084FC" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M15 17l3 3M33 17l-3 3" stroke="#C084FC" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
};

export function ReactionOverlay() {
  const [reactions, setReactions] = useState<ActiveReaction[]>([]);

  useEffect(() => {
    const handleReaction = (e: CustomEvent<{ playerId: string; emoji: string }>) => {
      const newReaction = {
        id: Math.random().toString(36).substr(2, 9),
        emoji: e.detail.emoji,
        x: Math.random() * 80 + 10,
      };

      setReactions(prev => [...prev, newReaction]);

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
            className="absolute w-16 h-16 md:w-24 md:h-24"
            style={{ left: `${r.x}%`, bottom: '-10%' }}
          >
            {REACTION_SVGS[r.emoji] ?? <span className="text-5xl">{r.emoji}</span>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
