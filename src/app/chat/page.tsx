"use client";
// the web sim: persona page chrome around a phone (iphone, pixel or galaxy), plus the reasoning map on demand
import { useCallback, useMemo, useRef, useState } from "react";
import { MenuSheet, TopBar } from "./chrome";
import { Intro } from "./Intro";
import { CallPhone, DeviceFrame, FRAMES, PhoneScreen, useFrameZoom } from "./Phone";
import { SKINS, useSkin } from "./skins";
import { Stage, StageItem, useMedia, useViewportWidth } from "./Stage";
import type { WhyHooks } from "./Thread";
import { useChat } from "./useChat";
import { usePref } from "./usePref";
import { turnsOf } from "./why/frameworks";
import { metricsLine } from "./why/metrics";
import { ReasoningMap, ReasoningPill } from "./why/ReasoningMap";

const MAP_W = 392;

export default function Home() {
  const chat = useChat();
  const [picked, setSkin] = useSkin();
  const skin = picked ?? SKINS.pixel;
  const zoom = useFrameZoom(skin.id);
  const lg = useMedia("(min-width: 1024px)");
  const vw = useViewportWidth();
  // reasoning: off until asked for, remembered
  const [showWhy, setShowWhy] = usePref("persona-show-reasoning", false);
  const [typingHints, setTypingHintsRaw] = usePref("persona-typing-hints", true);
  // a short toast so flipping hints on or off is never silent
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setTypingHints = (v: boolean) => {
    setTypingHintsRaw(v);
    setToast(v ? "typing hints on" : "typing hints off");
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1500);
  };
  const [menuOpen, setMenuOpen] = useState(false); // phone: picker, reasoning, restart
  const [hoverId, setHoverRaw] = useState<string | null>(null);
  const [activeId, setActive] = useState<string | null>(null);
  const [seenN, setSeenN] = useState(0); // turns there were when the map was last open
  const scrollRef = useRef<HTMLDivElement>(null);

  const turns = useMemo(() => turnsOf(chat.messages), [chat.messages]);
  const byId = useMemo(() => new Map(turns.map((t) => [t.m.id, t])), [turns]);
  const setHover = useCallback((id: string | null) => setHoverRaw(id), []);

  // bring a bubble into view inside the phone: middle on a wide screen, top part above the sheet on a phone
  const reveal = useCallback(
    (id: string) => {
      const sc = scrollRef.current;
      const el = sc?.querySelector<HTMLElement>(`[data-msg-id="${id}"]`);
      if (!sc || !el) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const top = lg ? el.offsetTop - (sc.clientHeight - el.offsetHeight) / 2 : el.offsetTop - sc.clientHeight * 0.12;
      sc.scrollTo({ top: Math.max(0, top), behavior: reduced ? "auto" : "smooth" });
    },
    [lg],
  );

  const select = useCallback(
    (id: string | null) => {
      setActive(id);
      // after the sheet's spacer lands, so the last bubble can scroll up too
      if (id) requestAnimationFrame(() => requestAnimationFrame(() => reveal(id)));
    },
    [reveal],
  );

  const toggleWhy = useCallback(
    (on: boolean) => {
      setShowWhy(on);
      setSeenN(turns.length);
      if (!on) {
        setActive(null);
        setHoverRaw(null);
        // focus goes back to whichever pill is on screen
        requestAnimationFrame(() =>
          Array.from(document.querySelectorAll<HTMLElement>("[data-rz-pill] button"))
            .find((b) => b.offsetParent)
            ?.focus({ preventScroll: true }),
        );
      }
    },
    [setShowWhy, turns.length],
  );

  const why: WhyHooks = {
    on: showWhy,
    byId,
    hoverId,
    activeId,
    setHover,
    select: (id) => select(id),
    sheetOpen: showWhy && !lg,
  };

  const metrics = metricsLine(chat.session);
  const restart = chat.restart;
  const frame = FRAMES[skin.id];
  const call = chat.call.status !== "idle";
  const phoneH = Math.round(frame.h * zoom);

  const unseen = showWhy ? 0 : Math.max(0, turns.length - seenN);
  const pill = (compact: boolean) => <ReasoningPill on={showWhy} onClick={() => toggleWhy(!showWhy)} pulse={turns.length} unseen={unseen} compact={compact} />;

  const map = (sheet: boolean) => (
    <ReasoningMap
      turns={turns}
      messages={chat.messages}
      session={chat.session}
      activeId={activeId}
      hoverId={hoverId}
      select={select}
      setHover={setHover}
      onClose={() => toggleWhy(false)}
      metrics={metrics}
      maxHeight={phoneH}
      width={sheet ? undefined : MAP_W}
      sheet={sheet}
    />
  );

  return (
    <main className="min-h-dvh bg-canvas text-ink flex flex-col overflow-x-clip">
      <TopBar skin={picked?.id ?? null} setSkin={setSkin} pill={pill(vw < 768)} typingHints={typingHints} toggleTypingHints={() => setTypingHints(!typingHints)} onRestart={restart} mock={chat.mock} />
      {/* phones sit centered; a call adds a second phone and the map joins on the right, all gliding to share the middle (lg+) */}
      <Stage
        sig={[call ? "call" : "", showWhy && lg ? "map" : ""].join("|")}
        animate={lg}
        className={`flex-1 flex flex-wrap justify-center items-start gap-x-10 gap-y-6 sm:px-6 sm:pb-6 transition-opacity duration-300 ${picked ? "opacity-100" : "opacity-0"}`}
      >
        <StageItem id="chat" className="relative w-full sm:w-auto">
          <DeviceFrame skin={skin} bp="sm" zoom={zoom}>
            <PhoneScreen skin={skin} chat={chat} why={why} scrollRef={scrollRef} onMenu={() => setMenuOpen(true)} />
          </DeviceFrame>
        </StageItem>
        {call && (
          // below lg the call is full screen (fixed), so its wrapper takes no room in the row
          <StageItem id="call" className="max-lg:contents">
            <CallPhone skin={skin} chat={chat} zoom={zoom} />
          </StageItem>
        )}
        {showWhy && lg && (
          <StageItem id="map" className="flex">
            {map(false)}
          </StageItem>
        )}
      </Stage>
      {/* below lg: the map is a bottom sheet over the page, the phone's texts still scroll above it */}
      {showWhy && !lg && (
        <div className="fixed inset-x-0 bottom-0 z-30 h-[52dvh] rounded-t-[28px] bg-canvas shadow-[0_-10px_40px_-12px_rgba(19,21,21,.3)] flex flex-col sk-sheet-ios font-sans">
          <div className="flex justify-center pt-2 pb-1" aria-hidden>
            <span className="w-9 h-[5px] rounded-full bg-step-300" />
          </div>
          <div className="flex-1 min-h-0 flex flex-col">{map(true)}</div>
        </div>
      )}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(24px+env(safe-area-inset-bottom,0px))] z-50 flex justify-center">
        {toast && <span className="sk-fade rounded-full bg-ink text-canvas text-[14px] font-medium px-4 py-2 shadow-lg">{toast}</span>}
      </div>
      {menuOpen && (
        <MenuSheet
          skin={picked?.id ?? null}
          setSkin={setSkin}
          canReason={turns.length > 0}
          onReasoning={() => {
            setMenuOpen(false);
            if (!showWhy) toggleWhy(true);
            const last = turns[turns.length - 1];
            if (last) select(last.m.id);
          }}
          typingHints={typingHints}
          setTypingHints={setTypingHints}
          mock={chat.mock}
          onClose={() => setMenuOpen(false)}
          onRestart={() => {
            if (window.confirm("Start over with a fresh conversation?")) restart();
          }}
        />
      )}
      <Intro />
    </main>
  );
}
