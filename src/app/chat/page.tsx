"use client";
// the web sim: persona page chrome around a phone (iphone, pixel or galaxy), plus "why it said that"
import { useCallback, useMemo, useRef, useState } from "react";
import { MenuSheet, TopBar } from "./chrome";
import { Intro } from "./Intro";
import { CallPhone, DeviceFrame, FRAMES, PhoneScreen, useFrameZoom } from "./Phone";
import { SKINS, useSkin } from "./skins";
import { Stage, StageItem, useMedia } from "./Stage";
import type { WhyHooks } from "./Thread";
import { useChat } from "./useChat";
import { usePref } from "./usePref";
import { turnsOf } from "./why/frameworks";
import { WhySheet } from "./why/WhySheet";
import { metricsLine } from "./why/metrics";
import { WhySidebar } from "./why/WhySidebar";

const wide = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

export default function Home() {
  const chat = useChat();
  const [picked, setSkin] = useSkin();
  const skin = picked ?? SKINS.pixel;
  const zoom = useFrameZoom(skin.id);
  const lg = useMedia("(min-width: 1024px)");
  // desktop reasoning lane: collapsed until asked for, remembered
  const [showWhy, setShowWhy] = usePref("persona-show-reasoning", false);
  const [menuOpen, setMenuOpen] = useState(false); // phone: picker, annotate, how it works, restart
  const [annotate, setAnnotate] = useState(false);
  const [hoverId, setHover] = useState<string | null>(null);
  const [activeId, setActive] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const turns = useMemo(() => turnsOf(chat.messages), [chat.messages]);
  const byId = useMemo(() => new Map(turns.map((t) => [t.m.id, t])), [turns]);

  // keep the explained bubble in the top half, above the sheet
  const reveal = useCallback((id: string) => {
    const sc = scrollRef.current;
    const el = sc?.querySelector<HTMLElement>(`[data-msg-id="${id}"]`);
    if (!sc || !el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    sc.scrollTo({ top: Math.max(0, el.offsetTop - sc.clientHeight * 0.18), behavior: reduced ? "auto" : "smooth" });
  }, []);

  const openSheet = useCallback(
    (id: string) => {
      setSheetId(id);
      setActive(id);
      // after the sheet's spacer lands, so the last bubble can scroll up too
      requestAnimationFrame(() => requestAnimationFrame(() => reveal(id)));
    },
    [reveal],
  );

  const closeSheet = useCallback(() => {
    const id = sheetId;
    setSheetId(null);
    setActive(null);
    // focus goes back to the "why" of the turn that was showing
    const badge = id ? document.querySelector<HTMLElement>(`[data-msg-id="${id}"] button[aria-label^="Why this reply"]`) : null;
    badge?.focus({ preventScroll: true });
  }, [sheetId]);

  const why: WhyHooks = {
    byId,
    hoverId,
    activeId,
    setHover,
    open: (id) => openSheet(id),
    inline: showWhy ? "below-lg" : "always",
    annotate,
    sheetOpen: !!sheetId,
    select: (id) => {
      if (!showWhy || !wide()) return;
      setActive(id);
      setExpanded(id);
    },
  };

  const metrics = metricsLine(chat.session);
  const restart = chat.restart;
  const frame = FRAMES[skin.id];
  const call = chat.call.status !== "idle";

  return (
    <main className="min-h-dvh bg-canvas text-ink flex flex-col overflow-x-clip">
      <TopBar skin={picked?.id ?? null} setSkin={setSkin} showWhy={showWhy} toggleWhy={() => setShowWhy(!showWhy)} onRestart={restart} mock={chat.mock} />
      {/* phones sit centered; a call adds a second phone and both glide to share the middle (lg+ only) */}
      <Stage
        sig={[call ? "call" : "", showWhy && lg ? "why" : ""].join("|")}
        animate={lg}
        className={`flex-1 flex flex-wrap justify-center items-start gap-x-10 gap-y-6 sm:px-6 sm:pb-6 transition-opacity duration-300 ${picked ? "opacity-100" : "opacity-0"}`}
      >
        <StageItem id="chat" className="w-full sm:w-auto">
          <DeviceFrame skin={skin} bp="sm" zoom={zoom}>
            <PhoneScreen
              skin={skin}
              chat={chat}
              why={why}
              scrollRef={scrollRef}
              onMenu={() => setMenuOpen(true)}
              overlay={sheetId && <WhySheet key={skin.id} skin={skin} turns={turns} id={sheetId} onNav={openSheet} onClose={closeSheet} metrics={metrics} />}
            />
          </DeviceFrame>
        </StageItem>
        {call && (
          // below lg the call is full screen (fixed), so its wrapper takes no room in the row
          <StageItem id="call" className="max-lg:contents">
            <CallPhone skin={skin} chat={chat} zoom={zoom} />
          </StageItem>
        )}
        {showWhy && lg && (
          <StageItem id="why">
            <WhySidebar
              turns={turns}
              scrollRef={scrollRef}
              activeId={activeId}
              hoverId={hoverId}
              setActive={setActive}
              setHover={setHover}
              expanded={expanded}
              setExpanded={setExpanded}
              height={Math.round(frame.h * zoom)}
              metrics={metrics}
            />
          </StageItem>
        )}
      </Stage>
      {menuOpen && (
        <MenuSheet
          skin={picked?.id ?? null}
          setSkin={setSkin}
          annotate={annotate}
          setAnnotate={setAnnotate}
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
