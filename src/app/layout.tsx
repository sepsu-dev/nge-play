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
      default: "Nge-Play",
      template: "%s — Nge-Play",
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
      className={`${plusJakartaSans.variable} ${outfit.variable} ${bricolage.variable}`}
    >
      <body className="antialiased font-sans min-h-screen bg-white text-[#18181B]">
        <NextTopLoader showSpinner={false} color="#FFD014" />
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="top-center" theme="light" richColors />
      </body>
    </html>
  );
}
