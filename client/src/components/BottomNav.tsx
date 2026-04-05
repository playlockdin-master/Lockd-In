import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Home, Trophy, BarChart2, User } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const tabs = [
  { path: "/",            icon: Home,      label: "Home"        },
  { path: "/leaderboard", icon: Trophy,    label: "Leaderboard" },
  { path: "/dashboard",   icon: BarChart2, label: "Stats",      isStats: true },
  { path: "/dashboard",   icon: User,      label: "Profile",    isProfile: true },
];

export function BottomNav() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();

  // Don't show in game rooms
  if (location.startsWith("/room/") || location === "/kicked") return null;

  const isActive = (path: string, isProfile?: boolean, isStats?: boolean) => {
    if (isProfile || isStats) return location === "/dashboard";
    if (path === "/") return location === "/";
    return location.startsWith(path);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
      style={{
        background: "rgba(8, 16, 20, 0.92)",
        borderTop: "1px solid rgba(45, 212, 191, 0.12)",
        backdropFilter: "blur(20px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="flex items-center justify-around px-2 pt-2 pb-2">
        {tabs.map(({ path, icon: Icon, label, isProfile, isStats }) => {
          const active = isActive(path, isProfile, isStats);
          const navigateTo = (isProfile || isStats) ? "/dashboard" : path;
          const showGuestDot = !user && (isProfile || isStats);

          return (
            <button
              key={label}
              onClick={() => setLocation(navigateTo)}
              className="relative flex flex-col items-center gap-1 px-4 py-1 rounded-xl transition-all"
              style={{ minWidth: 56 }}
            >
              {/* Active pill background */}
              {active && (
                <motion.div
                  layoutId="tab-active-bg"
                  className="absolute inset-0 rounded-xl"
                  style={{ background: "rgba(45, 212, 191, 0.1)", border: "1px solid rgba(45, 212, 191, 0.2)" }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}

              {/* Profile tab: show avatar initials or user icon */}
              {isProfile && user ? (
                <div
                  className="relative w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
                  style={{
                    background: active ? "rgba(45,212,191,0.3)" : "rgba(255,255,255,0.12)",
                    color: active ? "#2dd4bf" : "rgba(255,255,255,0.4)",
                    border: active ? "1px solid rgba(45,212,191,0.5)" : "1px solid rgba(255,255,255,0.15)",
                  }}
                >
                  {user.username.slice(0, 2).toUpperCase()}
                </div>
              ) : (
                <Icon
                  className="relative w-5 h-5 transition-colors"
                  style={{ color: active ? "#2dd4bf" : "rgba(255,255,255,0.35)" }}
                  strokeWidth={active ? 2.2 : 1.8}
                />
              )}

              {/* Dot nudge for guests on stats/profile tabs */}
              {showGuestDot && (
                <span
                  className="absolute top-1 right-3 w-1.5 h-1.5 rounded-full"
                  style={{ background: "#2dd4bf" }}
                />
              )}

              <span
                className="relative text-[10px] font-semibold transition-colors"
                style={{
                  color: active ? "#2dd4bf" : "rgba(255,255,255,0.3)",
                  letterSpacing: "0.02em",
                }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
