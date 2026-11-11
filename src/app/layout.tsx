import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import { Toaster } from "sonner";
import { PwaRegister } from "@/components/pwa/pwa-install";
import "@/app/globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
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
      default: "Nge-Play",
      template: "%s — Nge-Play",
    },
    description:
      "A simple, ad-free YouTube Music web player. Search, explore, view synced lyrics, and listen directly from YouTube.",
    applicationName: "Nge-Play",
    appleWebApp: {
      capable: true,
      title: "Nge-Play",
      statusBarStyle: "default",
    },
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
      <body className="antialiased font-sans min-h-screen bg-white text-[#18181B]">
        <PwaRegister />
        <NextTopLoader showSpinner={false} color="#FFD014" />
        {children}
        <Toaster position="top-center" theme="light" richColors />
      </body>
    </html>
  );
}
