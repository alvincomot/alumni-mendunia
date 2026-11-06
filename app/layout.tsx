import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Alumni Mendunia SMK",
  description: "Sistem pendataan dan monitoring alumni SMK DKI Jakarta",
  icons: {
    icon: [
      {
        url: "/images/smk-bisa-hebat-icon.webp",
        type: "image/webp",
        sizes: "256x256",
      },
    ],
    shortcut: "/images/smk-bisa-hebat-icon.webp",
  },
};

const inter = Inter({
  variable: "--font-inter",
  display: "swap",
  subsets: ["latin"],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  display: "swap",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body
        className={`${inter.variable} ${plusJakartaSans.variable} font-sans antialiased`}
      >
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
