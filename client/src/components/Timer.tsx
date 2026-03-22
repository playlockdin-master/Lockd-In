import { useEffect, useRef, useState } from "react";
import { formatTime } from "@/lib/utils";
import { useAudioSystem } from "@/hooks/use-audio";

interface TimerProps {
  deadline: number;
  totalTime?: number;
}

const CIRCUMFERENCE = 283; // 2π × r where r ≈ 45 (matches r="45%") at viewBox 100×100

export function Timer({ deadline, totalTime = 25 }: TimerProps) {
  // Whole-second display value — only re-renders once per second
  const [timeLeft, setTimeLeft] = useState(() =>
    Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
  );
  const { playSound } = useAudioSystem();
  const lastTickedRef = useRef<number>(-1);
  const rafRef = useRef<number>(0);
  const arcRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    lastTickedRef.current = -1;
    if (!deadline) return;

    // Drive the arc directly via DOM ref — avoids React re-render overhead
    // and gives frame-accurate positioning with no 1s CSS transition lag.
    function tick() {
      const now = Date.now();
      const msLeft = Math.max(0, deadline - now);
      const secsLeft = Math.ceil(msLeft / 1000);
      const progress = totalTime > 0 ? msLeft / (totalTime * 1000) : 0;
      const offset = CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, progress)));

      // Update arc directly — no setState, no re-render
      if (arcRef.current) {
        arcRef.current.style.strokeDashoffset = String(offset);
      }

      // Whole-second state update (triggers number + colour re-render)
      setTimeLeft(prev => {
        if (prev !== secsLeft) {
          // Play tick sound once per second for last 5s
          if (secsLeft > 0 && secsLeft <= 5 && secsLeft !== lastTickedRef.current) {
            lastTickedRef.current = secsLeft;
            playSound('tick');
          }
          return secsLeft;
        }
        return prev;
      });

      if (msLeft > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [deadline, totalTime, playSound]);

  const isDanger = timeLeft <= 5;

  return (
    <div className="relative flex items-center justify-center w-20 h-20 md:w-24 md:h-24">
      {/* viewBox 100×100 so r="45" gives circumference ≈ 283 */}
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 w-full h-full -rotate-90"
      >
        {/* Track */}
        <circle
          cx="50" cy="50" r="45"
          className="stroke-white/10"
          strokeWidth="8"
          fill="none"
        />
        {/* Progress arc — driven directly via ref */}
        <circle
          ref={arcRef}
          cx="50" cy="50" r="45"
          className={isDanger ? "stroke-destructive" : "stroke-primary"}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          style={{
            strokeDasharray: CIRCUMFERENCE,
            strokeDashoffset: CIRCUMFERENCE,
            willChange: "stroke-dashoffset",
            // stroke colour transition only (not offset — that's frame-driven)
            transition: "stroke 0.3s",
          }}
        />
      </svg>
      <div
        className={`text-2xl md:text-3xl font-display font-bold ${
          isDanger ? "text-destructive animate-pulse" : "text-white"
        }`}
      >
        {formatTime(timeLeft)}
      </div>
    </div>
  );
}
