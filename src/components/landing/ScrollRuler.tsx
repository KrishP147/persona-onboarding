"use client";
import { useEffect, useState } from "react";

const TICKS = 28;
const SIGMA = 0.0888; // falloff fitted to the original's tick widths

// hairline ticks on the right edge; the ones near the scroll position grow
export default function ScrollRuler() {
  const [p, setP] = useState(0);

  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setP(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const go = (f: number) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: f * max, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <nav aria-label="Page progress" className="fixed right-5 top-1/2 z-40 hidden -translate-y-1/2 flex-col lg:flex">
      {Array.from({ length: TICKS }, (_, i) => {
        const f = i / (TICKS - 1);
        const k = Math.exp(-(((f - p) / SIGMA) ** 2));
        return (
          <button
            key={i}
            type="button"
            aria-label={`Scroll to ${Math.round(f * 100)}%`}
            onClick={() => go(f)}
            className="group flex h-[10px] w-[44px] items-center justify-end"
          >
            <span
              className="block h-[1.5px] rounded-full transition-colors duration-500 group-hover:!bg-ink-mute"
              style={{ width: 11 + 25 * k, backgroundColor: k > 0.5 ? "var(--p-ink-mute)" : "var(--p-scrollbar)" }}
            />
          </button>
        );
      })}
    </nav>
  );
}
