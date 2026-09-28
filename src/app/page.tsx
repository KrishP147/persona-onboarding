import Link from "next/link";

// placeholder until the landing lane lands
export default function Landing() {
  return (
    <main className="min-h-dvh flex items-center justify-center">
      <Link href="/chat" className="rounded-full bg-ink text-white px-5 py-3">Start</Link>
    </main>
  );
}
