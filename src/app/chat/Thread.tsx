"use client";
// the message list, drawn by the current skin. same order, grouping and receipts on every phone.
import { Fragment, useEffect, useRef, type ReactNode, type RefObject } from "react";
import type { Msg } from "@/lib/types";
import { DraftCard, draftMsgId } from "./cards/DraftCard";
import { KnowCard, useGradSlot } from "./cards/KnowCard";
import type { Pos, Skin } from "./skins/types";
import type { Chat } from "./useChat";
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
  const gradAt = grad.at;
  const draftId = draftMsgId(session);
  const draftIdx = draftId ? thread.findIndex((m) => m.id === draftId) : -1;
  // a draft from before setup ended moves under the what-i-know card (shown once, not twice); later drafts stay in place
  const draftUnder = gradAt !== null && draftIdx >= 0 && (gradAt === -1 || draftIdx <= gradAt);
  const know = gradAt !== null && (
    <>
      <KnowCard skin={skin} chat={chat} setupMs={grad.setupMs} pos={draftUnder ? "first" : "single"} />
      {draftUnder && <DraftCard skin={skin} chat={chat} pos="last" />}
    </>
  );

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
        const moved = draftUnder && m.id === draftId;
        if (moved) body = null;
        else if (m.kind === "event") body = <S.EventRow text={m.text} />;
        else if (m.kind === "gmail_link") body = <S.GmailCard pos={pos} connected={session?.slots.gmail.status === "filled"} onConnect={chat.connectGmail} />;
        else if (m.kind === "gif") body = <S.Media src={m.text} />;
        else if (m.kind === "link_preview") body = <S.LinkPreview url={m.text} pos={pos} />;
        else if (m.id === draftId && !draftUnder) body = <DraftCard skin={skin} chat={chat} />;
        else if (m.kind === "contact_card") body = <S.ContactCard name={m.text} pos={pos} saved={!!session?.contactSaved} onSave={chat.saveContact} />;
        else
          body = (
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
          );
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
              {body}
            </div>
            {gradAt === i && know}
          </Fragment>
        );
      })}
      {gradAt === -1 && know}
      {(typing || revealing) && <S.Typing />}
      {!chat.saved && S.UnknownNotice && thread.length > 0 && <S.UnknownNotice />}
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
