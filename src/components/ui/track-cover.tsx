"use client";

import { useEffect, useState } from "react";
import { Music } from "lucide-react";

export function TrackCover({
  src,
  trackId,
  alt,
  className = "w-full h-full object-cover",
  iconClass = "w-4 h-4",
  lazy = false,
}: {
  src?: string;
  trackId?: string;
  alt: string;
  className?: string;
  iconClass?: string;
  lazy?: boolean;
}) {
  const fallback = trackId ? `https://i.ytimg.com/vi/${trackId}/hqdefault.jpg` : "";
  const [imgSrc, setImgSrc] = useState(src || fallback);

  useEffect(() => {
    setImgSrc(src || fallback);
  }, [src, fallback]);

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
      alt={alt}
      className={className}
      loading={lazy ? "lazy" : undefined}
      referrerPolicy="no-referrer"
      onLoad={(e) => {
        const img = e.currentTarget;
        if (imgSrc === fallback && img.naturalWidth === 120 && img.naturalHeight === 90) {
          setImgSrc("");
        }
      }}
      onError={() => {
        if (fallback && imgSrc !== fallback) setImgSrc(fallback);
        else setImgSrc("");
      }}
    />
  );
}
