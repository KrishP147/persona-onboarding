"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { BackChevron, ComposerPlus, Mark, MicIcon, NameChevron, StatusBar, VideoIcon } from "./svgs";

// two looping scripts, same as yourpersona.com
const SCRIPTS = [
  { ask: "What am I paying for that I don't use?", reply: "Three subscriptions, $34 a month. Cancel them all?" },
  { ask: "Book me a dentist appointment, mornings only", reply: "Tuesday 9:30 with Dr. Lee works. Want it?" },
];

const PHASES = ["typing", "sent", "read", "heart", "dots", "reply", "fade"] as const;
type Phase = (typeof PHASES)[number];
type State = { script: number; typed: number; phase: Phase };

// server render + reduced motion: the finished first script
const FINAL: State = { script: 0, typed: SCRIPTS[0].ask.length, phase: "reply" };

const W = 596.443;
const H = 687;

// liquid glass chrome used by the header + composer buttons
const GLASS =
  "rounded-full bg-white/[0.5] shadow-[inset_0_0_0_0.27cqw_rgba(255,255,255,0.65),inset_0.3cqw_0.45cqw_0.7cqw_rgba(255,255,255,0.95),inset_-0.3cqw_-0.45cqw_0.7cqw_rgba(0,0,0,0.05),0_1cqw_3cqw_rgba(0,0,0,0.09)] backdrop-blur-[14px] backdrop-saturate-[1.8]";

export default function HeroPhone() {
  const [st, setSt] = useState<State>(FINAL);
  const [scale, setScale] = useState(1);
  const boxRef = useRef<HTMLDivElement>(null);

  // fit the 596px stage into narrow screens
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(Math.min(1, e.contentRect.width / W)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let alive = true;
    const timers = new Set<number>();
    const sleep = (ms: number) =>
      new Promise<void>((r) => {
        const t = window.setTimeout(() => {
          timers.delete(t);
          r();
        }, ms);
        timers.add(t);
      });
    const to = (phase: Phase) => setSt((v) => ({ ...v, phase }));
    (async () => {
      let s = 0;
      await sleep(0);
      while (alive) {
        const ask = SCRIPTS[s].ask;
        setSt({ script: s, typed: 0, phase: "typing" });
        await sleep(600);
        for (let i = 1; i <= ask.length && alive; i++) {
          setSt((v) => ({ ...v, typed: i }));
          await sleep(ask[i - 1] === " " ? 90 : 55);
        }
        await sleep(500);
        if (!alive) return;
        to("sent");
        await sleep(1100);
        if (!alive) return;
        to("read");
        await sleep(700);
        if (!alive) return;
        to("heart");
        await sleep(800);
        if (!alive) return;
        to("dots");
        await sleep(1500);
        if (!alive) return;
        to("reply");
        await sleep(3400);
        if (!alive) return;
        to("fade");
        await sleep(600);
        s = (s + 1) % SCRIPTS.length;
      }
    })();
    return () => {
      alive = false;
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  const sc = SCRIPTS[st.script];
  const at = (p: Phase) => PHASES.indexOf(st.phase) >= PHASES.indexOf(p);
  const typing = st.phase === "typing";
  const draft = typing ? sc.ask.slice(0, st.typed) : "";

  return (
    <div ref={boxRef} className="w-full" style={{ height: H * scale }}>
      <div
        style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "top center", marginLeft: `calc(50% - ${W / 2}px)` }}
      >
        <div className="relative h-[687px] w-[596.443px] shrink-0">
          {/* vignetted landscape (light). in dark the misty photo just reads as murk, so a soft cool glow
              stands in for it, like light off the band's ring */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 hidden h-[640.29px] w-[596.443px] dark:block"
            style={{ background: "radial-gradient(closest-side, rgba(126,150,210,.22), rgba(126,150,210,.08) 55%, transparent)" }}
          />
          <div className="pointer-events-none absolute left-0 top-0 h-[640.29px] w-[596.443px] rounded-[199px] opacity-40 dark:hidden">
            <div className="absolute inset-0 overflow-hidden rounded-[199px]">
              <img
                src="/brand/hero-landscape.jpg"
                alt=""
                draggable={false}
                width={900}
                height={1200}
                className="absolute left-[-9.9%] top-[-24.4%] h-[148.8%] w-[119.8%] max-w-none"
              />
            </div>
            <div className="absolute inset-0 rounded-[inherit] shadow-[inset_0px_0px_38.3px_36px_var(--p-canvas)]" />
          </div>

          <div className="absolute left-[152px] top-[78px] z-20 w-[292px]">
            <div className="landing-reveal relative w-[292px] select-none" style={{ aspectRatio: "435 / 906" }} aria-label="Persona in iMessage">
              <div
                className="landing-light @container isolate absolute overflow-hidden bg-white font-sans text-ink antialiased"
                style={{ left: "4.318%", top: "2.291%", width: "91.361%", height: "95.366%", borderRadius: "14.18% / 6.521%" }}
              >
                {/* thread, bottom aligned above the composer + keyboard */}
                <div
                  className={`absolute inset-x-0 top-[37cqw] bottom-[100.5cqw] z-0 flex flex-col justify-end px-[4cqw] transition-opacity duration-500 ${st.phase === "fade" ? "opacity-0" : "opacity-100"}`}
                >
                  {at("sent") && (
                    <div key={`t${st.script}`} className="flex flex-col">
                      <p className="imsg-in mb-[2.2cqw] text-center text-[2.6cqw] leading-[1.3] text-[#8e8e93]">
                        <span className="font-semibold">iMessage</span>
                        <br />
                        Today 9:41 AM
                      </p>
                      <div className="imsg-in relative max-w-[66cqw] self-end">
                        <div className="imsg-bubble imsg-me imsg-tail-me px-[3.6cqw] py-[1.9cqw] text-[4.23cqw] font-medium leading-[1.294] text-white">
                          {sc.ask}
                        </div>
                        {at("heart") && (
                          <img
                            src="/brand/ios-heart.png"
                            alt=""
                            width={34}
                            height={38}
                            className="imsg-pop absolute -left-[5.2cqw] -top-[5.6cqw] w-[7.6cqw]"
                          />
                        )}
                      </div>
                      <p className="mt-[0.9cqw] self-end pr-[0.5cqw] text-[2.6cqw] text-[#8e8e93]">
                        {at("read") ? (
                          <>
                            <span className="font-semibold">Read</span> 9:41
                          </>
                        ) : (
                          <span className="font-semibold">Delivered</span>
                        )}
                      </p>
                      {st.phase === "dots" && (
                        <div className="imsg-in imsg-bubble imsg-them imsg-tail-them mt-[2.4cqw] flex h-[8.2cqw] w-[13.5cqw] items-center justify-center gap-[1cqw] self-start">
                          <span className="imsg-dot" />
                          <span className="imsg-dot [animation-delay:.18s]" />
                          <span className="imsg-dot [animation-delay:.36s]" />
                        </div>
                      )}
                      {at("reply") && (
                        <div className="imsg-in imsg-bubble imsg-them imsg-tail-them mt-[2.4cqw] max-w-[66cqw] self-start px-[3.6cqw] py-[1.9cqw] text-[4.23cqw] font-medium leading-[1.294] text-ink">
                          {sc.reply}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* top blur */}
                <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[37cqw]">
                  <div
                    className="absolute inset-0 backdrop-blur-[0.6cqw]"
                    style={{ maskImage: "linear-gradient(to bottom, #000 0%, rgba(0,0,0,0.5) 45%, transparent 100%)" }}
                  />
                  <div
                    className="absolute inset-0"
                    style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.04) 40%, rgba(255,255,255,0) 70%)" }}
                  />
                </div>

                {/* status bar + header */}
                <div className="absolute inset-x-0 top-0 z-20">
                  <div className="relative h-[15.42cqw] text-ink">
                    <StatusBar className="absolute inset-x-0 top-[4.6cqw] h-[5.47cqw] w-full" />
                  </div>
                  <div className="relative flex h-[21.64cqw] items-start justify-between px-[3.98cqw]">
                    <div className={`${GLASS} flex h-[10.95cqw] w-[10.95cqw] items-center justify-center text-ink`}>
                      <BackChevron className="h-[5cqw] w-[3.05cqw]" />
                    </div>
                    <div className="absolute left-1/2 top-0 flex -translate-x-1/2 flex-col items-center">
                      <span className="relative z-20 flex h-[14.93cqw] w-[14.93cqw] items-center justify-center rounded-full border border-black/[0.04] bg-white shadow-[0_0.62cqw_0.5cqw_rgba(0,0,0,0.1)]">
                        <Mark className="h-[8.21cqw] w-auto overflow-visible text-ink" />
                      </span>
                      <div
                        className={`${GLASS} relative z-10 -mt-[1.24cqw] flex h-[7.96cqw] items-center gap-[1.74cqw] whitespace-nowrap pl-[3.48cqw] pr-[2.74cqw] text-[4.23cqw] font-bold leading-none`}
                      >
                        Persona
                        <span className="flex translate-y-[0.25cqw] items-center self-center">
                          <NameChevron className="block h-[2.49cqw] w-[1.38cqw]" />
                        </span>
                      </div>
                    </div>
                    <div className={`${GLASS} flex h-[10.95cqw] w-[10.95cqw] items-center justify-center text-ink`}>
                      <VideoIcon className="h-[6.47cqw] w-[6.47cqw]" />
                    </div>
                  </div>
                </div>

                {/* composer, sits on top of the keyboard */}
                <div className="pointer-events-none absolute inset-0 z-20 translate-y-[-85.07cqw]">
                  <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[14.93cqw]">
                    <div
                      className="absolute inset-0 backdrop-blur-[1.1cqw]"
                      style={{ maskImage: "linear-gradient(to top, #000 0%, #000 60%, transparent 100%)" }}
                    />
                    <div
                      className="absolute inset-0"
                      style={{ background: "linear-gradient(to top, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.45) 70%, rgba(255,255,255,0) 100%)" }}
                    />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 z-20 flex items-end gap-[2.99cqw] px-[3.98cqw] pb-[3.98cqw] pt-[1cqw]">
                    <div className={`${GLASS} flex h-[9.95cqw] w-[9.95cqw] shrink-0 items-center justify-center text-ink`}>
                      <ComposerPlus className="h-[3.6cqw] w-[3.6cqw]" />
                    </div>
                    <div
                      className={`${GLASS} relative flex min-h-[9.95cqw] min-w-0 flex-1 items-end !rounded-[4.98cqw] py-[2.24cqw] pl-[4.48cqw] pr-[2.49cqw] text-[4.23cqw] font-medium leading-[1.294]`}
                    >
                      {typing ? (
                        <>
                          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-ink">
                            {draft}
                            <span className="imsg-caret" />
                          </span>
                          <img
                            src="/brand/ios-send-capsule.png"
                            alt=""
                            width={59}
                            height={43}
                            className={`-mb-[0.4cqw] ml-[1cqw] w-[9.2cqw] shrink-0 transition-opacity duration-200 ${draft ? "opacity-100" : "opacity-0"}`}
                          />
                        </>
                      ) : (
                        <>
                          <span className="min-w-0 flex-1 text-[rgba(60,60,67,0.5)]">iMessage</span>
                          <span className="-mb-[0.25cqw] flex h-[4.98cqw] w-[5.47cqw] shrink-0 items-center justify-center text-[rgba(60,60,67,0.5)]">
                            <MicIcon className="h-[4.14cqw] w-[2.78cqw]" />
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* keyboard */}
                <div aria-hidden="true" className="absolute inset-x-0 bottom-0 z-30">
                  <div className="absolute inset-0 bg-[#e6e9ed]" />
                  <img src="/brand/ios-keyboard.svg" alt="" width={402} height={342} draggable={false} className="relative block h-auto w-full" />
                </div>
                <span className="absolute bottom-[1.99cqw] left-1/2 z-40 h-[1.24cqw] w-[33.3cqw] -translate-x-1/2 rounded-full bg-ink" />
              </div>
              <img
                src="/brand/iphone-17-pro-silver.svg"
                alt=""
                width={1102}
                height={2300}
                className="pointer-events-none absolute inset-0 h-full w-full"
              />
            </div>
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-[-40px] top-[440px] z-10 h-[247px]"
            style={{
              background:
                "linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--p-canvas) 55%, transparent) 30%, color-mix(in srgb, var(--p-canvas) 92%, transparent) 58%, var(--p-canvas) 72%, var(--p-canvas) 100%)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
