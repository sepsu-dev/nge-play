"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Headphones, Radio, Users } from "lucide-react";

interface PresenceData {
  totalOnline: number;
  totalRooms: number;
  totalRoomListeners: number;
  serverTime: number;
}

export default function OnlinePage() {
  const [data, setData] = useState<PresenceData | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let es: EventSource | null = null;

    const connect = () => {
      if (document.visibilityState === "hidden") return;
      if (es) es.close();

      es = new EventSource("/api/presence");
      es.onopen = () => setConnected(true);
      es.onmessage = (event) => {
        try {
          const next = JSON.parse(event.data) as PresenceData;
          setData((prev) => {
            if (
              prev &&
              prev.totalOnline === next.totalOnline &&
              prev.totalRooms === next.totalRooms &&
              prev.totalRoomListeners === next.totalRoomListeners
            ) {
              return prev;
            }
            return next;
          });
          setConnected(true);
        } catch {}
      };
      es.onerror = () => setConnected(false);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        es?.close();
        es = null;
        setConnected(false);
      } else {
        connect();
      }
    };

    connect();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      es?.close();
      es = null;
    };
  }, []);

  const stats = [
    {
      title: "Listeners",
      value: data ? data.totalOnline : "—",
      desc: "Currently playing audio",
      icon: Headphones,
      badge: "text-emerald-500 bg-emerald-500/10",
    },
    {
      title: "Active Rooms",
      value: data ? data.totalRooms : "—",
      desc: "Group sessions",
      icon: Radio,
      badge: "text-[#FFD014] bg-[#FFD014]/10",
    },
    {
      title: "Room Members",
      value: data ? data.totalRoomListeners : "—",
      desc: "Synced participants",
      icon: Users,
      badge: "text-blue-500 bg-blue-500/10",
    },
    {
      title: "Connection",
      value: connected ? "Healthy" : "Offline",
      desc: "Server-Sent Events",
      icon: Activity,
      badge: "text-violet-500 bg-violet-500/10",
    },
  ];

  const lastUpdated = data?.serverTime
    ? new Date(data.serverTime).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#0D0F14] text-[#18181B] dark:text-[#F4F5F7] p-4 sm:p-8 flex flex-col justify-between">
      <div className="w-full max-w-4xl mx-auto space-y-8">
        <header className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.06] pb-4">
          <Link href="/" className="flex items-center gap-2.5 group">
            <svg
              className="w-6 h-6 shrink-0 drop-shadow-[0_2px_8px_rgba(255,208,20,0.45)] transition-transform duration-200 group-hover:scale-105"
              viewBox="0 0 32 32"
              fill="none"
            >
              <path
                d="M7 6.8C7 4.45 9.62 3.05 11.58 4.35L25.4 13.55C27.15 14.71 27.15 17.29 25.4 18.45L11.58 27.65C9.62 28.95 7 27.55 7 25.2V6.8Z"
                fill="#FFD014"
              />
            </svg>
            <span className="font-extrabold text-base tracking-tight text-[#18181B] dark:text-white">
              Nge-Plays
            </span>
          </Link>

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white dark:bg-[#161922] border border-black/[0.06] dark:border-white/[0.06] text-xs font-medium">
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
              }`}
            />
            <span className="text-[#6B7280] dark:text-[#9CA3AF]">
              {connected ? "Live Stream" : "Connecting..."}
            </span>
          </div>
        </header>

        <section className="space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-wider text-[#FFD014]">
            Realtime Stats
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Listener Activity
          </h1>
          <p className="text-xs sm:text-sm text-[#6B7280] dark:text-[#9CA3AF]">
            Live snapshot of active listeners and group sessions.
          </p>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.title}
                className="p-5 rounded-2xl bg-white dark:bg-[#161922] border border-black/[0.06] dark:border-white/[0.06] shadow-xs flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-wider">
                    {s.title}
                  </span>
                  <div className={`p-2 rounded-xl ${s.badge}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-3xl font-extrabold">{s.value}</p>
                  <p className="text-xs text-[#6B7280] dark:text-[#9CA3AF] mt-1">{s.desc}</p>
                </div>
              </div>
            );
          })}
        </section>
      </div>

      <footer className="w-full max-w-4xl mx-auto pt-8 pb-4 text-center">
        <p className="text-[11px] text-[#9CA3AF] dark:text-[#6B7280]">
          {lastUpdated
            ? `Last updated: ${lastUpdated}`
            : "Syncing live with server..."}
        </p>
      </footer>
    </div>
  );
}


