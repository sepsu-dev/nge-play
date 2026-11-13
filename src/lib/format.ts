export function formatTime(sec: number, round = false): string {
  if (!sec || !Number.isFinite(sec) || sec < 0) return "0:00";
  const total = round ? Math.round(sec) : Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`
    : `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function parseDurationSec(dur?: string): number {
  if (!dur) return 0;
  const parts = dur.replace(/\./g, ":").split(":").map(Number);
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}
