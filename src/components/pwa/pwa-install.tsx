"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

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
      return;
    }

    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);

  return null;
}
