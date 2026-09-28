"use client";
// "can't hear you": a small card over the call screen when the mic is dead, plus the "switched to" toast.
// never blocks the call; pick another mic (swapped in place) or drop to texting.
import { useEffect, useState } from "react";
import type { useVoiceCall } from "./useVoiceCall";

type Call = ReturnType<typeof useVoiceCall>;

export function MicTrouble({ call }: { call: Call }) {
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const show = call.micTrouble;

  // list the mics while the card is up, and keep the list fresh if one is plugged in
  useEffect(() => {
    if (!show || !navigator.mediaDevices?.enumerateDevices) return;
    let live = true;
    const load = () =>
      navigator.mediaDevices
        .enumerateDevices()
        .then((all) => live && setInputs(all.filter((d) => d.kind === "audioinput")))
        .catch(() => {});
    void load();
    navigator.mediaDevices.addEventListener("devicechange", load);
    return () => {
      live = false;
      navigator.mediaDevices.removeEventListener("devicechange", load);
    };
  }, [show]);

  if (call.status !== "active" || (!show && !call.micToast)) return null;
  return (
    <div className="absolute inset-x-4 top-[88px] z-30 flex flex-col items-center gap-2 pointer-events-none" aria-live="polite">
      {call.micToast && !show && <div className="rounded-full bg-black/75 text-white text-[13px] px-4 py-2 backdrop-blur">{call.micToast}</div>}
      {show && (
        <div role="alert" data-testid="mic-trouble" className="pointer-events-auto w-full rounded-2xl bg-black/80 text-white p-4 shadow-lg backdrop-blur flex flex-col gap-3">
          <p className="text-[15px] leading-snug">can&apos;t hear you. switch mic or text instead?</p>
          {inputs.length > 0 && (
            <label className="flex flex-col gap-1 text-[12px] text-white/70">
              microphone
              <select
                className="rounded-lg bg-white/10 text-white text-[14px] px-2 py-2 outline-none [&>option]:text-black"
                value={inputs.some((d) => d.deviceId === call.inputId) ? call.inputId! : ""}
                onChange={(e) => e.target.value && void call.swapInput(e.target.value)}
              >
                {!inputs.some((d) => d.deviceId === call.inputId) && <option value="">choose a mic</option>}
                {inputs.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `mic ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button onClick={() => call.hangUp("user_hangup")} className="self-start rounded-full bg-white text-black text-[14px] font-medium px-4 py-2">
            switch to text
          </button>
        </div>
      )}
    </div>
  );
}
