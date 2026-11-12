"use client";

import { useState } from "react";
import { Check, Copy, Link2, LogOut, Radio, Users, X } from "lucide-react";
import { toast } from "sonner";
import { sanitizeRoomCode, type RoomState } from "@/lib/room";

interface RoomModalProps {
  open: boolean;
  room: RoomState | null;
  busy: boolean;
  onClose: () => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => Promise<boolean>;
  onLeaveRoom: () => void;
}

export function RoomModal({
  open,
  room,
  busy,
  onClose,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
}: RoomModalProps) {
  const [codeInput, setCodeInput] = useState("");
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  if (!open) return null;

  async function copyText(text: string, type: "code" | "link", label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      toast.success(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Failed to copy");
    }
  }

  async function handleJoinSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = sanitizeRoomCode(codeInput);
    if (!cleaned) return;
    const ok = await onJoinRoom(cleaned);
    if (ok) {
      setCodeInput("");
      onClose();
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 np-backdrop-enter"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white dark:bg-[#161922] rounded-3xl shadow-2xl border border-black/[0.06] dark:border-white/[0.08] p-6 space-y-5 np-pop-enter"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#FFD014]" />
            <h3 className="text-base font-bold text-[#18181B] dark:text-white">
              Listen Together
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {room ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-[#FFF9DB] dark:bg-[#FFD014]/10 border border-[#FFD014]/40 p-4 text-center space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#B45309] dark:text-[#FFD014]">
                Room Code
              </p>
              <p className="text-2xl font-extrabold tracking-[0.22em] text-[#18181B] dark:text-white">
                {room.code}
              </p>
              <p className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6B7280] dark:text-[#9CA3AF]">
                <Users className="w-3.5 h-3.5 text-[#B45309] dark:text-[#FFD014]" />
                <span>{room.memberCount} listening</span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => copyText(room.code, "code", "Code copied")}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-full bg-[#F4F5F7] dark:bg-[#1E222D] hover:bg-[#EAECEF] dark:hover:bg-[#262B38] text-xs font-semibold text-[#18181B] dark:text-white transition-colors cursor-pointer"
              >
                {copied === "code" ? (
                  <Check className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>Copy Code</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  copyText(
                    `${window.location.origin}/?room=${room.code}`,
                    "link",
                    "Link copied"
                  )
                }
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-full bg-[#FFD014] hover:bg-[#F5C400] text-xs font-bold text-[#18181B] transition-transform active:scale-95 cursor-pointer"
              >
                {copied === "link" ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Link2 className="w-3.5 h-3.5" />
                )}
                <span>Copy Link</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                onLeaveRoom();
                onClose();
              }}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-full text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Leave Room</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              type="button"
              disabled={busy}
              onClick={onCreateRoom}
              className="w-full py-2.5 rounded-full text-xs font-bold bg-[#FFD014] hover:bg-[#F5C400] text-[#18181B] transition-transform active:scale-95 disabled:opacity-60 cursor-pointer"
            >
              {busy ? "Creating..." : "Create Room"}
            </button>

            <div className="flex items-center gap-3 text-[11px] text-[#9CA3AF]">
              <span className="h-px flex-1 bg-black/[0.06] dark:bg-white/[0.08]" />
              <span>or</span>
              <span className="h-px flex-1 bg-black/[0.06] dark:bg-white/[0.08]" />
            </div>

            <form onSubmit={handleJoinSubmit} className="flex gap-2">
              <input
                type="text"
                value={codeInput}
                onChange={(e) => setCodeInput(sanitizeRoomCode(e.target.value))}
                placeholder="ROOM CODE"
                maxLength={8}
                className="flex-1 h-10 px-4 rounded-full bg-[#F4F5F7] dark:bg-[#0D0F14] focus:bg-white dark:focus:bg-[#1B1F2A] border border-transparent focus:border-[#FFD014] text-sm font-bold tracking-widest uppercase text-[#18181B] dark:text-white placeholder:font-normal placeholder:tracking-normal focus:outline-none transition-colors"
              />
              <button
                type="submit"
                disabled={busy || !codeInput.trim()}
                className="px-5 h-10 rounded-full text-xs font-bold bg-[#18181B] dark:bg-white text-white dark:text-[#18181B] hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer shrink-0"
              >
                Join
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

