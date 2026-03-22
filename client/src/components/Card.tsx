import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { forwardRef } from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Override framer-motion animation props if needed */
  initial?: object;
  animate?: object;
  exit?: object;
  transition?: object;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, initial, animate, exit, transition, ...htmlProps }, ref) => {
    return (
      <motion.div
        ref={ref}
        initial={initial ?? { opacity: 0, y: 20 }}
        animate={animate ?? { opacity: 1, y: 0 }}
        exit={exit ?? { opacity: 0, y: -20 }}
        transition={transition}
        className={cn(
          "glass-panel rounded-3xl p-6 md:p-8 w-full max-w-md mx-auto relative overflow-hidden",
          className
        )}
        {...(htmlProps as React.HTMLAttributes<HTMLDivElement>)}
      >
        {/* Subtle top highlight */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        {children}
      </motion.div>
    );
  }
);
Card.displayName = "Card";
