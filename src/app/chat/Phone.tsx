"use client";
// the phone: a device frame on wide screens, the whole page on a phone
import { useRef, useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { Skin, SkinId } from "./skins/types";
import { PhoneIcon } from "./skins/shared";
import { Thread, type WhyHooks } from "./Thread";
import type { Chat } from "./useChat";
import { MicTrouble } from "./MicTrouble";
import { useDark } from "@/components/ThemeToggle";

// screen size (css px) and frame geometry per device, from phone-ui-spec.md section 0
export const FRAMES: Record<SkinId, { w: number; h: number; screenW: number; screenH: number; x: number; y: number; r: number }> = {
  // iphone 17 pro svg: 435x906, screen 397.4 wide at (18.8, 20.8), scaled to a 390 screen
  iphone: { w: 427, h: 889, screenW: 390, screenH: 848, x: 18.4, y: 20.4, r: 58 },
  pixel: { w: 412, h: 882, screenW: 390, screenH: 860, x: 11, y: 11, r: 44 },
  galaxy: { w: 406, h: 861, screenW: 390, screenH: 845, x: 8, y: 8, r: 40 },
};

const TOP_BAR = 64;
const subscribeResize = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};
// scale the framed phone so it always fits the window height
export function useFrameZoom(skin: SkinId) {
  const vh = useSyncExternalStore(subscribeResize, () => window.innerHeight, () => 900);
  return Math.min(1, Math.max(0.6, (vh - TOP_BAR - 24) / FRAMES[skin].h));
}

// bp: where the frame appears (sm for the chat, lg for the call's second phone)
// dark: the home indicator's ground; the call phone forces it (not on pixel, whose phone app follows the theme), the chat phone follows the page theme
export function DeviceFrame({ skin, bp, zoom, dark: forceDark, children }: { skin: Skin; bp: "sm" | "lg"; zoom: number; dark?: boolean; children: ReactNode }) {
  const themeDark = useDark();
  const dark = forceDark ?? themeDark;
  const f = FRAMES[skin.id];
  const vars = { "--fw": `${f.w}px`, "--fh": `${f.h}px`, "--sx": `${f.x}px`, "--sy": `${f.y}px`, "--sw": `${f.screenW}px`, "--sh": `${f.screenH}px`, "--sr": `${f.r}px`, "--zoom": zoom } as CSSProperties;
  const sm = bp === "sm";
  // tailwind needs whole class names, so both breakpoints are spelled out
  const outer = sm ? "w-full sm:relative sm:w-[var(--fw)] sm:h-[var(--fh)] sm:[zoom:var(--zoom)] sm:shrink-0" : "w-full lg:relative lg:w-[var(--fw)] lg:h-[var(--fh)] lg:[zoom:var(--zoom)] lg:shrink-0";
  const screen = sm
    ? "w-full h-dvh sm:absolute sm:left-[var(--sx)] sm:top-[var(--sy)] sm:w-[var(--sw)] sm:h-[var(--sh)] sm:rounded-[var(--sr)] overflow-hidden"
    : "w-full h-dvh lg:absolute lg:left-[var(--sx)] lg:top-[var(--sy)] lg:w-[var(--sw)] lg:h-[var(--sh)] lg:rounded-[var(--sr)] overflow-hidden";
  const show = sm ? "hidden sm:block" : "hidden lg:block";
  return (
    <div className={`relative ${outer}`} style={vars}>
      {skin.id !== "iphone" && <AndroidBody id={skin.id} className={show} />}
      <div className={`${screen} isolate`} style={{ transform: "translateZ(0)" }}>
        {children}
        {/* camera cutout + gesture bar, frame only */}
        <div className={`${show} pointer-events-none`}>
          {skin.id === "iphone" ? null : (
            <span className="absolute left-1/2 -translate-x-1/2 z-50 rounded-full bg-black" style={skin.id === "pixel" ? { top: 14, width: 12, height: 12, boxShadow: "0 0 0 1.5px #202226" } : { top: 12, width: 11, height: 11, boxShadow: "0 0 0 1.5px #222" }} />
          )}
          <span
            className="absolute left-1/2 -translate-x-1/2 z-50 rounded-full"
            style={
              skin.id === "iphone"
                ? { bottom: 8, width: 134, height: 5, background: dark ? "#fff" : "#000" }
                : { bottom: 8, width: skin.id === "pixel" ? 108 : 120, height: 4, background: dark ? "rgba(255,255,255,.85)" : "rgba(0,0,0,.85)" }
            }
          />
        </div>
      </div>
      {skin.id === "iphone" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/brand/iphone-17-pro-silver.svg" alt="" aria-hidden className={`${show} absolute inset-0 w-full h-full pointer-events-none select-none z-10`} draggable={false} />
      )}
    </div>
  );
}

// pixel 10 (obsidian) and galaxy s25 (titanium) bodies: bezel, rim, side keys
function AndroidBody({ id, className }: { id: SkinId; className: string }) {
  const pixel = id === "pixel";
  const f = FRAMES[id];
  const rim = pixel ? "#3a3d43" : "#aeb2b8";
  return (
    <div className={`${className} absolute inset-0`} aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          borderRadius: f.r + f.x,
          background: pixel ? "#141518" : "#0b0b0d",
          boxShadow: `inset 0 0 0 ${pixel ? 3 : 2}px ${rim}, inset 0 0 0 ${pixel ? 4 : 3}px #000, 0 30px 60px -30px rgba(19,21,21,.35), 0 12px 30px -12px rgba(19,21,21,.25)`,
        }}
      />
      {/* power + volume on the right edge */}
      <span className="absolute -right-[3px] rounded-r-[3px]" style={{ top: pixel ? 190 : 170, width: 3, height: 64, background: rim }} />
      <span className="absolute -right-[3px] rounded-r-[3px]" style={{ top: pixel ? 280 : 250, width: 3, height: 110, background: rim }} />
    </div>
  );
}

export function PhoneScreen({
  skin,
  chat,
  why,
  scrollRef,
  onMenu,
  overlay,
}: {
  skin: Skin;
  chat: Chat;
  why: WhyHooks;
  scrollRef: RefObject<HTMLDivElement | null>;
  onMenu: () => void;
  overlay?: ReactNode; // the why sheet sits inside the screen
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const S = skin;
  return (
    <div className={`phone-screen relative h-full w-full flex flex-col overflow-hidden ${S.screen.className}`} style={S.screen.style}>
      <div className="hidden sm:block">
        <S.StatusBar />
      </div>
      <S.Header name={chat.agentName} saved={chat.saved} onCall={() => void chat.startUserCall()} callDisabled={chat.onCall} onMenu={onMenu} />
      <Thread skin={S} chat={chat} why={why} scrollRef={scrollRef} />
      {/* small screens: the call is hidden behind the texts, tap to go back */}
      {chat.callHidden && chat.onCall && (
        <button onClick={() => chat.showCall()} className="lg:hidden mx-3 mb-1 rounded-full bg-[#34C759] text-white text-[14px] font-medium py-2 px-4 flex items-center justify-center gap-2">
          <PhoneIcon size={14} /> On a call · tap to return
        </button>
      )}
      {chat.pending.length > 0 && <div className="px-4 pb-1 text-xs opacity-70">{chat.pending.map((p) => p.name).join(", ")} attached</div>}
      <S.Composer
        draft={chat.draft}
        setDraft={chat.setDraft}
        onSubmit={() => void chat.send(chat.draft)}
        onAttach={() => fileRef.current?.click()}
        canSend={!!chat.draft.trim() || chat.pending.length > 0}
        recording={chat.recording}
        transcribing={chat.transcribing}
        onMic={() => void (chat.recording ? chat.stopNote() : chat.startNote())}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          await chat.attachFiles(files);
        }}
      />
      {overlay}
    </div>
  );
}

// the call as its own screen, same skin (a second phone on wide screens)
export function CallPhone({ skin, chat, zoom }: { skin: Skin; chat: Chat; zoom: number }) {
  const { call } = chat;
  const S = skin;
  return (
    <div className={`fixed inset-0 z-20 lg:static lg:z-auto ${chat.callHidden ? "hidden lg:block" : ""}`}>
      <DeviceFrame skin={skin} bp="lg" zoom={zoom} dark={skin.id === "pixel" ? undefined : true}>
        <div className="phone-screen relative h-full w-full" style={S.screen.style}>
          <div className={skin.id === "pixel" ? "hidden lg:block" : "hidden lg:block text-white [&_*]:!text-white"}>
            <S.StatusBar />
          </div>
          <S.CallScreen
            said={call.caption}
            onHide={() => chat.setCallHidden(true)}
            unread={chat.unread}
            saved={chat.saved}
            name={chat.agentName}
            status={call.status}
            speaking={call.speaking}
            heard={call.heard}
            listening={call.listening}
            startedAt={call.startedAt}
            onAccept={chat.acceptCall}
            onDecline={chat.declineCall}
            onHangup={() => call.hangUp("user_hangup")}
            muted={call.muted}
            onMute={call.toggleMute}
          />
          <MicTrouble call={call} />
        </div>
      </DeviceFrame>
    </div>
  );
}
