"use client";
// desktop: one card per agent turn, anchored beside its bubble like a docs comment
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { PIPELINE, type Turn } from "./frameworks";

const GAP = 8;

export function WhySidebar({
  turns,
  scrollRef,
  activeId,
  hoverId,
  setActive,
  setHover,
  expanded,
  setExpanded,
  height,
  metrics,
}: {
  turns: Turn[];
  metrics?: string | null; // "this session: n turns · $x · p50 yms", when the server sends it
  scrollRef: RefObject<HTMLDivElement | null>;
  activeId: string | null;
  hoverId: string | null;
  setActive: (id: string | null) => void;
  setHover: (id: string | null) => void;
  expanded: string | null;
  setExpanded: (id: string | null) => void;
  height: number;
}) {
  const [howOpen, setHowOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null); // the lane's scroller
  const laneRef = useRef<HTMLOListElement>(null);
  const cardRefs = useRef(new Map<string, HTMLLIElement>());
  const ys = useRef(new Map<string, { y: number; h: number }>());
  const quietUntil = useRef(0); // lane scrolls we made ourselves don't drive the thread
  const seen = useRef("");
  const lastSc = useRef(0);

  // thread px -> lane px (the framed phone is css-zoomed, the lane isn't)
  const ratio = (sc: HTMLElement) => sc.getBoundingClientRect().height / (sc.offsetHeight || 1) || 1;

  const scrollLane = useCallback((top: number, smooth = false) => {
    const box = boxRef.current;
    if (!box || Math.abs(box.scrollTop - top) < 1) return;
    quietUntil.current = performance.now() + (smooth ? 700 : 120);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollTo({ top, behavior: smooth && !reduced ? "smooth" : "auto" });
  }, []);

  // bring a card fully into the lane's view
  const showCard = useCallback(
    (id: string, smooth = true) => {
      const box = boxRef.current;
      const c = ys.current.get(id);
      if (!box || !c) return;
      const pad = 12;
      const foot = 32; // clear of the lane's bottom fade
      if (c.y < box.scrollTop + pad) scrollLane(Math.max(0, c.y - pad), smooth);
      else if (c.y + c.h > box.scrollTop + box.clientHeight - foot) scrollLane(Math.min(c.y - pad, c.y + c.h - box.clientHeight + foot), smooth);
    },
    [scrollLane],
  );

  // the lane scrolls with the thread; past the thread's end it keeps going on its own
  const follow = useCallback(() => {
    const sc = scrollRef.current;
    const box = boxRef.current;
    if (!sc || !box) return;
    const target = Math.round(sc.scrollTop * ratio(sc));
    const down = sc.scrollTop >= lastSc.current;
    lastSc.current = sc.scrollTop;
    // the lane may run ahead (a newer card below the thread's end): only the thread going up pulls it back
    if (down && box.scrollTop > target) return;
    scrollLane(target);
  }, [scrollRef, scrollLane]);

  // place each card level with its bubble (in thread content coords, so scrolling moves both together);
  // push apart on collision, the active one wins its spot. turns without a bubble (the call) follow in order.
  const layout = useCallback(() => {
    const lane = laneRef.current;
    const box = boxRef.current;
    const sc = scrollRef.current;
    if (!lane || !box || !sc) return;
    const k = ratio(sc);
    // offsetTop, not rects: bubbles animate in with transforms, and offsets don't move with scroll
    const shift = sc.getBoundingClientRect().top - box.getBoundingClientRect().top;
    const items = turns.map((t) => {
      const el = cardRefs.current.get(t.m.id);
      const bubble = sc.querySelector<HTMLElement>(`[data-msg-id="${t.m.id}"]`);
      return { id: t.m.id, el, h: el?.offsetHeight ?? 0, want: bubble ? bubble.offsetTop * k + shift : null, y: 0 };
    });
    let prev = 0;
    items.forEach((it) => {
      it.y = Math.max(it.want ?? prev, prev);
      prev = it.y + it.h + GAP;
    });
    const a = items.findIndex((it) => it.id === activeId);
    if (a >= 0 && items[a].want !== null) {
      items[a].y = Math.max(0, items[a].want!);
      for (let i = a + 1; i < items.length; i++) items[i].y = Math.max(items[i].y, items[i - 1].y + items[i - 1].h + GAP);
      for (let i = a - 1; i >= 0; i--) items[i].y = Math.min(items[i].y, items[i + 1].y - items[i].h - GAP);
      // nothing above the lane's top: if the chain ran out of room, slide it all down
      const over = -Math.min(0, items[0]?.y ?? 0);
      if (over) for (const it of items) it.y += over;
    }
    ys.current = new Map(items.map((it) => [it.id, { y: it.y, h: it.h }]));
    for (const it of items) if (it.el) it.el.style.transform = `translateY(${Math.round(it.y)}px)`;
    // tall enough to follow the thread all the way down, and to reach the last card
    const scMax = Math.max(0, sc.scrollHeight - sc.clientHeight) * k;
    lane.style.height = `${Math.ceil(Math.max(prev + 40, scMax + box.clientHeight))}px`;
  }, [turns, activeId, scrollRef]);

  useLayoutEffect(() => {
    layout();
  });

  // the newest card moved or grew (a new turn, its bubble revealed): keep it in view while the thread sits at its end
  useLayoutEffect(() => {
    const sc = scrollRef.current;
    const last = turns[turns.length - 1];
    const c = last && ys.current.get(last.m.id);
    if (!sc || !c) return;
    const key = `${last.m.id}:${Math.round(c.y)}:${c.h}`;
    if (key === seen.current) return;
    seen.current = key;
    const nearEnd = sc.scrollTop >= sc.scrollHeight - sc.clientHeight - 80;
    if (nearEnd && !activeId) requestAnimationFrame(() => showCard(last.m.id));
  });

  useEffect(() => {
    const sc = scrollRef.current;
    const box = boxRef.current;
    const ro = new ResizeObserver(() => {
      layout();
      follow();
    });
    cardRefs.current.forEach((el) => ro.observe(el));
    if (box) ro.observe(box);
    if (sc) {
      ro.observe(sc);
      // bubbles change height (fonts, images) without the list scrolling
      sc.querySelectorAll("[data-msg-id]").forEach((el) => ro.observe(el));
    }
    void document.fonts?.ready.then(layout);
    // wheel over the lane scrolls the thread too
    const onLane = () => {
      if (!sc || !box || performance.now() < quietUntil.current) return;
      sc.scrollTop = box.scrollTop / ratio(sc);
    };
    sc?.addEventListener("scroll", follow, { passive: true });
    box?.addEventListener("scroll", onLane, { passive: true });
    window.addEventListener("resize", layout);
    follow();
    return () => {
      ro.disconnect();
      sc?.removeEventListener("scroll", follow);
      box?.removeEventListener("scroll", onLane);
      window.removeEventListener("resize", layout);
    };
  }, [layout, follow, scrollRef, turns.length]);

  // select a turn: open its card, bring its bubble to the middle of the phone, and the card into view
  const select = useCallback(
    (id: string) => {
      setActive(id);
      setExpanded(id);
      const sc = scrollRef.current;
      const bubble = sc?.querySelector<HTMLElement>(`[data-msg-id="${id}"]`);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // scroll the thread only, never the page
      if (sc && bubble) sc.scrollTo({ top: bubble.offsetTop - (sc.clientHeight - bubble.offsetHeight) / 2, behavior: reduced ? "auto" : "smooth" });
      // after the card has grown and the thread has glided (a call turn has no bubble: lane only)
      window.setTimeout(() => showCard(id), bubble ? 450 : 60);
    },
    [setActive, setExpanded, scrollRef, showCard],
  );

  // j/k (or arrows while the list has focus) walk the turns
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const inList = !!t?.closest?.("[data-why-list]");
      const next = e.key === "j" || (inList && e.key === "ArrowDown");
      const prev = e.key === "k" || (inList && e.key === "ArrowUp");
      if (e.key === "Escape" && expanded) {
        setExpanded(null);
        return;
      }
      if (!next && !prev) return;
      if (!turns.length) return;
      e.preventDefault();
      const i = turns.findIndex((x) => x.m.id === activeId);
      const j = i < 0 ? (next ? 0 : turns.length - 1) : Math.min(turns.length - 1, Math.max(0, i + (next ? 1 : -1)));
      const id = turns[j].m.id;
      select(id);
      document.getElementById(`why-btn-${id}`)?.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [turns, activeId, expanded, select, setExpanded]);

  return (
    <aside className="flex flex-col w-[380px] xl:w-[420px] shrink-0" style={{ height }} aria-label="Why it said that">
      <div className="pb-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[20px] leading-[26px] font-medium tracking-[-0.3px] text-ink">Why it said that</h2>
          <span className="text-[12px] text-ink-faint">
            <kbd className="font-sans">j</kbd> / <kbd className="font-sans">k</kbd> to step
          </span>
        </div>
        <button onClick={() => setHowOpen((v) => !v)} aria-expanded={howOpen} aria-controls="why-how" className="mt-1 text-[14px] text-ink-mute hover:text-ink flex items-center gap-1">
          <span>How it decides</span>
          <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform duration-200 ${howOpen ? "rotate-180" : ""}`} aria-hidden>
            <path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        {howOpen && (
          <ol id="why-how" className="mt-3 rounded-[20px] bg-alt px-4 py-3 space-y-2.5">
            {PIPELINE.map(([title, detail], i) => (
              <li key={title} className="flex gap-3">
                <span className="shrink-0 w-5 h-5 mt-[1px] rounded-full bg-white text-ink text-[11px] font-semibold flex items-center justify-center">{i + 1}</span>
                <div>
                  <div className="text-[14px] leading-5 text-ink">{title}</div>
                  <div className="text-[12.5px] leading-[18px] text-ink-mute">{detail}</div>
                </div>
              </li>
            ))}
            {metrics && <li className="pt-0.5 text-[12.5px] leading-[18px] text-ink-faint">{metrics}</li>}
          </ol>
        )}
      </div>
      <div
        ref={boxRef}
        className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:var(--p-step-200)_transparent]"
        style={{ maskImage: "linear-gradient(#000 calc(100% - 24px), transparent)", WebkitMaskImage: "linear-gradient(#000 calc(100% - 24px), transparent)" }}
      >
        {turns.length === 0 && <p className="text-[14px] text-ink-mute pt-2">each reply gets a card here: the move code picked, and the research behind it.</p>}
        <ol ref={laneRef} className="relative" role="list" data-why-list>
          {turns.map((t) => {
            const on = t.m.id === activeId;
            const hot = on || t.m.id === hoverId;
            const open = expanded === t.m.id;
            return (
              <li
                key={t.m.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(t.m.id, el);
                  else cardRefs.current.delete(t.m.id);
                }}
                className="absolute inset-x-0 top-0 transition-transform duration-200 ease-[var(--ease-house)] motion-reduce:transition-none"
              >
                <div
                  className={`relative rounded-[16px] bg-white border transition-[box-shadow,border-color] duration-150 overflow-hidden ${hot ? "shadow-[0_10px_30px_-12px_rgba(19,21,21,.28)]" : "shadow-[0_1px_2px_rgba(19,21,21,.04)]"}`}
                  style={{ borderColor: hot ? t.fw.color : "var(--p-step-200)" }}
                  onMouseEnter={() => setHover(t.m.id)}
                  onMouseLeave={() => setHover(null)}
                >
                  <span className="absolute left-0 inset-y-0 w-[3px]" style={{ background: t.fw.color }} aria-hidden />
                  <button
                    id={`why-btn-${t.m.id}`}
                    onClick={() => (open ? setExpanded(null) : select(t.m.id))}
                    onFocus={() => setHover(t.m.id)}
                    onBlur={() => setHover(null)}
                    aria-expanded={open}
                    aria-controls={`why-more-${t.m.id}`}
                    className="w-full text-left pl-4 pr-3.5 pt-3 pb-3 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pblue"
                  >
                    <div className="flex items-center gap-2 text-[12px] leading-4">
                      <span className="font-mono text-[11px] font-semibold px-1.5 py-[1px] rounded-md bg-alt text-ink" aria-label={`turn ${t.n}`}>
                        T{t.n}
                      </span>
                      <span className="font-medium" style={{ color: t.fw.color }}>
                        {t.fw.label}
                      </span>
                      {t.m.channel === "voice" && <span className="text-ink-faint">· on the call</span>}
                      <span className="flex-1" />
                      <svg width="10" height="10" viewBox="0 0 10 10" className={`text-ink-faint transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden>
                        <path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div className="mt-1.5 text-[15px] leading-5 font-medium text-ink tracking-[-0.1px]">{t.move.label}</div>
                    <div className={`mt-1 text-[13px] leading-[18px] text-ink-mute ${open ? "" : "line-clamp-2"}`}>&ldquo;{t.m.text}&rdquo;</div>
                    <div className={`mt-1.5 text-[12px] leading-4 text-ink-faint italic ${open ? "" : "line-clamp-1"}`}>{t.move.source}</div>
                  </button>
                  {open && (
                    <div id={`why-more-${t.m.id}`} className="pl-4 pr-3.5 pb-3.5 -mt-0.5 text-[13px] leading-[19px] text-ink-mute space-y-2">
                      <p>
                        <span className="text-ink font-medium">{t.fw.label}:</span> {t.fw.gist}
                      </p>
                      <p className="text-[12px] text-ink-faint">traced: code picked this move before the model wrote a word. the wording is the model&apos;s.</p>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </aside>
  );
}
