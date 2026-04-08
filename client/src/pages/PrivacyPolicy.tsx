import { useLocation } from "wouter";
import { ParticleBackground } from "@/components/ParticleBackground";
import { Button } from "@/components/Button";
import { QotionLogo } from "@/components/QotionLogo";
import { motion } from "framer-motion";
import { Home, Mail, Shield, Database, Cookie, ExternalLink, Trash2, Lock, Baby, RefreshCw } from "lucide-react";

const EFFECTIVE_DATE = "April 8, 2025";

export default function PrivacyPolicy() {
  const [, setLocation] = useLocation();

  return (
    <div className="relative min-h-screen px-4 pb-24 pt-8">
      <ParticleBackground />

      <div className="relative z-10 max-w-2xl mx-auto">
        {/* Header */}
        <motion.div
          className="flex flex-col items-center gap-4 mb-10"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <QotionLogo size="md" />
          <div className="text-center">
            <h1 className="text-3xl md:text-4xl font-display font-black text-white">
              Privacy Policy
            </h1>
            <p className="text-white/40 text-sm mt-1">
              Effective Date: {EFFECTIVE_DATE}
            </p>
          </div>
        </motion.div>

        {/* Intro */}
        <motion.div
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <p className="text-white/70 text-sm leading-relaxed">
            Qotion ("we", "us", "our") is operated by its founders in India.
            This Privacy Policy explains how we collect, use, and protect your
            data when you use the Platform.
          </p>
        </motion.div>

        {/* 1. Data We Collect */}
        <motion.div
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <span className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #2dd4bf22, #06b6d422)", border: "1px solid rgba(45,212,191,0.25)" }}>
              <Database className="w-3.5 h-3.5 text-teal-400" />
            </span>
            <h2 className="font-display font-bold text-white text-base">1. Data We Collect</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/5 border border-white/8 p-4">
              <p className="text-teal-400 text-xs font-bold uppercase tracking-wide mb-3">Guest Users</p>
              <ul className="space-y-1.5">
                {["Temporary session data", "Nickname (not stored permanently)", "Basic device / browser info", "IP address (for security)"].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-white/65">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-teal-400/60 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/8 p-4">
              <p className="text-teal-400 text-xs font-bold uppercase tracking-wide mb-3">Registered Users (Google)</p>
              <ul className="space-y-1.5">
                {["Google ID", "Name", "Email address"].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-white/65">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-teal-400/60 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>

        {/* 2. How We Use Data */}
        <motion.div
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <span className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #2dd4bf22, #06b6d422)", border: "1px solid rgba(45,212,191,0.25)" }}>
              <Shield className="w-3.5 h-3.5 text-teal-400" />
            </span>
            <h2 className="font-display font-bold text-white text-base">2. How We Use Data</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-xl bg-teal-400/5 border border-teal-400/15 p-4">
              <p className="text-teal-400 text-xs font-bold uppercase tracking-wide mb-3">We use data to</p>
              <ul className="space-y-1.5">
                {["Run the game", "Maintain leaderboards", "Improve performance", "Prevent abuse"].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-white/65">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-teal-400/60 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl bg-red-400/5 border border-red-400/15 p-4">
              <p className="text-red-400 text-xs font-bold uppercase tracking-wide mb-3">We do NOT</p>
              <ul className="space-y-1.5">
                {["Sell your data", "Use data for advertising profiling"].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-white/65">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-red-400/60 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>

        {/* 3. Cookies */}
        <motion.div
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
        >
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5"
              style={{ background: "linear-gradient(135deg, #2dd4bf22, #06b6d422)", border: "1px solid rgba(45,212,191,0.25)" }}>
              <Cookie className="w-3.5 h-3.5 text-teal-400" />
            </span>
            <div>
              <h2 className="font-display font-bold text-white text-base mb-2">3. Cookies</h2>
              <p className="text-white/65 text-sm leading-relaxed">
                We may use basic cookies or browser storage for session management
                and preferences.
              </p>
            </div>
          </div>
        </motion.div>

        {/* 4. Third-Party Services */}
        <motion.div
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5"
              style={{ background: "linear-gradient(135deg, #2dd4bf22, #06b6d422)", border: "1px solid rgba(45,212,191,0.25)" }}>
              <ExternalLink className="w-3.5 h-3.5 text-teal-400" />
            </span>
            <div>
              <h2 className="font-display font-bold text-white text-base mb-2">4. Third-Party Services</h2>
              <p className="text-white/65 text-sm mb-3">We use the following third-party services, each governed by their own privacy policies:</p>
              <div className="flex gap-2 flex-wrap">
                {["Google (authentication)", "AI providers (question generation)"].map((s) => (
                  <span key={s} className="px-3 py-1 rounded-lg text-xs font-medium text-teal-300 bg-teal-400/10 border border-teal-400/20">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* 5. Data Retention */}
        <motion.div
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35 }}
        >
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5"
              style={{ background: "linear-gradient(135deg, #2dd4bf22, #06b6d422)", border: "1px solid rgba(45,212,191,0.25)" }}>
              <Trash2 className="w-3.5 h-3.5 text-teal-400" />
            </span>
            <div>
              <h2 className="font-display font-bold text-white text-base mb-2">5. Data Retention</h2>
              <ul className="space-y-1.5">
                {[
                  ["Guest data", "Temporary — cleared after session"],
                  ["Account data", "Stored until account deletion"],
                  ["Logs", "Retained for security purposes"],
                ].map(([label, val]) => (
                  <li key={label} className="flex items-center justify-between text-sm">
                    <span className="text-white/50">{label}</span>
                    <span className="text-white/75">{val}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>

        {/* 6. Data Security */}
        <motion.div
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.38 }}
        >
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5"
              style={{ background: "linear-gradient(135deg, #2dd4bf22, #06b6d422)", border: "1px solid rgba(45,212,191,0.25)" }}>
              <Lock className="w-3.5 h-3.5 text-teal-400" />
            </span>
            <div>
              <h2 className="font-display font-bold text-white text-base mb-2">6. Data Security</h2>
              <p className="text-white/65 text-sm leading-relaxed">
                We use standard security practices to protect your data.
              </p>
            </div>
          </div>
        </motion.div>

        {/* 7. Your Rights */}
        <motion.div
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.41 }}
        >
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5"
              style={{ background: "linear-gradient(135deg, #2dd4bf22, #06b6d422)", border: "1px solid rgba(45,212,191,0.25)" }}>
              <Shield className="w-3.5 h-3.5 text-teal-400" />
            </span>
            <div className="flex-1">
              <h2 className="font-display font-bold text-white text-base mb-2">7. Your Rights</h2>
              <p className="text-white/65 text-sm mb-3">You can request:</p>
              <ul className="space-y-1 mb-3">
                {["Access to your data", "Deletion of your data"].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-white/65">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-teal-400/60 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <a href="mailto:qotionsupport@gmail.com"
                className="inline-flex items-center gap-2 text-teal-400 hover:text-teal-300 transition-colors text-sm font-medium">
                <Mail className="w-3.5 h-3.5" />
                qotionsupport@gmail.com
              </a>
            </div>
          </div>
        </motion.div>

        {/* 8. Children */}
        <motion.div
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.44 }}
        >
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5"
              style={{ background: "linear-gradient(135deg, #2dd4bf22, #06b6d422)", border: "1px solid rgba(45,212,191,0.25)" }}>
              <Baby className="w-3.5 h-3.5 text-teal-400" />
            </span>
            <div>
              <h2 className="font-display font-bold text-white text-base mb-2">8. Children</h2>
              <p className="text-white/65 text-sm leading-relaxed">
                Users under 13 should not use the platform without parental supervision.
              </p>
            </div>
          </div>
        </motion.div>

        {/* 9. Changes */}
        <motion.div
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.47 }}
        >
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5"
              style={{ background: "linear-gradient(135deg, #2dd4bf22, #06b6d422)", border: "1px solid rgba(45,212,191,0.25)" }}>
              <RefreshCw className="w-3.5 h-3.5 text-teal-400" />
            </span>
            <div>
              <h2 className="font-display font-bold text-white text-base mb-2">9. Changes</h2>
              <p className="text-white/65 text-sm leading-relaxed">
                We may update this policy from time to time. Continued use of the Platform after changes constitutes acceptance of the updated policy.
              </p>
            </div>
          </div>
        </motion.div>

        {/* 10. Contact */}
        <motion.div
          className="rounded-2xl border border-teal-400/20 bg-teal-400/5 p-5 mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          <h2 className="font-display font-bold text-white text-base mb-2">10. Contact</h2>
          <p className="text-white/65 text-sm mb-3">
            Questions about this Privacy Policy? We'd love to hear from you.
          </p>
          <div className="flex flex-col gap-1">
            <a href="mailto:qotionsupport@gmail.com"
              className="inline-flex items-center gap-2 text-teal-400 hover:text-teal-300 transition-colors text-sm font-medium">
              <Mail className="w-4 h-4" />
              qotionsupport@gmail.com
            </a>
            <span className="text-white/40 text-sm">📍 India</span>
          </div>
        </motion.div>

        {/* Back button */}
        <motion.div
          className="flex justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <Button onClick={() => setLocation("/")}>
            <Home className="w-4 h-4 mr-2" />
            Back to Qotion
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
