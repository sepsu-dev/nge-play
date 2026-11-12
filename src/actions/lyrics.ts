"use server";

export interface LyricLine {
  time: number;
  text: string;
}

export interface LyricVariant {
  synced: LyricLine[];
  plain: string;
  trackName?: string;
  artistName?: string;
}

export interface LyricsResult extends LyricVariant {
  variants?: LyricVariant[];
}

function cleanQueryPart(s: string) {
  return s
    .replace(/\s+[–—]\s+/g, " - ")
    .replace(/\|.*$/g, "")
    .replace(/[「」『』]/g, " ")
    .replace(
      /\((?:official|lyric|lyrics|audio|video|music video|mv|live|visualizer|hd|4k|prod\.|explicit)[^)]*\)/gi,
      ""
    )
    .replace(/\[[^\]]*\]/g, "")
    .replace(/【[^】]*】/g, "")
    .replace(/\((?:feat|ft)\.?\s+[^)]+\)/gi, "")
    .replace(/\s+(?:feat|ft)\.?\s+[^-]+$/i, "")
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/\b(?:official music video|official audio|official video|lyric video|visualizer|mv)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function splitArtistTrack(title: string, channel: string) {
  const cleanTitle = cleanQueryPart(title);
  const cleanChannel = cleanQueryPart(channel).replace(/vevo$/i, "").trim();
  const sep = cleanTitle.indexOf(" - ");
  if (sep > 0) {
    return {
      artist: cleanTitle.slice(0, sep).trim(),
      track: cleanTitle.slice(sep + 3).trim(),
      cleanTitle,
      fromTitle: true,
    };
  }
  return { artist: cleanChannel, track: cleanTitle, cleanTitle, fromTitle: false };
}

function normText(s: string) {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

const VERSION_TAG_RES = [
  "remix",
  "live",
  "acoustic",
  "cover",
  "karaoke",
  "instrumental",
  "sped up",
  "slowed",
  "nightcore",
  "radio edit",
  "extended",
  "clean version",
  "8d",
  "reverb",
  "unplugged",
  "session",
  "mashup",
  "tribute",
  "demo",
  "english ver",
  "english version",
  "english trans",
  "english translation",
  "indonesian",
  "terjemahan",
  "traducción",
  "traduccion",
  "traduzione",
  "übersetzung",
  "romanized",
  "romaji",
  "romanization",
  "pinyin",
  "bilingual",
  "translated",
  "eng ver",
  "jpn ver",
  "kor ver",
  "esp ver",
  "indo ver",
  "japanese ver",
  "korean ver",
  "spanish ver",
  "chinese ver",
].map((t) => new RegExp(`\\b${t}\\b`, "i"));

const MV_TAG_RE = /\b(official (?:music )?video|music video|mv)\b/i;
const NON_LATIN_RE =
  /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff\u0e00-\u0e7f\u0900-\u097f]/;

function nonLatinRatio(item: any, parsedLines?: LyricLine[]) {
  const lines = parsedLines?.length
    ? parsedLines.map((l) => l.text)
    : String(item?.plainLyrics || "")
        .split(/\r?\n/)
        .filter((l) => l.trim());
  if (!lines.length) return 0;
  let hits = 0;
  for (const line of lines) {
    if (NON_LATIN_RE.test(line)) hits++;
  }
  return hits / lines.length;
}

function scoreLyricCandidate(
  item: any,
  rawTitle: string,
  track: string,
  artist: string,
  fromTitle: boolean,
  targetDurSec?: number,
  parsedLines?: LyricLine[]
) {
  const hasSynced = typeof item?.syncedLyrics === "string" && item.syncedLyrics.trim().length > 0;
  const hasPlain = typeof item?.plainLyrics === "string" && item.plainLyrics.trim().length > 0;
  if (!hasSynced && !hasPlain) return -1e9;

  let score = hasSynced ? 120 : 20;
  const nTrack = normText(track);
  const rawCandTrack = String(item.trackName || "");
  const candMeta = `${rawCandTrack} ${item.albumName || ""}`;
  const candCleanTrack = normText(cleanQueryPart(rawCandTrack).replace(/^[^-]+-\s+/, ""));
  const candTrack = normText(rawCandTrack);
  const candArtist = normText(item.artistName || "");
  const candAlbum = normText(item.albumName || "");
  const nRaw = normText(rawTitle);

  if (nTrack && (candCleanTrack || candTrack)) {
    if (candCleanTrack === nTrack || candTrack === nTrack) score += 90;
    else if (candCleanTrack.includes(nTrack) || nTrack.includes(candCleanTrack)) score += 45;
    else score -= 80;
  }

  if (artist && candArtist) {
    const artistTokens = artist
      .split(/(?:\s*[,&/]\s*|\s+x\s+)/i)
      .map(normText)
      .filter((t) => t.length >= 2);
    const matched = artistTokens.some((tok) => candArtist.includes(tok) || tok.includes(candArtist));
    score += matched ? 55 : fromTitle ? -65 : -55;
  }

  if (targetDurSec && targetDurSec > 0 && typeof item.duration === "number" && item.duration > 0) {
    const diff = Math.abs(item.duration - targetDurSec);
    if (diff <= 3) score += 110;
    else if (diff <= 8) score += 75;
    else if (diff <= 15) score += 30;
    else if (diff <= 30) score -= 25;
    else score -= 140;
  }

  const rawIsMv = MV_TAG_RE.test(rawTitle);
  const candIsMv = MV_TAG_RE.test(candMeta);
  if (rawIsMv && candIsMv) score += 75;
  else if (!rawIsMv && candIsMv) score -= 60;

  if (hasSynced && parsedLines) {
    const uniqueTs = new Set(parsedLines.map((l) => Math.round(l.time * 10))).size;
    if (parsedLines.length < 4 || uniqueTs < 3) {
      score -= 120;
    } else {
      const lastTs = parsedLines[parsedLines.length - 1].time;
      if (typeof item.duration === "number" && item.duration > 0 && lastTs > item.duration + 10) {
        score -= 150;
      }
      if (targetDurSec && targetDurSec > 0) {
        if (lastTs > targetDurSec + 10) score -= 160;
        else if (targetDurSec >= 90 && lastTs < targetDurSec * 0.35) score -= 90;
      }
    }
    const bilingualCount = parsedLines.filter((l) => /\S\^\S/.test(l.text)).length;
    if (bilingualCount >= 2) score -= 90;
  }

  for (const tagRe of VERSION_TAG_RES) {
    if ((tagRe.test(candTrack) || tagRe.test(candAlbum)) && !tagRe.test(nRaw)) score -= 100;
  }

  return score;
}


function parseLrc(raw: string): LyricLine[] {
  const offsetMatch = raw.match(/\[offset:\s*([+-]?\d+)\]/i);
  const offsetSec = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0;
  const lines: LyricLine[] = [];
  for (const row of raw.split(/\r?\n/)) {
    const matches = [...row.matchAll(/\[(\d+):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!matches.length) continue;
    const text = row.replace(/\[\d+:\d{2}(?:[.:]\d{1,3})?\]/g, "").trim();
    if (!text) continue;
    for (const m of matches) {
      const min = Number(m[1]);
      const sec = Number(m[2]);
      const ms = m[3] ? Number(m[3].padEnd(3, "0")) / 1000 : 0;
      lines.push({ time: Math.max(0, min * 60 + sec + ms - offsetSec), text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

export async function fetchTrackLyrics(
  title: string,
  channel: string,
  durationSec?: number
): Promise<LyricsResult | null> {
  const { artist, track, cleanTitle, fromTitle } = splitArtistTrack(title, channel);
  if (!track && !cleanTitle) return null;

  const targetDur = durationSec && durationSec > 0 ? Math.round(durationSec) : undefined;
  const candidates = new Map<number | string, any>();

  const addItems = (items: any[]) => {
    for (const item of items) {
      if (!item) continue;
      const key = item.id ?? `${item.trackName}-${item.artistName}-${item.duration}`;
      if (!candidates.has(key)) candidates.set(key, item);
    }
  };

  const getScore = (item: any, parsed?: LyricLine[]) => {
    const primary = scoreLyricCandidate(item, title, track, artist, fromTitle, targetDur, parsed);
    if (!fromTitle || !artist || !track) return primary;
    const swapped = scoreLyricCandidate(item, title, artist, track, true, targetDur, parsed);
    return Math.max(primary, swapped);
  };

  const primaryReqs: Promise<any>[] = [];
  if (artist && track && targetDur) {
    primaryReqs.push(
      fetch(
        `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(track)}&duration=${targetDur}`,
        { cache: "no-store" }
      )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    );
  }
  if (artist && track) {
    primaryReqs.push(
      fetch(
        `https://lrclib.net/api/search?track_name=${encodeURIComponent(track)}&artist_name=${encodeURIComponent(artist)}`,
        { cache: "no-store" }
      )
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => [])
    );
  }

  for (const res of await Promise.all(primaryReqs)) {
    addItems(Array.isArray(res) ? res : [res]);
  }

  const parsedCache = new Map<any, LyricLine[]>();
  const getParsed = (item: any) => {
    if (!parsedCache.has(item)) {
      parsedCache.set(item, item?.syncedLyrics ? parseLrc(item.syncedLyrics) : []);
    }
    return parsedCache.get(item)!;
  };

  const rankCandidates = () => {
    const scored = [...candidates.values()].map((item) => {
      const synced = getParsed(item);
      const ratio = nonLatinRatio(item, synced);
      return { item, synced, ratio, score: getScore(item, synced) };
    });
    const hasNativeNonLatin = scored.some((r) => r.score >= 160 && r.ratio >= 0.4);
    const wantsTranslation =
      /\b(romanized|romaji|romanization|pinyin|bilingual|translat(?:ed|ion)|terjemahan|traducción|traduccion|traduzione|übersetzung|(?:english|eng|indo(?:nesian)?|spanish|esp|japanese|jpn|korean|kor|chinese) (?:ver|version|trans))\b/i.test(
        title
      );
    if (hasNativeNonLatin && !wantsTranslation) {
      for (const r of scored) {
        if (r.ratio === 0) r.score -= 120;
        else r.score += Math.round(r.ratio * 40);
      }
    }
    return scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.item?.id ?? "").localeCompare(String(b.item?.id ?? ""));
    });
  };

  let ranked = rankCandidates();
  if (!ranked[0] || ranked[0].score < 210) {
    const fallbackUrls = [
      `https://lrclib.net/api/search?q=${encodeURIComponent(`${artist} ${track}`.trim())}`,
      `https://lrclib.net/api/search?q=${encodeURIComponent(track || cleanTitle)}`,
      fromTitle && artist && track
        ? `https://lrclib.net/api/search?track_name=${encodeURIComponent(artist)}&artist_name=${encodeURIComponent(track)}`
        : "",
    ].filter(Boolean);

    for (const url of fallbackUrls) {
      try {
        const list = await fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : []));
        if (Array.isArray(list)) addItems(list);
        ranked = rankCandidates();
        if (ranked[0] && ranked[0].score >= 220) break;
      } catch {
        continue;
      }
    }
  }

  const best = ranked[0];
  if (!best || best.score < 0) return null;

  const minVariantScore = Math.max(0, best.score - 60);
  const variants: LyricVariant[] = [];
  const seenSig = new Set<string>();
  for (const r of ranked) {
    if (r.score < minVariantScore || !r.synced.length) continue;
    const first = Math.round(r.synced[0].time * 2);
    const last = Math.round(r.synced[r.synced.length - 1].time * 2);
    const sig = `${first}:${last}:${r.synced.length}`;
    if (seenSig.has(sig)) continue;
    seenSig.add(sig);
    variants.push({
      synced: r.synced,
      plain: r.item.plainLyrics || "",
      trackName: r.item.trackName,
      artistName: r.item.artistName,
    });
    if (variants.length >= 4) break;
  }

  const primary = variants[0] || {
    synced: best.synced,
    plain: best.item.plainLyrics || "",
    trackName: best.item.trackName,
    artistName: best.item.artistName,
  };

  return {
    ...primary,
    variants: variants.length > 1 ? variants : undefined,
  };
}
