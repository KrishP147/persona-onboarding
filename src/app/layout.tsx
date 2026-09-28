import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// persona's fallback face (sf pro first on apple devices, see globals.css)
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Persona",
  description: "Your personal intelligence. A web build of the Persona onboarding.",
  icons: { icon: "/brand/persona-mark.svg", apple: "/brand/apple-icon.png" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
