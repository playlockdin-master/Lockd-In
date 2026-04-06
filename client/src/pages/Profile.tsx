import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { ParticleBackground } from "@/components/ParticleBackground";
import { Avatar, AvatarPicker } from "@/components/Avatar";
import { LogOut, User, Shield, ArrowLeft } from "lucide-react";
import { useState } from "react";

export default function Profile() {
  const [, setLocation] = useLocation();
  const { user, loading, login, logout } = useAuth();
  const [avatarId, setAvatarId] = useState(user?.avatarId ?? "ghost");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (loading) return null;

  // Guest view
  if (!user) {
    return (
      <div className="relative min-h-screen p-4 pb-24 md:pb-10 flex items-center justify-center">
        <ParticleBackground />
        <motion.div
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          className="relative z-10 w-full max-w-sm text-center"
        >
          <div className="glass-panel-heavy rounded-3xl p-8 flex flex-col items-center gap-5 border border-teal-500/15">
            <div className="w-16 h-16 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
              <User className="w-7 h-7 text-teal-400" />
            </div>
            <div>
              <h2 className="text-xl font-display font-black text-white mb-2">Your Profile</h2>
              <p className="text-white/45 text-sm leading-relaxed">Sign in with Google to save your avatar, username, and account details.</p>
            </div>
            <button
              onClick={login}
              className="w-full flex items-center justify-center gap-3 py-3 px-5 rounded-2xl border border-white/15 hover:border-teal-400/40 text-white/80 hover:text-white text-sm font-semibold transition-all glass-panel"
            >
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </button>
            <button onClick={() => setLocation("/")} className="text-white/30 hover:text-white/60 text-xs transition-colors">
              Back to home
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const handleSaveAvatar = async () => {
    if (avatarId === user.avatarId) return;
    setSaving(true);
    try {
      await fetch("/api/player/avatar", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarId }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative min-h-screen p-4 pb-24 md:pb-10">
      <ParticleBackground />

      <div className="relative z-10 max-w-md mx-auto">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-6 pt-2"
        >
          <button
            onClick={() => setLocation("/")}
            className="hidden md:flex p-2 rounded-xl glass-panel text-white/50 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-display font-black text-white leading-tight">Profile</h1>
            <p className="text-white/40 text-xs">Manage your account</p>
          </div>
        </motion.div>

        {/* Identity card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-panel rounded-2xl p-5 mb-4 flex items-center gap-4"
        >
          <Avatar avatarId={user.avatarId} mood="idle" streak={0} isLeader={false} size={56} />
          <div className="flex-1 min-w-0">
            <div className="text-white font-display font-black text-lg leading-tight truncate">{user.username}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <Shield className="w-3 h-3 text-teal-400" />
              <span className="text-teal-400/80 text-xs font-medium">Google account linked</span>
            </div>
          </div>
        </motion.div>

        {/* Avatar picker */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass-panel rounded-2xl p-5 mb-4"
        >
          <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Change Avatar</h2>
          <AvatarPicker selected={avatarId} onSelect={setAvatarId} />
          {avatarId !== user.avatarId && (
            <motion.button
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={handleSaveAvatar}
              disabled={saving}
              className="mt-4 w-full py-2.5 rounded-xl bg-teal-500/20 border border-teal-400/30 hover:border-teal-400/60 text-teal-300 text-sm font-semibold transition-all"
            >
              {saving ? "Saving…" : saved ? "✓ Saved!" : "Save Avatar"}
            </motion.button>
          )}
        </motion.div>

        {/* Sign out */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-panel rounded-2xl p-5"
        >
          <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Account</h2>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl border border-red-500/20 hover:border-red-400/50 hover:bg-red-500/10 text-red-400 hover:text-red-300 text-sm font-semibold transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </motion.div>

      </div>
    </div>
  );
}
