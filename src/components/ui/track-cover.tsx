"use client";

import { useEffect, useRef, useState } from "react";
import { Music } from "lucide-react";

// ponytail: per-viewport decoded width (65vw/45vw for the p-5/p-8 hero, fixed px otherwise).
// A fixed string per breakpoint margin is data-free, so the browser never over-downloads a 544px
// asset for a 40px row thumbnail again.
export const HERO_SIZES = "(min-width: 1024px) 45vw, 65vw";
export const CARD_SIZES = "(min-width: 1024px) 22vw, (min-width: 640px) 30vw, 45vw";

function buildSrcSet(trackId: string): string | undefined {
  if (!trackId) return undefined;
  return [
    `https://i.ytimg.com/vi/${trackId}/default.jpg 120w`,
    `https://i.ytimg.com/vi/${trackId}/mqdefault.jpg 320w`,
    `https://i.ytimg.com/vi/${trackId}/hqdefault.jpg 480w`,
  ].join(", ");
}

// ponytail: keys that must exist for a valid srcset entry; requiring all three lets us safely
// detect "video has no thumbnail" regardless of which candidate the browser picked.
function allSourcesOk(trackId: string): Promise<boolean> {
  const base = `https://i.ytimg.com/vi/${trackId}`;
  return Promise.all(
    ["default.jpg", "mqdefault.jpg", "hqdefault.jpg"].map(async (file) => {
      try {
        const res = await fetch(`${base}/${file}`, { method: "HEAD", cache: "force-cache" });
        return res.ok;
      } catch {
        return false;
      }
    })
  ).then((results) => results.every(Boolean));
}

/**
 * A 120x90 bitmap is the standard "no thumbnail" placeholder for some videos. Because the
 * browser chooses among srcset candidates purely on width, that image alone no longer proves
 * the video is thumbnail-less — so treat it as a *hint* and confirm with a HEAD probe.
 */
function confirmMissingThumb(trackId: string, onMissing: () => void) {
  allSourcesOk(trackId).then((ok) => {
    if (!ok) onMissing();
  });
}

export function TrackCover({
  src,
  trackId,
  alt,
  className = "w-full h-full object-cover",
  iconClass = "w-4 h-4",
  lazy = false,
  sizes,
  fetchPriority,
}: {
  src?: string;
  trackId?: string;
  alt: string;
  className?: string;
  iconClass?: string;
  lazy?: boolean;
  sizes?: string;
  fetchPriority?: "high" | "low" | "auto";
}) {
  const fallback = trackId ? `https://i.ytimg.com/vi/${trackId}/mqdefault.jpg` : "";
  const [imgSrc, setImgSrc] = useState(src || fallback);
  const aliveRef = useRef(true);
  // only per-video thumbnails get a srcset; channel avatars (yt3.ggpht.com) are single files
  const [srcSet, setSrcSet] = useState<string | undefined>(() =>
    !src || src.startsWith("https://i.ytimg.com/") ? buildSrcSet(trackId || "") : undefined
  );

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    setImgSrc(src || fallback);
    const nextCanSrcSet = !src || src.startsWith("https://i.ytimg.com/");
    setSrcSet(nextCanSrcSet ? buildSrcSet(trackId || "") : undefined);
  }, [src, fallback, trackId]);

  if (!imgSrc) {
    return (
      <div
        className={`${className} flex items-center justify-center bg-[#F3F4F6] dark:bg-[#1E222D] text-[#9CA3AF] dark:text-[#6B7280]`}
      >
        <Music className={iconClass} />
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      srcSet={srcSet}
      sizes={srcSet ? sizes || "44px" : undefined}
      alt={alt}
      className={className}
      loading={lazy ? "lazy" : undefined}
      fetchPriority={fetchPriority}
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={(e) => {
        const img = e.currentTarget;
        // 120x90 = "no thumbnail" placeholder. Under srcset the browser may legitimately pick
        // the 120w file, so verify with a HEAD probe before blanking (see confirmMissingThumb).
        if (trackId && img.naturalWidth === 120 && img.naturalHeight === 90) {
          confirmMissingThumb(trackId, () => {
            if (aliveRef.current) setImgSrc("");
          });
        }
      }}
      onError={() => {
        if (fallback && imgSrc !== fallback) setImgSrc(fallback);
        else setImgSrc("");
      }}
    />
  );
}
