"use client";

import { Play } from "lucide-react";
import type { AlbumSummary, ArtistSummary, Track } from "@/actions/youtube";
import { TrackCover } from "@/components/ui/track-cover";

export function AlbumsGrid({
  loading = false,
  albums,
  onOpenAlbum,
}: {
  loading?: boolean;
  albums: AlbumSummary[];
  onOpenAlbum: (album: AlbumSummary) => void;
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-bold tracking-tight text-[#18181B] dark:text-white">
        Albums
      </h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
        {loading && !albums.length
          ? [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="space-y-2.5">
                <div className="aspect-square rounded-[20px] bg-[#F7F8FA] dark:bg-[#161922] animate-pulse" />
                <div className="h-3.5 w-3/4 rounded bg-[#F7F8FA] dark:bg-[#161922] animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-[#F7F8FA] dark:bg-[#161922] animate-pulse" />
              </div>
            ))
          : albums.map((alb) => (
              <div
                key={alb.id}
                onClick={() => onOpenAlbum(alb)}
                className="group cursor-pointer min-w-0 transition-transform duration-150 active:scale-[0.98]"
              >
                <div className="relative aspect-square rounded-[20px] overflow-hidden bg-[#F3F4F6] dark:bg-[#161922] shadow-[0_6px_18px_rgba(15,23,42,0.05)] dark:shadow-none dark:ring-1 dark:ring-white/[0.06] group-hover:shadow-[0_12px_26px_rgba(15,23,42,0.1)] transition-all">
                  <TrackCover src={alb.thumbnail} alt={alb.title} iconClass="w-7 h-7" lazy />
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="w-10 h-10 rounded-full bg-[#FFD014] text-[#18181B] flex items-center justify-center shadow-md transition-transform duration-200 group-hover:scale-105">
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </span>
                  </div>
                </div>
                <p className="text-[13px] font-bold text-[#18181B] dark:text-[#F4F5F7] truncate mt-2.5">
                  {alb.title}
                </p>
                <p className="text-xs text-[#9CA3AF] truncate">{alb.subtitle}</p>
              </div>
            ))}
      </div>
    </div>
  );
}

export function ArtistsGrid({
  loading = false,
  artists,
  onOpenArtist,
}: {
  loading?: boolean;
  artists: ArtistSummary[];
  onOpenArtist: (artist: Track | ArtistSummary | string, e?: React.MouseEvent) => void;
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-bold tracking-tight text-[#18181B] dark:text-white">
        Popular Artists
      </h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
        {loading && !artists.length
          ? [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div
                key={i}
                className="p-4 rounded-[22px] bg-[#F7F8FA] dark:bg-[#161922] flex flex-col items-center gap-3 animate-pulse"
              >
                <div className="w-24 h-24 rounded-full bg-[#EAECEF] dark:bg-[#1E222D]" />
                <div className="w-full flex flex-col items-center gap-1.5">
                  <div className="h-3.5 w-2/3 rounded bg-[#EAECEF] dark:bg-[#1E222D]" />
                  <div className="h-3 w-1/2 rounded bg-[#EAECEF] dark:bg-[#1E222D]" />
                </div>
              </div>
            ))
          : artists.map((art) => (
              <div
                key={art.id}
                onClick={(e) => onOpenArtist(art, e)}
                className="p-4 rounded-[22px] bg-[#F7F8FA] dark:bg-[#161922] hover:bg-[#F1F3F6] dark:hover:bg-[#1B1F2A] border border-transparent dark:border-white/[0.05] transition-all duration-150 active:scale-[0.98] flex flex-col items-center text-center gap-3 cursor-pointer"
              >
                <div className="w-24 h-24 rounded-full overflow-hidden bg-white dark:bg-[#1E222D] shadow-sm border border-black/[0.04] dark:border-white/[0.08]">
                  <TrackCover src={art.avatar} alt={art.name} iconClass="w-6 h-6" lazy />
                </div>
                <div className="min-w-0 w-full">
                  <p className="text-[13px] font-bold text-[#18181B] dark:text-[#F4F5F7] truncate">
                    {art.name}
                  </p>
                  <p className="text-xs text-[#9CA3AF] truncate mt-0.5">
                    {art.subscribers || "Artist"}
                  </p>
                </div>
              </div>
            ))}
      </div>
    </div>
  );
}
