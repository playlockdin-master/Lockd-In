import { useEffect, useRef, useState } from "react";
import { formatTime } from "@/lib/utils";
import { useAudioSystem } from "@/hooks/use-audio";

interface TimerProps {
  deadline: number;
  onExpire?: () => void;
  totalTime?: number;
}

export function Timer({ deadline, onExpire, totalTime = 15 }: TimerProps) {
  const [timeLeft, setTimeLeft] = useState(() => Math.max(0, Math.floor((deadline - Date.now()) / 1000)));
  const { playSound } = useAudioSystem();
  const lastTickedRef = useRef<number>(-1);
  
  useEffect(() => {
    lastTickedRef.current = -1; // reset on new deadline
    if (!deadline) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      setTimeLeft(remaining);

      // Tick sound for last 5 seconds — only once per second
      if (remaining > 0 && remaining <= 5 && remaining !== lastTickedRef.current) {
        lastTickedRef.current = remaining;
        playSound('tick');
      }

      if (remaining === 0) {
        clearInterval(interval);
        onExpire?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [deadline, onExpire, playSound]);

  const progress = totalTime ? (timeLeft / totalTime) * 100 : 100;
  const isDanger = timeLeft <= 5;

  return (
    <div className="relative flex items-center justify-center w-20 h-20 md:w-24 md:h-24">
      {/* SVG Circle Timer */}
      <svg className="absolute inset-0 w-full h-full transform -rotate-90">
        <circle
          cx="50%"
          cy="50%"
          r="45%"
          className="stroke-white/10"
          strokeWidth="8"
          fill="none"
        />
        <circle
          cx="50%"
          cy="50%"
          r="45%"
          className={isDanger ? "stroke-destructive" : "stroke-primary"}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          style={{
            strokeDasharray: 283,
            strokeDashoffset: 283 * (1 - progress / 100),
            transition: "stroke-dashoffset 1s linear, stroke 0.3s",
            willChange: "stroke-dashoffset",
          }}
        />
      </svg>
      <div className={`text-2xl md:text-3xl font-display font-bold ${isDanger ? 'text-destructive animate-pulse' : 'text-white'}`}>
        {formatTime(timeLeft)}
      </div>
    </div>
  );
}
