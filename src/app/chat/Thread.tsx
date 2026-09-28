"use client";
// the message list, drawn by the current skin. same order, grouping and receipts on every phone.
import { Fragment, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { Msg } from "@/lib/types";
import { DraftCard, draftMsgId } from "./cards/DraftCard";
import { KnowCard, useGradSlot } from "./cards/KnowCard";
import type { Pos, Skin } from "./skins/types";
import type { Chat } from "./useChat";
import { usePref } from "./usePref";
import type { Turn } from "./why/frameworks";

export interface WhyHooks {
  on: boolean; // reasoning map open: bubbles link to their node
  byId: Map<string, Turn>;
  hoverId: string | null;
  activeId: string | null;
  setHover: (id: string | null) => void;
  select: (id: string) => void; // clicking an agent bubble opens its node in the map
  sheetOpen: boolean; // room at the bottom so the last bubble can sit above the map sheet
}

const TEN_MIN = 10 * 60 * 1000;

// one line that stands for a message: in the reply bar and above a reply
export function snippet(m: Msg) {
  if (m.kind === "gif") return "GIF";
  if (/^to:/i.test(m.text) && m.role === "agent") return `email draft: ${m.text.match(/^subject: (.*)$/im)?.[1] ?? "(no subject)"}`;
  if (m.attachments?.length && !m.text.trim()) return m.attachments.map((a) => a.name).join(", ");
  return m.text.replace(/\s+/g, " ").trim();
}

const ReplyGlyph = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6.5 3.5 2.5 7.5l4 4" />
    <path d="M2.5 7.5h6.5a4.5 4.5 0 0 1 4.5 4.5v.5" />
  </svg>
);

// a message you can reply to: hover shows a reply button (mouse), a swipe right past ~56px replies (touch)
function Replyable({ mine, onReply, children }: { mine: boolean; onReply: () => void; children: ReactNode }) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const soft = { background: "color-mix(in srgb, currentColor 9%, transparent)" };
  return (
    <div
      className="group relative"
      onTouchStart={(e) => (start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchMove={(e) => {
        const s = start.current;
        if (!s) return;
        const x = e.touches[0].clientX - s.x;
        const y = e.touches[0].clientY - s.y;
        // scrolling, not swiping
        if (Math.abs(y) > Math.abs(x) && dx === 0) return void (start.current = null);
        setDx(Math.max(0, Math.min(72, x)));
      }}
      onTouchEnd={() => {
        if (dx >= 56) onReply();
        setDx(0);
        start.current = null;
      }}
      style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? "none" : "transform 200ms" }}
    >
      {dx > 0 && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-8 flex h-7 w-7 items-center justify-center rounded-full" style={{ ...soft, opacity: Math.min(1, dx / 56) }} aria-hidden>
          <ReplyGlyph />
        </span>
      )}
      {children}
      <button
        type="button"
        aria-label="Reply"
        onClick={(e) => {
          e.stopPropagation();
          onReply();
        }}
        className={`absolute top-1/2 -translate-y-1/2 ${mine ? "left-3" : "right-3"} z-10 h-7 w-7 items-center justify-center rounded-full opacity-0 pointer-events-none flex [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto transition-opacity`}
        style={soft}
      >
        <ReplyGlyph />
      </button>
    </div>
  );
}

export function Thread({ skin, chat, why, scrollRef }: { skin: Skin; chat: Chat; why: WhyHooks; scrollRef: RefObject<HTMLDivElement | null> }) {
  const { thread, typing, revealing, receipts, session } = chat;
  const bottomRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef(false);

  useEffect(() => {
    // braces matter: newer chrome returns a promise from scrollIntoView, which react rejects as a cleanup.
    // first paint of a resumed thread jumps; new messages glide.
    void bottomRef.current?.scrollIntoView({ behavior: seenRef.current ? "smooth" : "instant", block: "end" });
    if (thread.length) seenRef.current = true;
  }, [thread.length, typing, revealing, skin.id]);

  const side = (x?: Msg) => (!x || x.kind === "event" ? null : x.role);
  const lastUserId = [...thread].reverse().find((x) => x.role === "user")?.id;
  const lastUserIdx = thread.findIndex((x) => x.id === lastUserId);
  const readAt = thread.slice(lastUserIdx + 1).find((x) => x.role === "agent")?.ts;
  const S = skin;
  const grad = useGradSlot(chat, thread);
  // "not in your contacts": dismissed once per conversation, gone for good once the contact is saved
  const [dismissed, setDismissed] = usePref(`persona-unknown-dismissed:${session?.id ?? "new"}`, false);
  const draftId = draftMsgId(session);
  // the what-i-know card shows only at these two anchors (graduation, and any "what do you know" ask); never elsewhere
  const knowIdxs = new Set([grad.at, grad.knowAt].filter((i): i is number => i !== null));
  const know = <KnowCard skin={skin} chat={chat} setupMs={grad.setupMs} />;
  const reply = (m: Msg) => {
    chat.setReplyTo(m);
    requestAnimationFrame(() => scrollRef.current?.closest(".phone-screen")?.querySelector<HTMLElement>("textarea, input[type=text]")?.focus());
  };
  // tapping the quote above a reply jumps back to the original, with a brief glow
  const jumpTo = (id: string) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-msg-id="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.animate([{ background: "color-mix(in srgb, currentColor 14%, transparent)" }, { background: "transparent" }], { duration: 1400, easing: "ease-out" });
  };
  const byId = new Map(thread.map((x) => [x.id, x]));

  return (
    <div ref={scrollRef} className={`relative flex-1 overflow-y-auto overscroll-contain ${skin.threadClass}`} role="log" aria-live="polite" aria-label="Messages">
      {thread.map((m, i) => {
        const prev = thread[i - 1];
        const next = thread[i + 1];
        const showTime = !prev || m.ts - prev.ts > TEN_MIN;
        const first = showTime || side(prev) !== m.role;
        const last = side(next) !== m.role || (!!next && next.ts - m.ts > TEN_MIN);
        const pos: Pos = first && last ? "single" : first ? "first" : last ? "last" : "middle";
        const turn = why.on ? why.byId.get(m.id) : undefined;
        const lit = turn && (why.hoverId === m.id || why.activeId === m.id) ? turn.fw.color : null;
        let body: ReactNode;
        if (m.discarded) body = <S.EventRow text="draft discarded" />;
        else if (m.kind === "event") body = <S.EventRow text={m.text} />;
        else if (m.kind === "gmail_link") body = <S.GmailCard pos={pos} connected={session?.slots.gmail.status === "filled"} onConnect={chat.connectGmail} />;
        else if (m.kind === "gif") body = <S.Media src={m.text} />;
        else if (m.kind === "link_preview") body = <S.LinkPreview url={m.text} pos={pos} />;
        else if (m.id === draftId) body = <DraftCard skin={skin} chat={chat} />;
        else if (m.role === "agent" && /^to:/i.test(m.text)) body = <S.EventRow text="earlier draft (updated below)" />;
        else if (m.kind === "contact_card") body = <S.ContactCard name={m.text} pos={pos} saved={!!session?.contactSaved} onSave={chat.saveContact} />;
        else
          body = (
            <Replyable mine={m.role === "user"} onReply={() => reply(m)}>
            <S.Bubble
              m={m}
              mine={m.role === "user"}
              pos={pos}
              showTime={last}
              highlight={lit}
              reaction={(typing || revealing) && m.id === lastUserId && m.text.length > 90 ? "👀" : undefined}
              receipt={m.role === "user" && m.id === lastUserId ? (receipts[m.id] ?? "seen") : undefined}
              receiptAt={readAt}
            />
            </Replyable>
          );
        if (m.kind === "gif") body = <Replyable mine={m.role === "user"} onReply={() => reply(m)}>{body}</Replyable>;
        const quoted = m.replyTo ? byId.get(m.replyTo) : undefined;
        return (
          <Fragment key={m.id}>
            <div
              data-msg-id={m.id}
              onMouseEnter={turn ? () => why.setHover(m.id) : undefined}
              onMouseLeave={turn ? () => why.setHover(null) : undefined}
              onClick={turn ? () => why.select(m.id) : undefined}
              className={turn ? "cursor-pointer" : undefined}
            >
              {showTime && <S.DateStamp ts={m.ts} first={i === 0} />}
              {quoted && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    jumpTo(quoted.id);
                  }}
                  className={`flex w-full px-4 pt-1 text-[12px] leading-4 opacity-60 hover:opacity-90 ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  aria-label={`Replying to: ${snippet(quoted)}`}
                >
                  <span className="flex max-w-[75%] items-center gap-1 truncate">
                    <ReplyGlyph size={12} />
                    <span className="truncate">{snippet(quoted)}</span>
                  </span>
                </button>
              )}
              {body}
            </div>
            {i === grad.at && <S.EventRow text="🎓 you've graduated from onboarding" />}
            {knowIdxs.has(i) && know}
          </Fragment>
        );
      })}
      {grad.at === -1 && <S.EventRow text="🎓 you've graduated from onboarding" />}
      {knowIdxs.has(-1) && know}
      {(typing || revealing) && <S.Typing />}
      {!session?.contactSaved && !dismissed && thread.length > 0 && <S.UnknownNotice onAdd={chat.saveContact} onDismiss={() => setDismissed(true)} />}
      <div ref={bottomRef} className="h-1" />
      {why.sheetOpen && <div className="h-[50%]" aria-hidden />}
      {(chat.offline || chat.error) && (
        <div className="sticky bottom-0 pt-2 pb-1 space-y-1">
          {chat.offline && <S.Banner tone="info">you&apos;re offline. nothing&apos;s lost, it&apos;ll pick up when you&apos;re back.</S.Banner>}
          {chat.error && <S.Banner tone="error">{chat.error}</S.Banner>}
        </div>
      )}
    </div>
  );
}
