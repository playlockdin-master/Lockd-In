import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { motion, type HTMLMotionProps } from "framer-motion";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}

// Separate out the motion-only props we want to forward
const MotionButton = motion.button;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, onClick, type, ...rest }, ref) => {

    const variants = {
      primary: "bg-gradient-to-r from-primary to-purple-600 text-white shadow-lg shadow-primary/25 border border-primary/50 hover:shadow-primary/40",
      secondary: "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg shadow-blue-500/25 border border-blue-500/50 hover:shadow-blue-500/40",
      outline: "glass-panel text-white hover:bg-white/10",
      ghost: "bg-transparent text-white/70 hover:text-white hover:bg-white/10",
      danger: "bg-destructive/80 text-white backdrop-blur-md border border-destructive hover:bg-destructive shadow-lg shadow-destructive/20",
      success: "bg-success/80 text-white backdrop-blur-md border border-success hover:bg-success shadow-lg shadow-success/20",
    };

    const sizes = {
      sm: "px-3 py-1.5 text-sm rounded-lg",
      md: "px-6 py-3 text-base rounded-xl font-semibold",
      lg: "px-8 py-4 text-lg rounded-2xl font-bold",
      icon: "p-3 rounded-xl",
    };

    const isDisabled = disabled || isLoading;

    return (
      <MotionButton
        ref={ref}
        type={type}
        disabled={isDisabled}
        onClick={onClick}
        whileHover={{ scale: isDisabled ? 1 : 1.02, y: isDisabled ? 0 : -2 }}
        whileTap={{ scale: isDisabled ? 1 : 0.98 }}
        className={cn(
          "relative flex items-center justify-center transition-all duration-200 overflow-hidden group",
          variants[variant],
          sizes[size],
          isDisabled && "opacity-50 cursor-not-allowed transform-none hover:shadow-none",
          className
        )}
        aria-disabled={isDisabled}
      >
        {/* Shimmer effect for primary/secondary */}
        {(variant === 'primary' || variant === 'secondary') && !isDisabled && (
          <div className="absolute inset-0 w-full h-full shimmer-effect rounded-inherit" />
        )}

        {isLoading ? (
          <div className="flex items-center gap-2">
            <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Loading...
          </div>
        ) : (
          children
        )}
      </MotionButton>
    );
  }
);
Button.displayName = "Button";
