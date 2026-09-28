import type { Metadata } from "next";
import { Inter, Roboto_Flex } from "next/font/google";
import "./globals.css";

// persona's fallback face (sf pro first on apple devices, see globals.css)
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
// pixel skin: closest free match to google sans (not licensed for the web)
const roboto = Roboto_Flex({ variable: "--font-roboto-flex", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Persona (trial demo)",
  description: "Your personal intelligence. A web build of the Persona onboarding.",
  icons: { icon: "/brand/persona-mark.svg", apple: "/brand/apple-icon.png" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${roboto.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
