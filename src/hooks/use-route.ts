"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { routeFromLocation, type Route } from "@/lib/routes";

/**
 * Rute aktif, sinkron dengan URL.
 *
 * Catatan: sengaja tidak memakai useSearchParams — hook itu mewajibkan Suspense
 * boundary di Next 15/16. Query pencarian cukup dibaca dari location.search.
 */
export function useRoute(): Route {
  const pathname = usePathname();
  // Sengaja memakai `pathname` dari Next (bukan `window.location`), supaya render
  // server dan render pertama di client menghasilkan rute yang SAMA. Kalau client
  // membaca window lebih dulu, tab awal bisa beda dengan HTML server -> hydration error.
  // Query pencarian yang hanya ada di URL dibaca setelah mount (lihat efek di bawah).
  const [route, setRoute] = useState<Route>(() => routeFromLocation(pathname || "/", ""));

  useEffect(() => {
    // location.search dibaca langsung: useSearchParams butuh Suspense boundary di Next 16
    setRoute(routeFromLocation(pathname || "/", window.location.search));
  }, [pathname]);

  return route;
}

/** Navigasi deklaratif lewat router Next (halaman ikut dirender ulang). */
export function useNavigate() {
  const router = useRouter();
  return useCallback((route: Route) => router.push(route.path), [router]);
}

/** Ganti URL tanpa menambah history — dipakai untuk redirect koreksi (link rusak). */
export function useReplace() {
  const router = useRouter();
  return useCallback((route: Route) => router.replace(route.path), [router]);
}