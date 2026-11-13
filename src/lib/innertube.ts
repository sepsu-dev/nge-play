import Innertube, { Log, Platform, UniversalCache } from "youtubei.js";

Log.setLevel(Log.Level.NONE);
Platform.shim.eval = async (data: any) => new Function(data.output)();

const g = globalThis as typeof globalThis & {
  __ytPromise?: Promise<Innertube>;
};

export function getInnertube(): Promise<Innertube> {
  if (!g.__ytPromise) {
    g.__ytPromise = Innertube.create({
      cache: new UniversalCache(true, "./.cache/youtubei"),
      cookie: process.env.YOUTUBE_COOKIE || undefined,
      location: "ID",
    }).catch((err) => {
      g.__ytPromise = undefined;
      throw err;
    });
  }
  return g.__ytPromise;
}
