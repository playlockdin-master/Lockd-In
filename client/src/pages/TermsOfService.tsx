import { useLocation } from "wouter";
import { ParticleBackground } from "@/components/ParticleBackground";
import { Button } from "@/components/Button";
import { QotionLogo } from "@/components/QotionLogo";
import { motion } from "framer-motion";
import { Home, Mail } from "lucide-react";

const EFFECTIVE_DATE = "April 8, 2025";

const sections = [
  {
    number: "1",
    title: "Description of Service",
    content:
      "Qotion is a browser-based multiplayer trivia game where users can join rooms, answer AI-generated questions, and compete with others in real time.",
  },
  {
    number: "2",
    title: "Eligibility",
    content: "You must be at least 13 years old to use the Platform.",
  },
  {
    number: "3",
    title: "User Accounts",
    items: [
      "You may use Qotion as a guest or via Google Sign-In.",
      "You are responsible for all activity under your account.",
    ],
  },
  {
    number: "4",
    title: "Acceptable Use",
    intro: "You agree not to:",
    items: [
      "Use bots, scripts, or automation",
      "Attempt to hack or disrupt the platform",
      "Submit harmful, illegal, or abusive content",
      "Manipulate scores or gameplay unfairly",
    ],
  },
  {
    number: "5",
    title: "AI-Generated Content",
    content:
      "Questions are generated using AI and may contain inaccuracies. Content is for entertainment purposes only and should not be relied upon for factual decisions.",
  },
  {
    number: "6",
    title: "Intellectual Property",
    content:
      "All rights, title, and interest in Qotion, including its design, code, and branding, are owned by its creators. You may not copy or reuse any part without permission.",
  },
  {
    number: "7",
    title: "Termination",
    content: "We may suspend or terminate access if you violate these Terms.",
  },
  {
    number: "8",
    title: "Disclaimer",
    content:
      'The Platform is provided "as is" without warranties of any kind. We do not guarantee uninterrupted or error-free service.',
  },
  {
    number: "9",
    title: "Limitation of Liability",
    content:
      "We are not liable for any indirect or consequential damages arising from your use of the Platform.",
  },
  {
    number: "10",
    title: "Governing Law",
    content:
      "These Terms are governed by the laws of India. Courts in New Delhi shall have jurisdiction.",
  },
];

export default function TermsOfService() {
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
              Terms of Service
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
            These Terms of Service ("Terms") govern your use of Qotion
            ("Platform"), operated by its founders based in India ("we", "us",
            "our"). By accessing or using Qotion, you agree to these Terms. If
            you do not agree, please do not use the Platform.
          </p>
        </motion.div>

        {/* Sections */}
        {sections.map((section, i) => (
          <motion.div
            key={section.number}
            className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 + i * 0.04 }}
          >
            <div className="flex items-start gap-3">
              <span
                className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                style={{
                  background:
                    "linear-gradient(135deg, #2dd4bf22, #06b6d422)",
                  border: "1px solid rgba(45,212,191,0.25)",
                  color: "#2dd4bf",
                }}
              >
                {section.number}
              </span>
              <div className="flex-1">
                <h2 className="font-display font-bold text-white text-base mb-2">
                  {section.title}
                </h2>
                {section.content && (
                  <p className="text-white/65 text-sm leading-relaxed">
                    {section.content}
                  </p>
                )}
                {section.intro && (
                  <p className="text-white/65 text-sm mb-2">{section.intro}</p>
                )}
                {section.items && (
                  <ul className="space-y-1">
                    {section.items.map((item, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-white/65">
                        <span className="mt-1.5 w-1 h-1 rounded-full bg-teal-400/60 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </motion.div>
        ))}

        {/* Contact */}
        <motion.div
          className="rounded-2xl border border-teal-400/20 bg-teal-400/5 p-5 mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.6 }}
        >
          <h2 className="font-display font-bold text-white text-base mb-2">
            11. Contact
          </h2>
          <p className="text-white/65 text-sm mb-3">
            For any questions about these Terms, reach out to us:
          </p>
          <a
            href="mailto:qotionsupport@gmail.com"
            className="inline-flex items-center gap-2 text-teal-400 hover:text-teal-300 transition-colors text-sm font-medium"
          >
            <Mail className="w-4 h-4" />
            qotionsupport@gmail.com
          </a>
        </motion.div>

        {/* Back button */}
        <motion.div
          className="flex justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
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
