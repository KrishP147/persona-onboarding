"use client";
// the reasoning map: one node per agent turn, guards as satellites, texts and call as two lanes,
// and the onboarding milestones as a track on top (hollow until reached)
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent } from "react";
import type { Msg, Session } from "@/lib/types";
import { PIPELINE, type Turn } from "./frameworks";
import { Guards } from "./Guards";

const NODE_H = 60;
const WP_H = 22; // waypoint: an event row or the gmail link
const GAP = 14;
const LANE = 30; // call lane sits this far right of the texts lane
const PIN = 16; // edges attach this far in from a node's left edge
const SAT_H = 20;

type Step = { kind: "turn"; t: Turn; y: number; lane: 0 | 1 } | { kind: "wp"; id: string; text: string; y: number; lane: 0 | 1 };
type MState = "done" | "declined" | "open";
export type Milestone = { id: string; label: string; state: MState; at?: number };

// first turn at or after a moment (the reply that followed it)
const turnAt = (turns: Turn[], ts?: number) => (ts === undefined ? undefined : turns.find((t) => t.m.ts >= ts)?.n);

export function milestonesOf(session: Session | null, turns: Turn[], messages: Msg[]): Milestone[] {
  const slot = (k: "agentName" | "userName" | "helpNeed" | "gmail", label: string): Milestone => {
    const s = session?.slots[k];
    const state: MState = s?.status === "filled" ? "done" : s?.status === "declined" ? "declined" : "open";
    return { id: k, label, state, at: state === "done" ? turnAt(turns, s?.updatedAt) : undefined };
  };
  const voice = turns.find((t) => t.m.channel === "voice");
  const called = !!voice || messages.some((m) => m.kind === "event" && m.text.startsWith("Call started"));
  const call: Milestone = { id: "call", label: "call", state: called ? "done" : session?.callDeclinedAt !== undefined ? "declined" : "open", at: voice?.n };
  const grad = session?.phase === "graduated";
  const gradTurn = turns.find((t) => t.move.id === "graduate");
  return [
    slot("agentName", "agent name"),
    slot("userName", "your name"),
    call,
    slot("helpNeed", "what you need"),
    slot("gmail", "gmail"),
    { id: "graduated", label: "graduated", state: grad ? "done" : "open", at: grad ? gradTurn?.n : undefined },
  ];
}

// the flow: turns in order, with call lines in their own lane and events as small waypoints
function layout(messages: Msg[], byId: Map<string, Turn>) {
  const steps: Step[] = [];
  let y = 0;
  for (const m of messages) {
    const t = byId.get(m.id);
    if (t) {
      steps.push({ kind: "turn", t, y, lane: m.channel === "voice" ? 1 : 0 });
      y += NODE_H + GAP;
    } else if (m.kind === "event" || m.kind === "gmail_link") {
      const prev = steps[steps.length - 1];
      const text = m.kind === "gmail_link" ? "gmail link sent" : m.text.toLowerCase();
      // an event that opens or closes a call sits in the lane it leads into
      const lane: 0 | 1 = /^call started/.test(text) ? 1 : /^call (ended|declined)/.test(text) ? 0 : (prev?.lane ?? 0);
      steps.push({ kind: "wp", id: m.id, text, y, lane });
      y += WP_H + GAP;
    }
  }
  // no trailing waypoints before the first turn: the map starts at turn 1
  while (steps[0]?.kind === "wp") {
    const drop = steps.shift()!;
    const d = WP_H + GAP;
    for (const s of steps) s.y -= d;
    void drop;
    y -= d;
  }
  return { steps, height: Math.max(0, y - GAP) };
}

export function ReasoningMap({
  turns,
  messages,
  session,
  activeId,
  hoverId,
  select,
  setHover,
  onClose,
  metrics,
  maxHeight,
  width,
  sheet,
}: {
  turns: Turn[];
  messages: Msg[];
  session: Session | null;
  activeId: string | null; // the open node (its popover)
  hoverId: string | null;
  select: (id: string | null) => void;
  setHover: (id: string | null) => void;
  onClose: () => void;
  metrics?: string | null;
  maxHeight?: number;
  width?: number; // desktop: fixed; sheet: fills
  sheet?: boolean;
}) {
  const byId = useMemo(() => new Map(turns.map((t) => [t.m.id, t])), [turns]);
  const { steps, height } = useMemo(() => layout(messages, byId), [messages, byId]);
  const miles = useMemo(() => milestonesOf(session, turns, messages), [session, turns, messages]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [how, setHow] = useState(false);
  const [popH, setPopH] = useState(0);
  const [w, setW] = useState(width ?? 340);
  const boxRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const focusId = cursor && byId.has(cursor) ? cursor : (activeId ?? turns[turns.length - 1]?.m.id ?? null);
  const open = activeId ? steps.find((s) => s.kind === "turn" && s.t.m.id === activeId) : undefined;
  const openTurn = open?.kind === "turn" ? open.t : undefined;
  const popTop = open ? open.y + NODE_H + 8 : 0;
  const graphH = Math.max(height, open ? popTop + popH : 0);

  // node width follows the map's width; satellites get what's left
  useLayoutEffect(() => {
    const el = graphRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const nodeW = Math.min(212, Math.max(150, w - LANE - 118));
  const satX = (lane: number) => lane * LANE + nodeW + 12;

  useLayoutEffect(() => {
    setPopH(popRef.current ? popRef.current.offsetHeight + 8 : 0);
  }, [activeId, how, w]);

  // keep the open or focused node in view inside the map's own scroller
  const reveal = (id: string, withPop = false) => {
    const box = boxRef.current;
    const g = graphRef.current;
    const s = steps.find((x) => x.kind === "turn" && x.t.m.id === id);
    if (!box || !g || !s) return;
    const top = g.offsetTop + s.y - 12;
    const bottom = g.offsetTop + s.y + NODE_H + (withPop ? popH : 0) + 12;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior = reduced ? "auto" : "smooth";
    if (top < box.scrollTop) box.scrollTo({ top, behavior });
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTo({ top: Math.min(top, bottom - box.clientHeight), behavior });
  };

  useEffect(() => {
    if (activeId) requestAnimationFrame(() => reveal(activeId, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, popH]);

  // a new turn landed: follow it unless a node is open
  const last = turns[turns.length - 1]?.m.id;
  useEffect(() => {
    if (last && !activeId) reveal(last);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last]);

  const move = (d: number | "first" | "last") => {
    if (!turns.length) return;
    const i = turns.findIndex((t) => t.m.id === focusId);
    const j = d === "first" ? 0 : d === "last" ? turns.length - 1 : Math.min(turns.length - 1, Math.max(0, (i < 0 ? turns.length : i) + d));
    const id = turns[j].m.id;
    setCursor(id);
    setHover(id);
    document.getElementById(`rz-node-${id}`)?.focus({ preventScroll: true });
    reveal(id);
  };

  // j / k step anywhere on the page while the map is open; esc closes the node, then the map
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (activeId) {
          const id = activeId;
          select(null);
          document.getElementById(`rz-node-${id}`)?.focus({ preventScroll: true });
        } else onClose();
        return;
      }
      if (t?.closest?.("[data-rz-graph]")) return; // the graph's own handler covers it
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        move(e.key === "j" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onGraphKey = (e: RKeyboardEvent) => {
    const k = e.key;
    const d = k === "ArrowDown" || k === "ArrowRight" || k === "j" ? 1 : k === "ArrowUp" || k === "ArrowLeft" || k === "k" ? -1 : k === "Home" ? "first" : k === "End" ? "last" : 0;
    if (!d) return;
    e.preventDefault();
    move(d);
  };

  // edges: node to node down the spine, curving across when the lane changes
  const x0 = (lane: number) => lane * LANE + PIN;
  const edges: string[] = [];
  for (let i = 1; i < steps.length; i++) {
    const a = steps[i - 1];
    const b = steps[i];
    const ay = a.y + (a.kind === "turn" ? NODE_H : WP_H);
    const by = b.y;
    const ax = x0(a.lane);
    const bx = x0(b.lane);
    edges.push(ax === bx ? `M${ax} ${ay}V${by}` : `M${ax} ${ay}C${ax} ${ay + GAP} ${bx} ${by - GAP} ${bx} ${by}`);
  }
  // call bands: runs of the call lane
  const bands: { y: number; h: number }[] = [];
  for (const s of steps) {
    const bottom = s.y + (s.kind === "turn" ? NODE_H : WP_H);
    const prev = bands[bands.length - 1];
    if (s.lane !== 1) continue;
    const prevStep = steps[steps.indexOf(s) - 1];
    if (prev && prevStep?.lane === 1) prev.h = bottom - prev.y;
    else bands.push({ y: s.y, h: bottom - s.y });
  }
  const nextMile = miles.find((m) => m.state === "open");
  const lastStep = steps[steps.length - 1];
  const tailY = lastStep ? lastStep.y + (lastStep.kind === "turn" ? NODE_H : WP_H) : 0;

  return (
    <section
      aria-label="Reasoning map"
      className={`flex flex-col text-ink ${sheet ? "h-full" : "rounded-[28px] bg-alt"}`}
      style={{ width: sheet ? undefined : width, maxHeight: sheet ? undefined : maxHeight }}
    >
      <header className={`flex items-start justify-between gap-3 ${sheet ? "px-5 pt-1" : "px-5 pt-4"}`}>
        <div>
          <h2 className="text-[17px] leading-6 font-semibold tracking-[-0.2px]">Reasoning</h2>
          <p className="text-[12.5px] leading-[18px] text-ink-mute">
            {turns.length ? `${turns.length} turn${turns.length === 1 ? "" : "s"} · click a node` : "each reply becomes a node here"}
          </p>
        </div>
        <button onClick={onClose} aria-label="Close reasoning map" className="w-9 h-9 -mr-2 rounded-full flex items-center justify-center text-ink-mute hover:text-ink hover:bg-step-200">
          <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" />
          </svg>
        </button>
      </header>
      <MilestoneTrack miles={miles} />
      <div ref={boxRef} className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-5 pt-1">
        <div
          ref={graphRef}
          data-rz-graph
          role="list"
          aria-label="Turns"
          onKeyDown={onGraphKey}
          className="relative"
          style={{ height: graphH + (nextMile && turns.length ? GAP + 26 : 0) }}
        >
          <svg className="absolute inset-0 overflow-visible pointer-events-none" width="100%" height="100%" aria-hidden>
            {bands.map((b, i) => (
              <rect key={i} x={LANE - 8} y={b.y - 6} width={nodeW + 16} height={b.h + 12} rx="18" fill="var(--color-pgreen)" opacity=".1" />
            ))}
            {edges.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="var(--p-step-300)" strokeWidth="1.5" />
            ))}
            {steps.map((s) =>
              s.kind === "turn" && s.t.guards.length ? <path key={`g${s.t.m.id}`} d={`M${s.lane * LANE + nodeW} ${s.y + NODE_H / 2}H${satX(s.lane)}`} stroke="var(--p-step-300)" strokeWidth="1" strokeDasharray="2 2" fill="none" /> : null,
            )}
            {nextMile && turns.length > 0 && <path d={`M${x0(0)} ${tailY}V${tailY + GAP}`} stroke="var(--p-step-300)" strokeWidth="1.5" strokeDasharray="3 3" fill="none" />}
          </svg>
          {bands.map((b, i) => (
            <span key={i} className="absolute text-[10.5px] font-semibold tracking-[0.08em] uppercase text-ink-faint" style={{ top: b.y - 2, left: LANE + nodeW + 14 }} aria-hidden>
              {steps.some((s) => s.lane === 1 && s.kind === "turn" && s.t.guards.length && s.y >= b.y && s.y < b.y + b.h) ? null : "call"}
            </span>
          ))}
          {steps.map((s) =>
            s.kind === "wp" ? (
              <div key={s.id} className="absolute flex items-center gap-1.5 text-[11.5px] text-ink-mute" style={{ top: s.y, left: s.lane * LANE + PIN - 5, height: WP_H }} role="listitem">
                <span className="w-[10px] h-[10px] rotate-45 rounded-[2px] border-[1.5px] border-ink-faint bg-alt shrink-0" aria-hidden />
                <span className="truncate" style={{ maxWidth: nodeW }}>
                  {s.text}
                </span>
              </div>
            ) : (
              <TurnNode
                key={s.t.m.id}
                s={s}
                w={nodeW}
                satX={satX(s.lane)}
                satW={w - satX(s.lane)}
                on={s.t.m.id === activeId}
                hot={s.t.m.id === hoverId}
                tab={s.t.m.id === focusId}
                onOpen={() => {
                  setCursor(s.t.m.id);
                  select(s.t.m.id === activeId ? null : s.t.m.id);
                }}
                setHover={setHover}
              />
            ),
          )}
          {nextMile && turns.length > 0 && (
            <div className="absolute flex items-center gap-2 text-[12px] text-ink-faint" style={{ top: tailY + GAP, left: 0, height: 26 }} role="listitem">
              <span className="h-[26px] px-3 rounded-full border-[1.5px] border-dashed border-step-300 flex items-center">next: {nextMile.label}</span>
            </div>
          )}
          {openTurn && (
            <div ref={popRef} className="absolute inset-x-0 z-10" style={{ top: popTop }}>
              <NodeDetail t={openTurn} how={how} setHow={setHow} metrics={metrics} onClose={() => select(null)} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function TurnNode({
  s,
  w,
  satX,
  satW,
  on,
  hot,
  tab,
  onOpen,
  setHover,
}: {
  s: Extract<Step, { kind: "turn" }>;
  w: number;
  satX: number;
  satW: number;
  on: boolean;
  hot: boolean;
  tab: boolean;
  onOpen: () => void;
  setHover: (id: string | null) => void;
}) {
  const t = s.t;
  const shown = t.guards.length > 2 ? t.guards.slice(0, 1) : t.guards;
  const more = t.guards.length - shown.length;
  const top = s.y + (NODE_H - (shown.length + (more ? 1 : 0)) * (SAT_H + 2)) / 2;
  return (
    <div role="listitem">
      <button
        id={`rz-node-${t.m.id}`}
        tabIndex={tab ? 0 : -1}
        aria-expanded={on}
        aria-label={`Turn ${t.n}, ${t.fw.label}: ${t.move.label}${t.m.channel === "voice" ? ", on the call" : ""}${t.guards.length ? `, ${t.guards.length} check${t.guards.length === 1 ? "" : "s"}` : ""}`}
        onClick={onOpen}
        onMouseEnter={() => setHover(t.m.id)}
        onMouseLeave={() => setHover(null)}
        onFocus={() => setHover(t.m.id)}
        onBlur={() => setHover(null)}
        className={`absolute text-left rounded-[16px] bg-canvas border pl-3 pr-2.5 py-2 transition-[box-shadow,border-color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pblue ${on || hot ? "shadow-[0_8px_24px_-12px_rgba(19,21,21,.35)]" : ""}`}
        style={{ top: s.y, left: s.lane * LANE, width: w, height: NODE_H, borderColor: on || hot ? t.fw.color : "var(--p-step-200)", borderWidth: on ? 1.5 : 1 }}
      >
        <span className="flex items-center gap-1.5 text-[11px] leading-4">
          <span className="font-mono font-semibold px-1 rounded bg-alt text-ink">T{t.n}</span>
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: t.fw.color }} aria-hidden />
          <span className="font-medium truncate" style={{ color: t.fw.color }}>
            {t.fw.label}
          </span>
        </span>
        <span className="mt-1 block text-[13px] leading-[17px] font-medium text-ink truncate">
          {t.move.label}
        </span>
      </button>
      {/* guards that fired: satellites on the node's right */}
      {t.guards.length > 0 && (
        <ul className="absolute flex flex-col gap-[2px]" style={{ top, left: satX, maxWidth: Math.max(60, satW) }} aria-hidden>
          {shown.map((g) => (
            <li key={g} className="h-5 inline-flex items-center gap-1 rounded-full border border-step-300 bg-canvas px-1.5 text-[10.5px] text-ink-mute max-w-full">
              <Shield />
              <span className="truncate">{g}</span>
            </li>
          ))}
          {more > 0 && <li className="h-5 inline-flex items-center gap-1 self-start rounded-full border border-step-300 bg-canvas px-1.5 text-[10.5px] text-ink-mute">+{more} more</li>}
        </ul>
      )}
    </div>
  );
}

const Shield = () => (
  <svg width="9" height="10" viewBox="0 0 10 11" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
    <path d="M5 1 1.5 2.3v3C1.5 7.6 3 9.2 5 10c2-.8 3.5-2.4 3.5-4.7v-3L5 1Z" />
  </svg>
);

// the milestones as a compact track: filled once reached (with the turn), dashed if declined, hollow ahead
function MilestoneTrack({ miles }: { miles: Milestone[] }) {
  return (
    <ol className="grid grid-cols-6 px-3 pt-3 pb-3" aria-label="Onboarding progress">
      {miles.map((m, i) => {
        const label = `${m.label}: ${m.state === "done" ? `reached${m.at ? ` at turn ${m.at}` : ""}` : m.state === "declined" ? "declined" : "not yet"}`;
        return (
          <li key={m.id} className="relative flex flex-col items-center text-center" aria-label={label}>
            {i > 0 && <span className={`absolute top-[7px] right-1/2 w-full h-[1.5px] ${m.state === "done" ? "bg-ink-faint" : "bg-step-300"}`} aria-hidden />}
            <span
              className={`relative z-[1] w-[16px] h-[16px] rounded-full flex items-center justify-center ${m.state === "done" ? "bg-ink text-canvas" : m.state === "declined" ? "bg-alt border-[1.5px] border-dashed border-ink-faint" : "bg-alt border-[1.5px] border-step-300"}`}
              aria-hidden
            >
              {m.state === "done" && (
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m1.5 4.2 1.7 1.6L6.5 2.3" />
                </svg>
              )}
            </span>
            <span className={`mt-1 text-[10.5px] leading-[13px] ${m.state === "open" ? "text-ink-faint" : "text-ink"}`} aria-hidden>
              {m.label}
            </span>
            <span className="text-[10px] leading-3 font-mono text-ink-faint" aria-hidden>
              {m.state === "done" ? (m.at ? `T${m.at}` : "") : m.state === "declined" ? "no" : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// the open node: its message, move, framework, source, checks, and how it decides
function NodeDetail({ t, how, setHow, metrics, onClose }: { t: Turn; how: boolean; setHow: (v: boolean) => void; metrics?: string | null; onClose: () => void }) {
  return (
    <div role="dialog" aria-label={`Turn ${t.n} detail`} className="rounded-[20px] bg-canvas border border-step-200 shadow-[0_18px_40px_-18px_rgba(19,21,21,.35)] px-4 pt-3 pb-3.5 sk-fade">
      <div className="flex items-center gap-2 text-[12px] leading-4">
        <span className="font-mono text-[11px] font-semibold px-1.5 py-[1px] rounded-md bg-alt">T{t.n}</span>
        <span className="font-medium" style={{ color: t.fw.color }}>
          {t.fw.label}
        </span>
        {t.m.channel === "voice" && <span className="text-ink-faint">· on the call</span>}
        <span className="flex-1" />
        <button onClick={onClose} aria-label="Close detail" className="w-7 h-7 -mr-1.5 rounded-full flex items-center justify-center text-ink-mute hover:bg-alt">
          <svg width="10" height="10" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" />
          </svg>
        </button>
      </div>
      <div className="mt-1 text-[15px] leading-5 font-medium tracking-[-0.1px]">{t.move.label}</div>
      <p className="mt-1.5 text-[13px] leading-[18px] text-ink-mute">&ldquo;{t.m.text}&rdquo;</p>
      <p className="mt-2 text-[13px] leading-[18px]">
        <span className="font-medium">{t.fw.label}:</span> <span className="text-ink-mute">{t.fw.gist}</span>
      </p>
      <p className="mt-1.5 text-[12px] leading-4 italic text-ink-faint">{t.move.source}</p>
      <Guards guards={t.guards} ink="var(--p-ink-mute)" mute="var(--p-ink-faint)" line="var(--p-step-200)" />
      <p className="mt-2 text-[12px] leading-4 text-ink-faint">traced: code picked this move before the model wrote a word. the wording is the model&apos;s.</p>
      <button onClick={() => setHow(!how)} aria-expanded={how} aria-controls={`rz-how-${t.m.id}`} className="mt-2 min-h-8 text-[13px] font-medium text-pblue flex items-center gap-1">
        How it decides
        <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform duration-200 ${how ? "rotate-180" : ""}`} aria-hidden>
          <path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {how && (
        <ol id={`rz-how-${t.m.id}`} className="mt-1 space-y-2">
          {PIPELINE.map(([title, detail], i) => (
            <li key={title} className="flex gap-2.5">
              <span className="shrink-0 w-5 h-5 rounded-full bg-alt text-[11px] font-semibold flex items-center justify-center">{i + 1}</span>
              <div>
                <div className="text-[13px] leading-[18px]">{title}</div>
                <div className="text-[12px] leading-4 text-ink-mute">{detail}</div>
              </div>
            </li>
          ))}
          {metrics && <li className="text-[12px] leading-4 text-ink-faint">{metrics}</li>}
        </ol>
      )}
    </div>
  );
}

// the pill left of the phone: glyph + label, a soft glow when a new turn lands
export function ReasoningPill({ on, onClick, pulse, unseen, compact }: { on: boolean; onClick: () => void; pulse: number; unseen: number; compact?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      aria-label={compact ? (on ? "Hide reasoning" : "Examine reasoning") : undefined}
      className={`relative h-9 rounded-full border border-step-300 bg-canvas text-[14px] font-medium text-ink hover:bg-alt active:scale-[.98] transition-[background-color,transform] duration-150 ease-[var(--ease-press)] flex items-center gap-2 whitespace-nowrap ${compact ? "w-9 justify-center" : "pl-3 pr-4"}`}
    >
      {!on && pulse > 0 && <span key={pulse} className="rz-glow absolute inset-0 rounded-full pointer-events-none" aria-hidden />}
      <MapGlyph />
      {!compact && <span>{on ? "Hide reasoning" : "Examine reasoning"}</span>}
      {!on && unseen > 0 && (
        <span className="rz-count absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-pblue text-white text-[11px] font-semibold items-center justify-center" aria-label={`${unseen} new`}>
          {unseen}
        </span>
      )}
    </button>
  );
}

export const MapGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
    <circle cx="4" cy="3.5" r="2" />
    <circle cx="4" cy="12.5" r="2" />
    <circle cx="12" cy="8" r="2" />
    <path d="M4 5.5v5M5.8 4.5 10.3 7M5.8 11.5 10.3 9" strokeLinecap="round" />
  </svg>
);
