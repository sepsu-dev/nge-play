import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/app/globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-plus-jakarta",
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0D0F14" },
  ],
};

export function generateMetadata(): Metadata {
  return {
    title: {
      default: "Nge-Plays",
      template: "%s — Nge-Plays",
    },
    description:
      "A simple, ad-free YouTube Music web player. Search, explore, view synced lyrics, and listen directly from YouTube.",
    applicationName: "Nge-Plays",
    formatDetection: {
      telephone: false,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={plusJakartaSans.variable}>
      <head>
        <link rel="preconnect" href="https://i.ytimg.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://i.ytimg.com" />
        <link rel="preconnect" href="https://www.youtube-nocookie.com" />
        <link rel="dns-prefetch" href="https://www.youtube-nocookie.com" />
        <script
          dangerouslySetInnerHTML={{
            __html: `'serviceWorker'in navigator&&navigator.serviceWorker.getRegistrations().then(r=>r.forEach(w=>w.unregister()));'caches'in window&&caches.keys().then(k=>k.filter(n=>n.startsWith('ngeplay-')).forEach(caches.delete.bind(caches)));`,
          }}
        />
      </head>
      <body className="antialiased font-sans min-h-screen bg-white text-[#18181B]">
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            className:
              "!bg-white dark:!bg-[#161922] !text-[#18181B] dark:!text-[#F4F5F7] !border !border-black/[0.06] dark:!border-white/[0.08] !rounded-2xl !px-4 !py-2.5 !text-xs !font-semibold !shadow-lg",
            success: {
              iconTheme: {
                primary: "#FFD014",
                secondary: "#18181B",
              },
            },
            error: {
              iconTheme: {
                primary: "#EF4444",
                secondary: "#FFFFFF",
              },
            },
          }}
        />
      </body>
    </html>
  );
}
