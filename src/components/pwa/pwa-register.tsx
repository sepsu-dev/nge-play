"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

const INSTALL_SEEN_KEY = "ngeplay_install_prompt_seen";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type MobilePlatform = "android" | "ios" | null;

function isStandaloneMode(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function detectMobilePlatform(): MobilePlatform {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
    return "ios";
  }
  if (/Android/i.test(ua)) return "android";
  return null;
}

function hasSeenPrompt(): boolean {
  try {
    return localStorage.getItem(INSTALL_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markPromptSeen() {
  try {
    localStorage.setItem(INSTALL_SEEN_KEY, "1");
  } catch {}
}

export function PwaRegister() {
  const [platform, setPlatform] = useState<MobilePlatform>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV !== "production") {
        navigator.serviceWorker
          .getRegistrations()
          .then((regs) => Promise.all(regs.map((r) => r.unregister())))
          .catch(() => {});
        if ("caches" in window) {
          caches
            .keys()
            .then((keys) =>
              Promise.all(keys.filter((k) => k.startsWith("ngeplay-shell-")).map((k) => caches.delete(k)))
            )
            .catch(() => {});
        }
      } else {
        navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
      }
    }

    if (isStandaloneMode() || hasSeenPrompt()) return;

    const detected = detectMobilePlatform();
    if (!detected) return;

    if (detected === "ios") {
      markPromptSeen();
      setPlatform("ios");
      setOpen(true);
      return;
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      if (hasSeenPrompt()) return;
      markPromptSeen();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setPlatform("android");
      setOpen(true);
    };

    const onInstalled = () => {
      markPromptSeen();
      setOpen(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt().catch(() => {});
    await deferredPrompt.userChoice.catch(() => {});
    setDeferredPrompt(null);
    setOpen(false);
  }

  if (!open || !platform) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-install-title"
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white dark:bg-[#161922] border border-black/[0.06] dark:border-white/[0.08] rounded-3xl p-5 shadow-2xl space-y-4 np-view-enter"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/icon-192.png"
              alt="Nge-Play"
              className="w-11 h-11 rounded-2xl shrink-0 shadow-sm"
            />
            <div>
              <h2
                id="pwa-install-title"
                className="text-sm font-bold text-[#18181B] dark:text-white"
              >
                Install Nge-Play
              </h2>
              <p className="text-xs text-[#6B7280] dark:text-[#9CA3AF]">
                Add to your home screen for quick access.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-full text-[#9CA3AF] hover:text-[#18181B] dark:hover:text-white hover:bg-[#F4F5F7] dark:hover:bg-[#1E222D] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>


        {platform === "android" ? (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2 rounded-full text-xs font-semibold text-[#6B7280] dark:text-[#9CA3AF] hover:bg-[#F4F5F7] dark:hover:bg-[#1E222D] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleInstall}
              className="px-5 py-2 rounded-full text-xs font-bold bg-[#FFD014] hover:bg-[#F5C400] text-[#18181B] flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Install</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="rounded-2xl bg-[#F4F5F7] dark:bg-[#0D0F14] px-3.5 py-2.5 text-xs text-[#374151] dark:text-[#D1D5DB] flex items-center gap-2">
              <Share className="w-4 h-4 text-[#FFD014] shrink-0" />
              <span>
                Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
              </span>
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-full text-xs font-semibold text-[#6B7280] dark:text-[#9CA3AF] hover:bg-[#F4F5F7] dark:hover:bg-[#1E222D] transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
