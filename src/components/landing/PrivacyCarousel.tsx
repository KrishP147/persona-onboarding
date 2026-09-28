"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

// card headline blue; lifts to --p-blue-card's dark value on the dark ground
const BLUE = "var(--p-blue-card)";
const ICON = {
  width: 40,
  height: 40,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const CARDS: { icon: ReactNode; head: string; sub: string; body: string }[] = [
  {
    icon: (
      <svg {...ICON}>
        <path d="M12 3.5 5 6.2v5.3c0 4.3 3 7.4 7 8.9 4-1.5 7-4.6 7-8.9V6.2L12 3.5Z" />
        <path d="m9 12.2 2.1 2.1 4-4.3" />
      </svg>
    ),
    head: "Independently audited.",
    sub: "Checked by outside auditors.",
    body: "SOC 2 Type I. AES-256. ESOF verified. Independent auditors look at how we handle your data, so you don't have to take our word for it.",
  },
  {
    icon: (
      <svg {...ICON}>
        <rect x="5" y="10.5" width="14" height="10" rx="3" />
        <path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7" />
        <circle cx="12" cy="15.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
    head: "Encrypted at rest.",
    sub: "Sealed before it's stored.",
    body: "Every message, document and recap is sealed with envelope encryption before it reaches our storage, and travels over TLS on the way. Each record gets its own key, and those keys are locked again with a master key kept apart from the data.",
  },
  {
    icon: (
      <svg {...ICON}>
        <path d="M3.5 12s3.2-5.5 8.5-5.5S20.5 12 20.5 12s-3.2 5.5-8.5 5.5S3.5 12 3.5 12Z" />
        <circle cx="12" cy="12" r="2.6" />
        <path d="M4.5 4.5l15 15" />
      </svg>
    ),
    head: "Never sold, never traded.",
    sub: "Not a product, not to anyone.",
    body: "Your conversations are not a product. Not to advertisers, not to data brokers, not to anyone.",
  },
  {
    icon: (
      <svg {...ICON}>
        <path d="M5 6.5h14" />
        <path d="M9 6.5V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.5" />
        <path d="M6.5 6.5l.9 12a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12" />
        <path d="M10 10.5v6M14 10.5v6" />
      </svg>
    ),
    head: "Yours to delete.",
    sub: "Gone means gone.",
    body: "Export everything in one tap, or wipe a task, a day, or all of it. Gone means gone, on our servers too.",
  },
];

// matches the section's 1200px container gutter
const GUTTER = "max(20px, calc((100vw - 1200px) / 2 + 32px))";

function Card({ c }: { c: (typeof CARDS)[number] }) {
  const [open, setOpen] = useState(false);
  const [h, setH] = useState(0);
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const toggle = () => {
    setH(open ? 0 : (bodyRef.current?.scrollHeight ?? 0));
    setOpen(!open);
  };
  return (
    <article data-card className="flex w-[min(78vw,400px)] shrink-0 snap-start flex-col rounded-[28px] bg-alt p-7 sm:p-8">
      <span className="block" style={{ color: BLUE }}>
        {c.icon}
      </span>
      <h3 className="mt-6 font-sans text-[24px] font-semibold leading-[1.15] tracking-[-0.022em] sm:text-[25px]">
        <span style={{ color: BLUE }}>{c.head}</span>
        <br />
        <span className="text-ink">{c.sub}</span>
      </h3>
      <div className="overflow-hidden transition-[height] duration-500 ease-house" aria-hidden={!open} style={{ height: h }}>
        <p
          ref={bodyRef}
          className="max-w-[30ch] pt-4 text-[15px] leading-[1.55] text-ink-mute transition-[opacity,transform] duration-500 ease-house"
          style={{ opacity: open ? 1 : 0, transform: open ? "none" : "translateY(12px)" }}
        >
          {c.body}
        </p>
      </div>
      <div className="mt-auto flex justify-end pt-7">
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? "Less" : "More"}
          onClick={toggle}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-step-300/60 text-ink transition-colors duration-300 ease-house hover:bg-step-300"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-[16px] w-[16px] transition-transform duration-500 ease-house"
            style={{ transform: open ? "rotate(45deg)" : "none" }}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    </article>
  );
}

function Arrow({ dir, disabled, onClick }: { dir: -1 | 1; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={dir < 0 ? "Previous" : "Next"}
      disabled={disabled}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-full bg-alt text-ink transition-[background-color,color,transform] duration-200 hover:bg-step-200 active:scale-95 disabled:cursor-default disabled:text-ink/25 disabled:hover:bg-alt"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-[18px] w-[18px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={dir < 0 ? { transform: "scaleX(-1)" } : undefined}
      >
        <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
      </svg>
    </button>
  );
}

export default function PrivacyCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const sync = () => setEdge({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      el.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  const step = (dir: -1 | 1) => {
    const el = trackRef.current;
    const card = el?.querySelector<HTMLElement>("[data-card]");
    if (!el || !card) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * (card.offsetWidth + 16), behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <>
      <div
        ref={trackRef}
        className="mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-2 sm:mt-14 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ paddingLeft: GUTTER, paddingRight: GUTTER, scrollPaddingLeft: GUTTER }}
      >
        {CARDS.map((c) => (
          <Card key={c.head} c={c} />
        ))}
      </div>
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <div className="mt-4 flex justify-end gap-2">
          <Arrow dir={-1} disabled={edge.start} onClick={() => step(-1)} />
          <Arrow dir={1} disabled={edge.end} onClick={() => step(1)} />
        </div>
      </div>
    </>
  );
}
