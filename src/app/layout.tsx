import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Outfit, Bricolage_Grotesque } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/app/globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
});

export function generateMetadata(): Metadata {
  return {
    title: {
      default: "nge-play — Ad-Free YouTube Music Player",
      template: "%s — nge-play",
    },
    description:
      "A simple, ad-free YouTube Music web player. Search, explore, view synced lyrics, and listen directly from YouTube.",
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plusJakartaSans.variable} ${outfit.variable} ${bricolage.variable}`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('ngeplay_theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark')}catch(e){}",
          }}
        />
      </head>
      <body className="antialiased font-sans min-h-screen bg-white dark:bg-[#0D0F14] text-[#18181B] dark:text-[#F4F5F7]">
        <NextTopLoader showSpinner={false} color="#FFD014" />
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
