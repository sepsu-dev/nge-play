import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { PwaRegister } from "@/components/pwa/pwa-register";
import { TooltipProvider } from "@/components/ui/tooltip";
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
