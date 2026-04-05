import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ParticleBackground } from "@/components/ParticleBackground";
import { AvatarPicker } from "@/components/Avatar";
import { CheckCircle, XCircle, Loader2, User } from "lucide-react";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

type AvailStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export default function UsernameSetup() {
  const [, setLocation] = useLocation();
  const [username, setUsername]   = useState("");
  const [avatarId, setAvatarId]   = useState("ghost");
  const [status, setStatus]       = useState<AvailStatus>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedUsername = useDebounce(username.trim(), 500);

  // Validate locally first, then check server
  useEffect(() => {
    const name = debouncedUsername;
    if (!name) { setStatus("idle"); return; }
    if (name.length < 2) { setStatus("invalid"); return; }
    if (name.length > 20) { setStatus("invalid"); return; }
    if (!/[a-zA-Z]/.test(name)) { setStatus("invalid"); return; }

    setStatus("checking");
    fetch(`/auth/check-username?username=${encodeURIComponent(name)}`)
      .then(r => r.json())
      .then(d => setStatus(d.available ? "available" : "taken"))
      .catch(() => setStatus("idle"));
  }, [debouncedUsername]);

  const localError = (): string | null => {
    const t = username.trim();
    if (!t) return null;
    if (t.length < 2) return "At least 2 characters required";
    if (t.length > 20) return "Maximum 20 characters";
    if (!/[a-zA-Z]/.test(t)) return "Must contain at least one letter";
    return null;
  };

  const canSubmit = status === "available" && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setServerError("");
    try {
      const res = await fetch("/auth/complete-signup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), avatarId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data.error || "Something went wrong.");
        if (res.status === 409) setStatus("taken");
        setSubmitting(false);
        return;
      }
      // Reload to re-fetch auth state
      window.location.href = "/";
    } catch {
      setServerError("Network error. Please try again.");
      setSubmitting(false);
    }
  };

  const statusIcon = () => {
    if (status === "checking") return <Loader2 className="w-4 h-4 text-white/40 animate-spin" />;
    if (status === "available") return <CheckCircle className="w-4 h-4 text-teal-400" />;
    if (status === "taken" || status === "invalid") return <XCircle className="w-4 h-4 text-red-400" />;
    return null;
  };

  const statusMessage = () => {
    const err = localError();
    if (err) return <span className="text-red-400">{err}</span>;
    if (status === "checking") return <span className="text-white/40">Checking…</span>;
    if (status === "available") return <span className="text-teal-400">✓ Available!</span>;
    if (status === "taken") return <span className="text-red-400">Already taken — try another</span>;
    return null;
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4">
      <ParticleBackground />

      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 w-full max-w-sm"
      >
        <div className="glass-panel-heavy rounded-3xl p-7 border border-teal-500/15 flex flex-col gap-6">

          {/* Header */}
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mx-auto mb-4">
              <User className="w-6 h-6 text-teal-400" />
            </div>
            <h1 className="text-2xl font-display font-black text-white mb-1">Pick your username</h1>
            <p className="text-white/40 text-sm leading-relaxed">
              This is permanent and unique — choose wisely!
            </p>
          </div>

          {/* Username input */}
          <div>
            <div className="relative">
              <input
                ref={inputRef}
                autoFocus
                type="text"
                maxLength={20}
                value={username}
                onChange={e => {
                  setUsername(e.target.value);
                  setStatus("idle");
                  setServerError("");
                }}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                placeholder="e.g. QuizMaster99"
                className="w-full bg-white/5 border border-white/10 focus:border-teal-400/50 rounded-xl px-4 py-3 pr-10 text-white placeholder-white/25 text-sm font-semibold outline-none transition-colors"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {statusIcon()}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {(localError() || (status !== "idle" && status !== "checking")) && (
                <motion.div
                  key={status + localError()}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-1.5 ml-1 text-xs"
                >
                  {statusMessage()}
                </motion.div>
              )}
            </AnimatePresence>

            {serverError && (
              <p className="mt-1.5 ml-1 text-xs text-red-400">{serverError}</p>
            )}

            <p className="mt-1.5 ml-1 text-[10px] text-white/25">
              Cannot be changed later · 2–20 characters
            </p>
          </div>

          {/* Avatar picker */}
          <div>
            <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Pick your character</p>
            <AvatarPicker selected={avatarId} onSelect={setAvatarId} />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`w-full py-3 rounded-2xl text-sm font-bold tracking-wide transition-all ${
              canSubmit
                ? "bg-teal-500/20 border border-teal-400/40 hover:border-teal-400/70 hover:bg-teal-500/30 text-teal-300"
                : "bg-white/5 border border-white/10 text-white/25 cursor-not-allowed"
            }`}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Creating account…
              </span>
            ) : (
              "Let's go! 🚀"
            )}
          </button>

        </div>
      </motion.div>
    </div>
  );
}
