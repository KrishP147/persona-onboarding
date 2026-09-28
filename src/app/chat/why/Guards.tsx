"use client";
// "checks that ran": the code-side guards on a turn, as small muted chips (text + glyph, never color alone)
export function Guards({ guards, ink, mute, line, compact }: { guards: string[]; ink: string; mute: string; line: string; compact?: boolean }) {
  if (!guards.length) return null;
  return (
    <div className={compact ? "mt-1" : "mt-2.5"}>
      {!compact && (
        <div className="text-[11px] leading-4 font-semibold tracking-[0.06em] uppercase" style={{ color: mute }}>
          checks that ran
        </div>
      )}
      <ul className={`flex flex-wrap gap-1 ${compact ? "" : "mt-1"}`} aria-label="checks that ran">
        {guards.map((g) => (
          <li key={g} className="inline-flex items-center gap-1 rounded-full border px-2 py-[1px] text-[11px] leading-4" style={{ borderColor: line, color: ink }}>
            <svg width="10" height="11" viewBox="0 0 10 11" fill="none" stroke={mute} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 1 1.5 2.3v3C1.5 7.6 3 9.2 5 10c2-.8 3.5-2.4 3.5-4.7v-3L5 1Z" />
              <path d="m3.4 5.4 1.1 1.1 2.1-2.2" />
            </svg>
            {g}
          </li>
        ))}
      </ul>
    </div>
  );
}
