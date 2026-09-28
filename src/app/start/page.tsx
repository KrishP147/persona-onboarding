/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { Mark } from "@/components/landing/svgs";

export const metadata: Metadata = {
  title: "Persona (trial demo)",
  description: "Start texting your Persona.",
  robots: { index: false, follow: false },
};

// the real number + prefilled first text from yourpersona.com/start
const SMS_HREF = "sms:+12138656308?&body=Hey%2C%20what%27s%20a%20persona%3F";
const EASE = "ease-[cubic-bezier(.32,.72,0,1)]";

function Arrow() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
      className={`flex-none text-[#1e1e1e] transition-transform duration-[140ms] ${EASE} group-hover:translate-x-[3px]`}
    >
      <path d="M3.5 9h11m0 0-4.2-4.2M14.5 9l-4.2 4.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Start() {
  return (
    <main className="box-border flex min-h-dvh flex-1 flex-col items-center justify-center gap-[14px] bg-warm px-6 pb-[calc(32px+env(safe-area-inset-bottom,0px))] pt-8 text-center text-ink">
      <Mark className="mb-[6px] h-[33px] w-[34px] text-[#070707]" />
      <h1 className="m-0 text-[22px] font-semibold tracking-[-0.015em]">Start texting your Persona</h1>
      <p className="m-0 text-[15px] leading-[1.45] text-ink-mute">Persona lives in your messages. Send the first text and we’ll take it from there.</p>
      <div className="mt-[10px] flex w-full max-w-[420px] flex-col items-stretch gap-[14px]">
        <Link
          href="/chat"
          className={`group box-border flex min-h-[68px] w-full items-center gap-3 rounded-[16px] border border-[#1e1e1e] bg-white py-3 pl-3 pr-5 text-left transition-[background-color,transform] duration-[140ms] ${EASE} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1e1e1e] active:scale-[.99] [@media(hover:hover)]:hover:bg-[#ececea]`}
        >
          <span className="flex size-10 flex-none items-center justify-center rounded-[12px] bg-ink text-white">
            {/* chat bubble, the web channel */}
            <svg viewBox="0 0 24 24" className="size-[20px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 4.5c4.7 0 8.5 3.1 8.5 7s-3.8 7-8.5 7c-1 0-2-.1-2.9-.4L5 19.5l1.2-3.4C4.5 14.8 3.5 13.2 3.5 11.5c0-3.9 3.8-7 8.5-7Z" />
            </svg>
          </span>
          <span className="flex min-w-0 flex-auto flex-col gap-px">
            <span className="text-[15px] font-[590] text-[#010111]">Continue on the web</span>
            <span className="text-[13px] text-[#717171]">Text your Persona right here, no phone needed</span>
          </span>
          <Arrow />
        </Link>
        <a
          href={SMS_HREF}
          className={`group box-border flex min-h-[56px] w-full items-center gap-3 rounded-[16px] border border-[#e5e5e1] py-2 pl-3 pr-5 text-left transition-[background-color,transform] duration-[140ms] ${EASE} active:scale-[.99] [@media(hover:hover)]:hover:bg-[#ececea]`}
        >
          <span className="flex size-10 flex-none items-center justify-center rounded-[12px]">
            <img src="/brand/imessage.svg" alt="" width={22} height={22} className="size-[22px] opacity-80" />
          </span>
          <span className="flex min-w-0 flex-auto flex-col gap-px">
            <span className="text-[14px] font-medium text-[#3a3a3c]">Continue with iMessage</span>
            <span className="text-[12.5px] text-[#86868b]">Text +1 (213) 865-6308</span>
          </span>
        </a>
      </div>
      <Link href="/" className="mt-[22px] text-[13px] text-[#86868b] no-underline">
        Back
      </Link>
      <p className="text-[12.5px] text-[#86868b]">A trial demo by Krish for Persona, not the real product.</p>
    </main>
  );
}
