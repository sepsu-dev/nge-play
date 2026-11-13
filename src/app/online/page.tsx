"use client";

import { useEffect, useState } from "react";
import { Radio } from "lucide-react";

interface PresenceData {
  totalOnline: number;
  totalRooms: number;
}

export default function OnlinePage() {
  const [data, setData] = useState<PresenceData | null>(null);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const res = await fetch("/api/presence", { cache: "no-store" });
        if (!res.ok) return;
        const resData = await res.json();
        if (active) setData(resData);
      } catch {}
    }

    void poll();
    const timer = setInterval(poll, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#0D0F14] text-[#18181B] dark:text-[#F4F5F7] flex items-center justify-center p-6">
      <div className="w-full max-w-md grid grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#161922] border border-black/[0.06] dark:border-white/[0.06] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-wider">
              Online Users
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <p className="text-3xl font-extrabold mt-3">{data ? data.totalOnline : "—"}</p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#161922] border border-black/[0.06] dark:border-white/[0.06] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-wider">
              Rooms
            </span>
            <Radio className="w-4 h-4 text-[#FFD014]" />
          </div>
          <p className="text-3xl font-extrabold mt-3">{data ? data.totalRooms : "—"}</p>
        </div>
      </div>
    </div>
  );
}
