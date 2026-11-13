import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Disc3, Flame, Headphones, Mic2, Radio, ShieldCheck, Zap } from "lucide-react";

export const metadata: Metadata = {
  title: "About",
  description: "Learn about Nge-Plays, a lightweight and ad-free web player powered by YouTube.",
};

const FEATURES = [
  { icon: Flame, title: "Ad-Free Playback", desc: "Direct audio streaming without third-party audio interruptions." },
  { icon: Mic2, title: "Synced Lyrics", desc: "Follow line-by-line timed lyrics in real time when available." },
  { icon: Radio, title: "Listen Together", desc: "Share room codes to sync playback position with friends." },
  { icon: ShieldCheck, title: "Local-First Privacy", desc: "Playlists, likes, and history stay inside your browser." },
  { icon: Disc3, title: "Full Catalog", desc: "Search millions of tracks, albums, and discographies directly from YouTube." },
  { icon: Zap, title: "Fast & Lightweight", desc: "Next.js 16 and React 19 for instant navigation and minimal footprint." },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#FDFDFE] dark:bg-[#0D0F14] text-[#18181B] dark:text-[#EDEDED]">
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-[#0D0F14]/80 backdrop-blur-md border-b border-black/[0.05] dark:border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 group">
            <svg
              className="w-7 h-7 drop-shadow-[0_4px_10px_rgba(255,208,20,0.45)] transition-transform duration-200 group-hover:scale-105"
              viewBox="0 0 32 32"
              fill="none"
            >
              <path
                d="M7 6.8C7 4.45 9.62 3.05 11.58 4.35L25.4 13.55C27.15 14.71 27.15 17.29 25.4 18.45L11.58 27.65C9.62 28.95 7 27.55 7 25.2V6.8Z"
                fill="#FFD014"
              />
            </svg>
            <span className="font-extrabold text-lg tracking-tight">Nge-Plays</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/online"
              className="text-xs font-semibold px-3 py-2 rounded-full text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white transition-colors"
            >
              Live Rooms
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-[#FFD014] hover:bg-[#FACC15] text-[#18181B] text-xs font-bold transition-all active:scale-95 shadow-[0_4px_14px_rgba(255,208,20,0.35)]"
            >
              <Headphones className="w-3.5 h-3.5" />
              <span>Open Player</span>
            </Link>
          </div>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-4 pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFD014]/15 border border-[#FFD014]/40 text-[#B45309] dark:text-[#FFD014] text-[11px] font-bold tracking-wide uppercase mb-6">
          <span>Ad-Free Web Audio</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.15] mb-5">
          Music streaming,{" "}
          <span className="bg-gradient-to-r from-[#FFB800] to-[#FFD014] bg-clip-text text-transparent">
            minus the clutter
          </span>
          .
        </h1>
        <p className="text-sm sm:text-base text-[#6B7280] dark:text-[#9CA3AF] max-w-xl mx-auto leading-relaxed mb-8">
          A lean YouTube Music web client. No intrusive audio ads, no accounts required, and no tracking databases.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-[#FFD014] hover:bg-[#FACC15] text-[#18181B] text-sm font-bold transition-all active:scale-95 shadow-[0_6px_20px_rgba(255,208,20,0.35)]"
        >
          <span>Launch Player</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </section>

      <section className="max-w-5xl mx-auto px-4 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="p-5 rounded-2xl bg-white dark:bg-[#141720] border border-black/[0.06] dark:border-white/[0.06] shadow-sm hover:border-[#FFD014]/50 transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-[#FFD014]/15 text-[#B45309] dark:text-[#FFD014] flex items-center justify-center mb-3">
                  <Icon className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold mb-1">{item.title}</h3>
                <p className="text-xs text-[#6B7280] dark:text-[#9CA3AF] leading-relaxed">{item.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-black/[0.05] dark:border-white/[0.06] py-8 text-xs text-[#9CA3AF]">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#18181B] dark:text-white">Nge-Plays</span>
            <span>— Lightweight YouTube Music player</span>
          </div>
          <div className="flex items-center gap-4 font-medium">
            <Link href="/" className="hover:text-[#18181B] dark:hover:text-white">Player</Link>
            <Link href="/online" className="hover:text-[#18181B] dark:hover:text-white">Rooms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
