import { useEffect, useState } from 'react';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
}

// Pure CSS animated particles — no framer-motion, GPU-composited only
// Uses transform+opacity which never trigger layout or paint
export function ParticleBackground() {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    // Fewer particles on mobile for perf, none on very small screens
    const count = isMobile ? 8 : 20;
    const pts: Particle[] = [];
    for (let i = 0; i < count; i++) {
      pts.push({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 2.5 + 1.5,
        duration: Math.random() * 18 + 14,
        delay: -(Math.random() * 20),   // negative delay = already mid-flight on load
        opacity: Math.random() * 0.25 + 0.1,
      });
    }
    setParticles(pts);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden>
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full bg-white will-change-transform"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            opacity: p.opacity,
            animation: `particleFloat ${p.duration}s linear ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
