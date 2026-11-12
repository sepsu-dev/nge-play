"use client";

import { X } from "lucide-react";

interface NewPlaylistModalProps {
  open: boolean;
  name: string;
  onNameChange: (name: string) => void;
  onClose: () => void;
  onCreate: (name: string) => void;
}

export function NewPlaylistModal({
  open,
  name,
  onNameChange,
  onClose,
  onCreate,
}: NewPlaylistModalProps) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 np-backdrop-enter"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(name);
        }}
        className="w-full max-w-sm bg-white dark:bg-[#161922] rounded-3xl shadow-2xl border border-black/[0.06] dark:border-white/[0.08] p-6 space-y-4 np-pop-enter"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[#18181B] dark:text-white">New Playlist</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <input
          type="text"
          autoFocus
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Playlist name..."
          className="w-full h-10 px-4 rounded-full bg-[#F4F5F7] dark:bg-[#0D0F14] focus:bg-white dark:focus:bg-[#1B1F2A] border border-transparent focus:border-[#FFD014] text-sm text-[#18181B] dark:text-white focus:outline-none transition-colors"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full text-xs font-semibold text-[#6B7280] dark:text-[#9CA3AF] hover:bg-[#F4F5F7] dark:hover:bg-[#1E222D] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2 rounded-full text-xs font-bold bg-[#FFD014] hover:bg-[#F5C400] text-[#18181B] transition-transform active:scale-95 cursor-pointer"
          >
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
