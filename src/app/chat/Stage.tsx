"use client";
// the row of phones (and the map): items glide to their new spot when one comes or goes (flip)
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

const MS = 400;
const EASE = "cubic-bezier(.16,1,.3,1)"; // ease-house
type Box = { x: number; y: number; w: number; h: number };

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// sig: the set of items (e.g. "chat|call|map"). only a change in sig animates; resizes just re-measure.
export function Stage({ sig, animate, className, children }: { sig: string; animate: boolean; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const boxes = useRef(new Map<string, Box>());
  const nodes = useRef(new Map<string, HTMLElement>());

  const items = () => Array.from(ref.current?.querySelectorAll<HTMLElement>(":scope > [data-stage]") ?? []);
  // offsets ignore transforms, so a measure mid-animation still reads the resting spot
  const measure = (el: HTMLElement): Box => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });

  const record = () => {
    boxes.current = new Map(items().map((el) => [el.dataset.stage!, measure(el)]));
    nodes.current = new Map(items().map((el) => [el.dataset.stage!, el]));
  };

  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const prev = boxes.current;
    const prevNodes = nodes.current;
    const go = animate && prev.size > 0 && !reduced();
    const opts: KeyframeAnimationOptions = { duration: MS, easing: EASE };
    for (const el of items()) {
      const id = el.dataset.stage!;
      const now = measure(el);
      const was = prev.get(id);
      if (!go) continue;
      if (was) {
        const dx = was.x - now.x;
        const dy = was.y - now.y;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], opts);
      } else {
        // a newcomer fades in from slightly behind its neighbor
        el.animate([{ opacity: 0, transform: "translateX(-24px) scale(.98)" }, { opacity: 1, transform: "none" }], opts);
      }
    }
    // leavers: a frozen copy fades out where the item last stood
    if (go)
      for (const [id, was] of prev) {
        const old = prevNodes.get(id);
        if (!old || box.querySelector(`:scope > [data-stage="${id}"]`)) continue;
        const ghost = old.cloneNode(true) as HTMLElement;
        Object.assign(ghost.style, { position: "absolute", left: `${was.x}px`, top: `${was.y}px`, width: `${was.w}px`, height: `${was.h}px`, margin: "0", pointerEvents: "none" } satisfies Partial<CSSStyleDeclaration>);
        ghost.removeAttribute("data-stage");
        ghost.setAttribute("aria-hidden", "true");
        ghost.inert = true;
        box.appendChild(ghost);
        const a = ghost.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(-24px) scale(.98)" }], { ...opts, duration: MS * 0.75 });
        a.onfinish = a.oncancel = () => ghost.remove();
      }
    record();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, animate]);

  // sizes change without a new item (skin switch, window resize): re-measure, no motion
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const ro = new ResizeObserver(() => record());
    ro.observe(box);
    for (const el of items()) ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      {children}
    </div>
  );
}

export function StageItem({ id, className, style, children }: { id: string; className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div data-stage={id} className={className} style={style}>
      {children}
    </div>
  );
}

// a media query as state (false on the server)
export function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
