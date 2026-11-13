"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  Link2,
  LogOut,
  Pencil,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { Tip } from "@/components/ui/tooltip";
import { sanitizeRoomCode, MEMBER_AVATARS, type MemberIconId, type RoomState } from "@/lib/room";

function MemberAvatar({
  icon,
  sizeClass = "w-7 h-7 text-sm",
  className = "",
}: {
  icon: MemberIconId;
  sizeClass?: string;
  className?: string;
}) {
  const found = MEMBER_AVATARS.find((item) => item.id === icon) || MEMBER_AVATARS[0];
  return (
    <span
      role="img"
      aria-label={found.label}
      className={`rounded-full ${found.bg} ${sizeClass} inline-flex items-center justify-center leading-none select-none shrink-0 ${className}`}
    >
      {found.emoji}
    </span>
  );
}

interface RoomModalProps {
  open: boolean;
  room: RoomState | null;
  busy: boolean;
  memberId: string;
  memberName: string;
  memberIcon: MemberIconId;
  onClose: () => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => Promise<boolean>;
  onLeaveRoom: () => void;
  onUpdateName: (name: string) => Promise<boolean>;
  onUpdateIcon: (icon: MemberIconId) => Promise<boolean>;
}

export function RoomModal({
  open,
  room,
  busy,
  memberId,
  memberName,
  memberIcon,
  onClose,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onUpdateName,
  onUpdateIcon,
}: RoomModalProps) {
  const [codeInput, setCodeInput] = useState("");
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [pickingIcon, setPickingIcon] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  if (!open) return null;

  function handleClose() {
    setEditingName(false);
    setPickingIcon(false);
    onClose();
  }

  function startEditName() {
    setNameDraft(memberName);
    setEditingName(true);
    setPickingIcon(false);
  }

  async function handleSelectIcon(icon: MemberIconId) {
    setPickingIcon(false);
    if (icon !== memberIcon) {
      await onUpdateIcon(icon);
    }
  }

  async function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (savingName) return;
    setSavingName(true);
    try {
      const ok = await onUpdateName(nameDraft);
      if (ok) setEditingName(false);
    } finally {
      setSavingName(false);
    }
  }

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
      handleClose();
    }
  }

  const rawMembers = room?.members?.length
    ? room.members
    : memberName
      ? [{ id: memberId, name: memberName, icon: memberIcon }]
      : [];
  const members = [...rawMembers].sort((a, b) =>
    a.id === memberId ? -1 : b.id === memberId ? 1 : 0
  );

  const iconPicker = pickingIcon ? (
    <div className="grid grid-cols-5 gap-2 pt-1.5 justify-items-center">
      {MEMBER_AVATARS.map(({ id, label, emoji, bg }) => {
        const selected = id === memberIcon;
        return (
          <Tip key={id} label={label}>
            <button
              type="button"
              aria-label={label}
              onClick={() => handleSelectIcon(id)}
              className={`w-9 h-9 rounded-full ${bg} text-lg leading-none flex items-center justify-center transition-transform hover:scale-105 cursor-pointer ${
                selected
                  ? "ring-2 ring-[#FFD014] ring-offset-2 ring-offset-white dark:ring-offset-[#161922]"
                  : "opacity-85 hover:opacity-100"
              }`}
            >
              {emoji}
            </button>
          </Tip>
        );
      })}
    </div>
  ) : null;

  const nameForm = editingName ? (
    <form onSubmit={handleNameSubmit} className="flex items-center gap-1.5">
      <input
        type="text"
        value={nameDraft}
        onChange={(e) => setNameDraft(e.target.value)}
        placeholder="Your name"
        maxLength={24}
        autoFocus
        className="flex-1 min-w-0 h-8 px-3 rounded-full bg-white dark:bg-[#0D0F14] border border-[#FFD014] text-xs font-semibold text-[#18181B] dark:text-white focus:outline-none"
      />
      <Tip label="Save name">
        <button
          type="submit"
          disabled={savingName || !nameDraft.trim()}
          aria-label="Save name"
          className="w-8 h-8 rounded-full bg-[#FFD014] hover:bg-[#F5C400] text-[#18181B] flex items-center justify-center disabled:opacity-50 cursor-pointer shrink-0"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
      </Tip>
      <Tip label="Cancel">
        <button
          type="button"
          onClick={() => setEditingName(false)}
          aria-label="Cancel"
          className="w-8 h-8 rounded-full bg-black/[0.05] dark:bg-white/[0.08] text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white flex items-center justify-center cursor-pointer shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </Tip>
    </form>
  ) : null;

  return (
    <div
      onClick={handleClose}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 np-backdrop-enter"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white dark:bg-[#161922] rounded-3xl shadow-2xl border border-black/[0.06] dark:border-white/[0.08] p-6 space-y-5 np-pop-enter"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[#18181B] dark:text-white">
            Listen Together
          </h3>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="p-1 text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {room ? (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-medium text-[#6B7280] dark:text-[#9CA3AF]">
                  Room code
                </span>
                <span className="text-xl font-extrabold tracking-[0.2em] text-[#18181B] dark:text-white">
                  {room.code}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => copyText(room.code, "code", "Code copied")}
                  className="h-9 flex items-center justify-center gap-1.5 px-3 rounded-full bg-[#F4F5F7] dark:bg-[#1E222D] hover:bg-[#EAECEF] dark:hover:bg-[#262B38] text-xs font-semibold text-[#18181B] dark:text-white transition-colors cursor-pointer"
                >
                  {copied === "code" ? (
                    <Check className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>Copy code</span>
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
                  className="h-9 flex items-center justify-center gap-1.5 px-3 rounded-full bg-[#FFD014] hover:bg-[#F5C400] text-xs font-bold text-[#18181B] transition-transform active:scale-95 cursor-pointer"
                >
                  {copied === "link" ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Link2 className="w-3.5 h-3.5" />
                  )}
                  <span>Copy link</span>
                </button>
              </div>
            </div>

            <div className="border-t border-black/[0.06] dark:border-white/[0.08] pt-4 space-y-2.5">
              <p className="text-xs font-semibold text-[#6B7280] dark:text-[#9CA3AF]">
                Members ({members.length})
              </p>

              {nameForm}
              {iconPicker}

              <div className="max-h-40 overflow-y-auto space-y-1">
                {members.map((m) => {
                  const isMe = m.id === memberId;
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-2 py-1 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isMe ? (
                          <Tip label="Change avatar">
                            <button
                              type="button"
                              aria-label="Change avatar"
                              onClick={() => {
                                setPickingIcon((v) => !v);
                                setEditingName(false);
                              }}
                              className="rounded-full hover:ring-2 hover:ring-[#FFD014] transition-shadow cursor-pointer shrink-0"
                            >
                              <MemberAvatar
                                icon={m.icon || memberIcon}
                                sizeClass="w-7 h-7 text-sm"
                              />
                            </button>
                          </Tip>
                        ) : (
                          <MemberAvatar
                            icon={m.icon || MEMBER_AVATARS[0].id}
                            sizeClass="w-7 h-7 text-sm"
                          />
                        )}
                        <span className="font-semibold text-[#18181B] dark:text-white truncate">
                          {m.name}
                          {isMe && (
                            <span className="ml-1.5 font-normal text-[#9CA3AF]">
                              (you)
                            </span>
                          )}
                        </span>
                      </div>
                      {isMe && !editingName && (
                        <Tip label="Edit name">
                          <button
                            type="button"
                            aria-label="Edit name"
                            onClick={startEditName}
                            className="p-1 text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white transition-colors cursor-pointer shrink-0"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </Tip>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-black/[0.06] dark:border-white/[0.08] pt-3">
              <button
                type="button"
                onClick={() => {
                  onLeaveRoom();
                  handleClose();
                }}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-full text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Leave room</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Tip label="Change avatar">
                    <button
                      type="button"
                      aria-label="Change avatar"
                      onClick={() => {
                        setPickingIcon((v) => !v);
                        setEditingName(false);
                      }}
                      className="rounded-full hover:ring-2 hover:ring-[#FFD014] transition-shadow cursor-pointer shrink-0"
                    >
                      <MemberAvatar
                        icon={memberIcon}
                        sizeClass="w-9 h-9 text-lg"
                      />
                    </button>
                  </Tip>
                  {!editingName &&
                    (memberName ? (
                      <span className="text-sm font-semibold text-[#18181B] dark:text-white truncate">
                        {memberName}
                      </span>
                    ) : (
                      <span className="h-4 w-28 rounded-md bg-[#F3F4F6] dark:bg-[#1E222D] animate-pulse inline-block" />
                    ))}
                </div>
                {!editingName && (
                  <button
                    type="button"
                    onClick={startEditName}
                    className="text-xs font-medium text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white transition-colors cursor-pointer shrink-0"
                  >
                    Edit name
                  </button>
                )}
              </div>
              {nameForm}
              {iconPicker}
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={onCreateRoom}
              className="w-full h-10 rounded-full text-xs font-bold bg-[#FFD014] hover:bg-[#F5C400] text-[#18181B] transition-transform active:scale-95 disabled:opacity-60 cursor-pointer"
            >
              {busy ? "Creating..." : "Create Room"}
            </button>

            <form
              onSubmit={handleJoinSubmit}
              className="border-t border-black/[0.06] dark:border-white/[0.08] pt-4 flex gap-2"
            >
              <input
                type="text"
                value={codeInput}
                onChange={(e) => setCodeInput(sanitizeRoomCode(e.target.value))}
                placeholder="Enter room code"
                maxLength={8}
                className="flex-1 min-w-0 h-10 px-4 rounded-full bg-[#F4F5F7] dark:bg-[#0D0F14] focus:bg-white dark:focus:bg-[#1B1F2A] border border-transparent focus:border-[#FFD014] text-sm font-bold tracking-widest uppercase text-[#18181B] dark:text-white placeholder:font-normal placeholder:tracking-normal placeholder:normal-case placeholder:text-[#9CA3AF] focus:outline-none transition-colors"
              />
              <button
                type="submit"
                disabled={busy || !codeInput.trim()}
                className="px-5 h-10 rounded-full text-xs font-bold bg-[#18181B] dark:bg-white text-white dark:text-[#18181B] hover:opacity-90 disabled:opacity-35 transition-opacity cursor-pointer shrink-0"
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

