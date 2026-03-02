"use client";

import { motion, type Variants } from "framer-motion";
import type { OrbState } from "@/context/VoiceSessionContext";

const variants: Variants = {
  idle: {
    scale: [1, 1.03, 1],
    boxShadow: "0 0 45px rgba(62, 182, 255, 0.35)",
    background: "radial-gradient(circle at 30% 30%, #8fd6ff 0%, #2f6f97 55%, #11304a 100%)",
    transition: { duration: 2.8, repeat: Infinity, ease: "easeInOut" },
  },
  listening: {
    scale: [1, 1.08, 1],
    boxShadow: "0 0 80px rgba(45, 170, 255, 0.8)",
    background: "radial-gradient(circle at 30% 30%, #9fe4ff 0%, #1d89cf 50%, #0e2d49 100%)",
    transition: { duration: 0.9, repeat: Infinity, ease: "easeInOut" },
  },
  thinking: {
    rotate: [0, 360],
    boxShadow: [
      "0 0 42px rgba(255, 172, 84, 0.45)",
      "0 0 66px rgba(79, 177, 255, 0.55)",
      "0 0 42px rgba(255, 172, 84, 0.45)",
    ],
    background: "conic-gradient(from 90deg, #f0a35d, #5bb8ff, #f0a35d)",
    transition: { duration: 2.2, repeat: Infinity, ease: "linear" },
  },
  speaking: {
    scale: [1, 1.06, 1],
    boxShadow: "0 0 74px rgba(255, 255, 255, 0.72)",
    background: "radial-gradient(circle at 30% 30%, #ffffff 0%, #cde8ff 52%, #8ab8dc 100%)",
    transition: { duration: 0.65, repeat: Infinity, ease: "easeInOut" },
  },
  error: {
    scale: 1,
    boxShadow: "0 0 56px rgba(255, 107, 107, 0.7)",
    background: "radial-gradient(circle at 30% 30%, #ff9d9d 0%, #d34141 55%, #6f1f1f 100%)",
    transition: { duration: 0.4 },
  },
};

export function Orb({ state }: { state: OrbState }) {
  return (
    <div className="relative mx-auto flex w-full max-w-sm items-center justify-center py-8">
      <motion.div
        className="h-40 w-40 rounded-full border border-white/20 md:h-56 md:w-56"
        variants={variants}
        animate={state}
        initial="idle"
      />
      <p className="absolute -bottom-3 rounded-full border border-white/20 bg-panel/70 px-3 py-1 text-xs uppercase tracking-[0.25em] text-slate-200">
        {state}
      </p>
    </div>
  );
}



