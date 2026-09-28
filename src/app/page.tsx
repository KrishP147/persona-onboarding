/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import HeroPhone from "@/components/landing/HeroPhone";
import PrivacyCarousel from "@/components/landing/PrivacyCarousel";
import ScrollRuler from "@/components/landing/ScrollRuler";
import { Wordmark } from "@/components/landing/svgs";
import { ThemeToggle } from "@/components/ThemeToggle";
import "@/components/landing/landing.css";

export const metadata: Metadata = {
  title: "Persona (trial demo)",
  description: "Your personal intelligence. Text your Persona, right here on the web.",
};

const SITE = "https://yourpersona.com";

const CERTS = [
  { src: "/brand/soc2.png", alt: "SOC 2 Type I certified", l1: "SOC 2 Type I", l2: "certified", scale: 1 },
  { src: "/brand/aes-256.svg", alt: "AES-256 Encrypted", l1: "AES-256", l2: "Encrypted", scale: 1 },
  { src: "/brand/esof.png", alt: "ESOF verified and secured", l1: "ESOF verified", l2: "and secured", scale: 1.2 },
];

const SEALS = [
  { src: "/brand/seal-1.png", alt: "AES-256 CTR encryption", w: 246 },
  { src: "/brand/soc2.png", alt: "SOC 2 Type 1 certified", w: 256 },
  { src: "/brand/seal-3.png", alt: "TAC Security ESOF verified", w: 256 },
];

function Hero() {
  return (
    <section className="relative w-full overflow-x-hidden bg-canvas text-ink">
      {/* this page mirrors persona's site for a trial; say so up top, not just in the footer */}
      {/* top right; on phones it takes its own row so it never sits on the demo line */}
      <div className="relative z-30 flex justify-end px-4 pt-3 sm:absolute sm:right-5 sm:top-3 sm:p-0">
        <ThemeToggle />
      </div>
      <p className="px-5 pt-3 text-center font-sans text-[12.5px] tracking-[0.005em] text-ink-mute">A trial demo by Krish for Persona, not the real product.</p>
      <div className="mx-auto flex w-full flex-col items-center gap-8 px-5 pb-12 pt-10 sm:pt-14 lg:w-max lg:-translate-x-[76px] lg:flex-row lg:gap-[69px] lg:px-0 lg:py-[102px]">
        <div className="order-2 w-full max-w-[596px] lg:order-1 lg:w-[596.443px] lg:max-w-none lg:translate-y-[40px]">
          <HeroPhone />
        </div>
        <div className="order-1 flex w-full max-w-[360px] shrink-0 flex-col items-center lg:order-2 lg:w-max lg:min-w-[333.871px] lg:max-w-none">
          <div className="flex h-[72px] items-center justify-center p-[10px] lg:h-[100px]">
            <Wordmark className="h-[22px] w-auto" />
          </div>
          <div className="flex w-full flex-col items-center gap-10 lg:gap-[64px]">
            <h1 className="w-full whitespace-nowrap text-center font-sans text-[clamp(38px,11.5vw,56px)] font-medium leading-none tracking-[-0.015em] text-ink lg:text-[56px]">
              Your personal
              <br />
              intelligence
            </h1>
            <div className="flex w-[212px] flex-col items-center">
              <Link
                href="/chat"
                className="flex h-[50px] min-w-[182px] items-center justify-center gap-[16px] rounded-[68px] border-[0.5px] border-solid border-[rgba(0,0,0,0.24)] bg-white px-[20px] py-[16px] drop-shadow-[0px_3px_3px_rgba(0,0,0,0.06),0px_1px_0.5px_rgba(0,0,0,0.12)] dark:border-white/[0.18] dark:bg-alt dark:drop-shadow-[0px_3px_10px_rgba(0,0,0,0.5)]"
              >
                <img src="/brand/imessage.svg" alt="" width={24} height={24} draggable={false} className="size-[24px] shrink-0" />
                <span className="whitespace-nowrap font-sans text-[18px] font-[590] leading-none tracking-[-0.18px] text-black dark:text-ink">Get Started</span>
              </Link>
              <Link
                href="/chat"
                className="mt-[6px] px-3 py-[10px] font-sans text-[14px] font-medium tracking-[-0.005em] text-ink-mute transition-colors duration-200 hover:text-ink"
              >
                Try it in your browser
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Band() {
  const fade = "linear-gradient(90deg, transparent 0%, #000 8%, #000 92%, transparent 100%), linear-gradient(180deg, transparent 0%, #000 10%, #000 90%, transparent 100%)";
  return (
    <section id="band" className="w-full bg-canvas pb-[80px] text-ink sm:pb-[120px]">
      <div
        aria-label="Persona Band in three straps: brown suede, black knit and ivory silicone"
        role="img"
        className="relative bg-canvas px-4 pt-[56px] sm:pt-[96px] lg:pt-[128px]"
      >
        <div className="flex items-center justify-center">
          <div
            className="w-full max-w-[990px]"
            style={{ aspectRatio: "16 / 9", maskImage: fade, maskComposite: "intersect", WebkitMaskImage: fade, WebkitMaskComposite: "source-in" }}
          >
            <img src="/brand/band-three-pack.png" alt="" width={2880} height={1620} className="block h-full w-full object-cover" />
          </div>
        </div>
      </div>
      <div className="mx-auto mt-[24px] flex max-w-[980px] flex-col items-center px-6 text-center">
        <h2 className="font-sans text-[clamp(44px,13vw,80px)] font-medium leading-[1.05] tracking-[-0.015em]">Persona Band</h2>
        <p className="mt-[20px] max-w-[880px] font-sans text-[clamp(19px,5.6vw,28px)] font-medium leading-[1.25] tracking-[-0.005em] text-ink sm:mt-[28px]">
          Personal intelligence, on your wrist.
        </p>
        <a
          href={`${SITE}/band`}
          aria-label="Learn more about Persona Band"
          className="mt-[32px] inline-flex h-[48px] items-center justify-center rounded-full bg-ink px-[24px] font-sans text-[17px] font-medium text-canvas"
        >
          Learn more
        </a>
      </div>
    </section>
  );
}

function Privacy() {
  return (
    <section id="privacy" className="overflow-hidden bg-canvas py-20 sm:py-28">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-16">
          <div className="max-w-[760px]">
            <Wordmark className="h-[24px] w-auto text-ink sm:h-[26px]" />
            <h2 className="mt-5 font-sans text-[clamp(31px,4.6vw,60px)] font-medium leading-[1.04] tracking-[-0.025em] text-ink">
              The most <strong className="font-semibold">personal</strong> AI
              <br />
              is the most <strong className="font-semibold">private</strong> one.
            </h2>
          </div>
          <div className="lg:pb-1">
            <div className="flex flex-wrap items-start gap-6 sm:flex-nowrap sm:gap-9">
              {CERTS.map((c) => (
                <div key={c.src} className="group flex flex-col items-center gap-2">
                  <span className="flex h-[60px] w-[68px] items-center justify-center dark:h-[68px] dark:rounded-[16px] dark:bg-[#e8e8ed]">
                    <img
                      src={c.src}
                      alt={c.alt}
                      width={450}
                      height={450}
                      loading="lazy"
                      style={{ scale: c.scale }}
                      className="h-[60px] w-[60px] object-contain opacity-70 grayscale transition-[filter,opacity] duration-[1500ms] ease-house group-hover:opacity-100 group-hover:grayscale-0"
                    />
                  </span>
                  <span className="text-center text-[12px] leading-snug text-ink-mute">
                    {c.l1}
                    <br />
                    {c.l2}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <PrivacyCarousel />
    </section>
  );
}

const iconBtn =
  "neu-pill flex h-11 w-11 items-center justify-center rounded-[12px] text-ink transition-[transform,box-shadow] duration-200 hover:-translate-y-[1px]";
const colLink = "type-body inline-block py-2 text-ink-mute transition-colors duration-200 hover:text-ink";

function Footer() {
  return (
    <footer id="create" className="relative overflow-hidden bg-canvas pt-16 sm:pt-20">
      <div className="relative z-10 mx-auto max-w-[1260px] px-4 sm:px-6">
        <div className="landing-glass grid grid-cols-2 gap-x-8 gap-y-12 rounded-[32px] p-8 sm:rounded-[40px] sm:p-12 lg:grid-cols-[1.6fr_1fr_1fr_auto] lg:gap-10 lg:p-14">
          <div className="col-span-2 max-w-[340px] lg:col-span-1">
            <Wordmark className="h-[22px] w-auto text-ink" />
            <p className="mt-6 text-[19px] font-semibold tracking-[-0.015em] text-ink sm:text-[20px]">Create your Persona today.</p>
            <p className="mt-2 text-[14px] leading-[1.55] text-pretty text-ink-mute">
              First AI assistant you can wear.
              <br />
              Made to get it done.
            </p>
            <div className="mt-5">
              <Link
                href="/chat"
                className="glare-hover neu-dark inline-flex min-h-[36px] items-center gap-1.5 rounded-[26px] px-3.5 py-1.5 text-white transition-transform dark:text-[#1d1d1f] duration-[2400ms] ease-house hover:scale-[1.02] active:scale-100"
              >
                <img src="/brand/imessage.svg" alt="" width={17} height={17} draggable={false} className="h-[17px] w-[17px]" />
                <span className="text-[13px] font-medium tracking-[-0.005em]">Start on iMessage</span>
              </Link>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <a href="mailto:hello@yourpersona.com" aria-label="Email us" className={iconBtn}>
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
                  <path d="m4.5 7.5 7.5 5.5 7.5-5.5" />
                </svg>
              </a>
              <a href="https://x.com/yourpersona" aria-label="Persona on X" target="_blank" rel="noopener noreferrer" className={iconBtn}>
                <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="currentColor" aria-hidden="true">
                  <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z" />
                </svg>
              </a>
              <a href="#" aria-label="Persona on Instagram" className={iconBtn}>
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.2" cy="6.8" r="0.5" fill="currentColor" stroke="none" />
                </svg>
              </a>
            </div>
            <p className="type-caption mt-10 text-ink-mute">
              © 2026 Persona. All rights reserved.
              <br />
              Made in Miami, USA.
              <br />
              A trial demo by Krish for Persona, not the real product.
            </p>
          </div>
          <div>
            <p className="type-body font-semibold text-ink">Product</p>
            <ul className="mt-5 space-y-1">
              <li>
                <Link href="/chat" className={colLink}>
                  Persona App
                </Link>
              </li>
              <li>
                <a href={`${SITE}/band`} className={colLink}>
                  Persona Band
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="type-body font-semibold text-ink">Resources</p>
            <ul className="mt-5 space-y-1">
              <li>
                <a href={`${SITE}/legal/privacy`} className={colLink}>
                  Privacy
                </a>
              </li>
              <li>
                <a href={`${SITE}/legal`} className={colLink}>
                  Terms
                </a>
              </li>
              <li>
                <a href="mailto:hello@yourpersona.com" className={colLink}>
                  Contact
                </a>
              </li>
            </ul>
          </div>
          <div className="col-span-2 lg:col-span-1 lg:text-right">
            <p className="type-caption font-semibold uppercase tracking-[0.09em] text-ink-mute">Security &amp; privacy</p>
            <div className="mt-4 flex items-center gap-4 lg:justify-end">
              {SEALS.map((s) => (
                <span key={s.src} className="flex shrink-0 dark:rounded-[12px] dark:bg-[#e8e8ed] dark:p-[5px]">
                <img
                  src={s.src}
                  alt={s.alt}
                  width={s.w}
                  height={256}
                  loading="lazy"
                  className="h-[44px] w-auto opacity-75 grayscale transition-[filter,opacity] duration-300 hover:opacity-100 hover:grayscale-0 dark:opacity-90"
                />
                </span>
              ))}
            </div>
            <p className="type-caption mt-3.5 text-ink-mute">
              Encrypted at rest and in transit.
              <br />
              Your data stays yours.
            </p>
            <div className="mt-8 max-w-[300px] lg:ml-auto">
              <p className="type-body font-semibold text-ink">Security &amp; Bug Bounty</p>
              <p className="type-caption mt-1.5 text-ink-mute">Found a security vulnerability? Please report it through our Bug Bounty Program.</p>
              <a href={`${SITE}/legal/security`} className="type-body mt-2 inline-block py-1 font-semibold text-ink transition-colors duration-200 hover:text-ink-mute">
                Report a Security Issue →
              </a>
            </div>
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="relative mx-auto mt-12 aspect-[116/18] w-screen max-w-[1600px] overflow-hidden sm:mt-20">
        <Wordmark
          className="absolute left-0 top-0 h-auto w-full text-step-200 dark:text-alt"
          style={{
            overflow: "visible",
            maskImage: "linear-gradient(180deg, black 0%, rgba(0,0,0,0.6) 100%)",
            WebkitMaskImage: "linear-gradient(180deg, black 0%, rgba(0,0,0,0.6) 100%)",
          }}
        />
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <main className="flex-1">
      <Hero />
      <Band />
      <Privacy />
      <Footer />
      <ScrollRuler />
    </main>
  );
}
