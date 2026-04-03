import { useEffect, useState } from 'react';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
  color: string;
}

// Qotion brand particle colors — teal/cyan palette
const PARTICLE_COLORS = [
  'rgba(45,212,191,1)',   // teal-400
  'rgba(6,182,212,1)',    // cyan-500
  'rgba(94,234,212,1)',   // teal-300
  'rgba(103,232,249,1)',  // cyan-300
  'rgba(255,255,255,1)',  // white
];

// Pure CSS animated particles — no framer-motion, GPU-composited only
// Uses transform+opacity which never trigger layout or paint
export function ParticleBackground() {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const isMobile = window.innerWidth < 768;
    const count = isMobile ? 8 : 22;
    const pts: Particle[] = [];
    for (let i = 0; i < count; i++) {
      pts.push({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 2.5 + 1,
        duration: Math.random() * 18 + 14,
        delay: -(Math.random() * 20),
        opacity: Math.random() * 0.35 + 0.08,
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      });
    }
    setParticles(pts);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden>
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full will-change-transform"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            opacity: p.opacity,
            backgroundColor: p.color,
            animation: `particleFloat ${p.duration}s linear ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
