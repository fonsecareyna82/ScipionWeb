import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, Bot, ChevronDown, CircleAlert, ExternalLink, MessageCircleQuestionMark, RotateCcw, SendHorizontal,
  SlidersHorizontal, Workflow, X } from "lucide-react";

import { askHelp, type HelpAnswer, type HelpCard, type HelpLogPlace } from "@/api/helpChat";
import { useHelpFocus } from "@/utils/help_chat_focus";
import { renderRichHelpText } from "@/utils/rich_help_text";

type Message =
  | { id: number; from: "user"; text: string }
  | { id: number; from: "help"; answer?: HelpAnswer; error?: string; waiting?: boolean };

type SearchCard = Extract<HelpCard, { kind: "protocol" | "param" | "guide" }>;

const STATUS_CLASS: Record<string, string> = {
  failed: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200",
  running: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200",
  launched: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200",
  scheduled: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200",
  aborted: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200",
  finished: "bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-200",
};

const BODY = "text-[14.5px] leading-relaxed text-gray-700 dark:text-gray-300";
const LINK_BUTTON = "text-[13.5px] font-medium text-blue-700 hover:underline dark:text-blue-300";
const EXAMPLES = ["How do I estimate the CTF?", "¿Cómo comparto un proyecto?", "What is the dose filter?"];

function isSearchCard(card: HelpCard): card is SearchCard {
  return card.kind === "protocol" || card.kind === "param" || card.kind === "guide";
}

function titleOf(card: SearchCard) {
  return card.kind === "guide" ? card.title : card.label;
}

function iconOf(card: SearchCard) {
  const Icon = card.kind === "guide" ? BookOpen : card.kind === "param" ? SlidersHorizontal : Workflow;
  return <Icon className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />;
}

function whereOf(card: SearchCard) {
  if (card.kind === "guide") return `User guide · ${card.page}`;
  if (card.kind === "param") return `Parameter of ${card.protocolLabel}${card.section ? ` · ${card.section}` : ""}`;
  return "Protocol";
}

function Avatar() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm">
      <Bot className="h-[18px] w-[18px]" aria-hidden="true" />
    </div>
  );
}

function HelpBubble({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "error" }) {
  return (
    <div className="flex items-start gap-2">
      <Avatar />
      <div className={`min-w-0 max-w-[85%] rounded-2xl rounded-tl-md px-3.5 py-2.5 text-[15px] shadow-sm ${tone === "error"
        ? "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200"
        : "border border-gray-200 bg-white text-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"}`}>
        {children}
      </div>
    </div>
  );
}

function Typing() {
  return (
    <div className="flex items-start gap-2" role="status" aria-label="Looking in the help">
      <Avatar />
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-md border border-gray-200 bg-white px-4 py-3.5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        {[0, 150, 300].map((delay) => (
          <span key={delay} className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                style={{ animationDelay: `${delay}ms` }} />
        ))}
      </div>
    </div>
  );
}

/** The help text of a result: short first, the whole help when asked. */
function CardBody({ card }: { card: SearchCard }) {
  const [open, setOpen] = useState(false);
  const full = card.kind === "protocol" ? card.help : card.kind === "param" ? card.help : card.text;
  const short = card.kind === "protocol" ? card.summary : full;
  const long = card.kind === "protocol" ? full.trim().length > short.trim().length + 20 : full.length > 360;
  return (
    <div className={BODY}>
      {card.kind === "protocol" && open
        ? <div className="space-y-1">{renderRichHelpText(full)}</div>
        : <div className={`${card.kind !== "protocol" && !open && long ? "line-clamp-5" : ""} whitespace-pre-line`}>
            {card.kind === "param" ? renderRichHelpText(short || "This parameter has no help text.")
              : short || "No description."}
          </div>}
      <div className="mt-1 flex flex-wrap gap-x-3">
        {long && (
          <button type="button" className={LINK_BUTTON} onClick={() => setOpen((value) => !value)}>
            {open ? "Show less" : "Read more"}
          </button>
        )}
        {card.kind === "guide" && card.url && (
          <a href={card.url} target="_blank" rel="noreferrer" className={`${LINK_BUTTON} inline-flex items-center gap-1`}>
            Open in the guide <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  );
}

/** The best result, shown inside the answer. */
function MainResult({ card }: { card: SearchCard }) {
  return (
    <div className="mt-2 rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60">
      <div className="flex items-center gap-1.5 text-[15px] font-semibold text-gray-900 dark:text-gray-100">
        {iconOf(card)}{titleOf(card)}
      </div>
      <div className="mb-1 text-[13.5px] text-gray-500 dark:text-gray-400">{whereOf(card)}</div>
      <CardBody card={card} />
    </div>
  );
}

/** Another result: only its title until it is opened. */
function RelatedResult({ card }: { card: SearchCard }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}
              className="flex w-full items-center gap-1.5 px-2.5 py-2 text-left text-[14.5px] text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-800">
        {iconOf(card)}
        <span className="min-w-0 flex-1 truncate">{titleOf(card)}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
                     aria-hidden="true" />
      </button>
      {open && (
        <div className="border-t border-gray-200 px-2.5 py-2 dark:border-gray-700">
          <div className="mb-1 text-[13.5px] text-gray-500 dark:text-gray-400">{whereOf(card)}</div>
          <CardBody card={card} />
        </div>
      )}
    </div>
  );
}

function LogPlace({ label, place }: { label: string; place?: HelpLogPlace | null }) {
  if (!place?.text) return null;
  return (
    <div className="min-w-0 text-[14px]">
      <span className="font-semibold">{label}: </span>
      <span className="break-words font-mono text-[13.5px]">{place.text}</span>
      {place.line != null && (
        <span className="text-gray-500 dark:text-gray-400"> (line {place.line}{place.channel ? ` of ${place.channel}` : ""})</span>
      )}
    </div>
  );
}

function Failure({ card }: { card: Extract<HelpCard, { kind: "failure" }> }) {
  const { cause, error, command } = card.explained || {};
  return (
    <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3 text-gray-900 dark:border-red-900/70 dark:bg-red-950/30 dark:text-gray-100">
      {cause?.title ? (
        <div className="mb-2 flex gap-2">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
          <div className="text-[14.5px]">
            <div className="font-semibold">{cause.title}</div>
            {cause.hint && <div className="mt-0.5">{cause.hint}</div>}
          </div>
        </div>
      ) : (!error?.text && (
        <div className="text-[14.5px]">The logs do not say why. Open the protocol's logs to read them.</div>
      ))}
      <div className="space-y-1">
        <LogPlace label="Error" place={error} />
        <LogPlace label="Command" place={command} />
      </div>
    </div>
  );
}

function Suggestions({ card }: { card: Extract<HelpCard, { kind: "suggestions" }> }) {
  return (
    <div className="mt-2 space-y-1.5">
      {card.items.map((item) => item.installed ? (
        <RelatedResult key={item.className}
                       card={{ kind: "protocol", className: item.className, label: item.label, summary: item.summary,
                               help: item.help }} />
      ) : (
        <div key={item.className}
             className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-2.5 py-2 text-[14.5px] text-gray-600 dark:border-gray-700 dark:text-gray-400"
             title="An administrator can install it from Plugins">
          <Workflow className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[13px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
            not installed
          </span>
        </div>
      ))}
    </div>
  );
}

function ProtocolList({ card, onAsk }: { card: Extract<HelpCard, { kind: "protocols" }>; onAsk: (q: string) => void }) {
  return (
    <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-gray-200 p-1 dark:border-gray-700">
      {card.items.map((item) => (
        <button key={item.protocolId} type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[14.5px] hover:bg-gray-100 dark:hover:bg-gray-800"
                title={item.status === "failed" ? "Why did it fail?" : "What comes after it?"}
                onClick={() => onAsk(item.status === "failed" ? `Why did #${item.protocolId} fail?`
                  : `What comes after #${item.protocolId}?`)}>
          <span className="w-9 shrink-0 text-right font-mono text-[13.5px] text-gray-500">#{item.protocolId}</span>
          <span className="min-w-0 flex-1 truncate text-gray-900 dark:text-gray-100">{item.label}</span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[13px] font-medium ${STATUS_CLASS[item.status]
            ?? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>{item.status || "?"}</span>
        </button>
      ))}
    </div>
  );
}

function Outputs({ card }: { card: Extract<HelpCard, { kind: "outputs" }> }) {
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
      {card.items.map((item) => (
        <div key={item.name}
             className="flex items-center gap-2 border-b border-gray-100 px-2.5 py-2 text-[14.5px] last:border-b-0 dark:border-gray-800">
          <div className="min-w-0 flex-1">
            <div className="truncate text-gray-900 dark:text-gray-100">{item.type}</div>
            <div className="truncate font-mono text-[13.5px] text-gray-500 dark:text-gray-400">{item.name}</div>
          </div>
          {item.size != null && (
            <span className="shrink-0 text-right font-semibold tabular-nums text-gray-900 dark:text-gray-100">
              {item.size.toLocaleString()}
              {item.what && <span className="ml-1 text-[13.5px] font-normal text-gray-500 dark:text-gray-400">{item.what}</span>}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function Answer({ answer, onAsk }: { answer: HelpAnswer; onAsk: (question: string) => void }) {
  const found = answer.cards.filter(isSearchCard);
  const [main, ...related] = found;
  return (
    <HelpBubble>
      <p>{answer.text}</p>
      {main && <MainResult card={main} />}
      {related.length > 0 && (
        <>
          <div className="mb-1.5 mt-3 text-[13.5px] font-medium text-gray-500 dark:text-gray-400">Also related</div>
          <div className="space-y-1.5">
            {related.map((card, index) => <RelatedResult key={index} card={card} />)}
          </div>
        </>
      )}
      {answer.cards.map((card, index) => card.kind === "failure" ? <Failure key={index} card={card} />
        : card.kind === "suggestions" ? <Suggestions key={index} card={card} />
          : card.kind === "protocols" ? <ProtocolList key={index} card={card} onAsk={onAsk} />
            : card.kind === "outputs" ? <Outputs key={index} card={card} /> : null)}
    </HelpBubble>
  );
}

function QuickReplies({ items, disabled, onAsk }: { items: string[]; disabled: boolean; onAsk: (q: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 pl-10">
      {items.map((item) => (
        <button key={item} type="button" disabled={disabled} onClick={() => onAsk(item)}
                className="rounded-full border border-blue-200 bg-white px-3 py-1 text-[13.5px] text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-900 dark:bg-gray-900 dark:text-blue-300 dark:hover:bg-blue-950/40">
          {item}
        </button>
      ))}
    </div>
  );
}

/** A chat to ask about ScipionWeb, the project and its protocols, answered with the web's own help. */
export default function HelpChat() {
  const focus = useHelpFocus();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const nextId = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const busy = messages.some((message) => message.from === "help" && message.waiting);

  useEffect(() => {
    if (!open) return undefined;
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }, [draft]);

  const ask = useCallback((question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    const askedId = nextId.current++;
    const answerId = nextId.current++;
    setMessages((list) => [...list, { id: askedId, from: "user", text }, { id: answerId, from: "help", waiting: true }]);
    setDraft("");
    askHelp(text, { projectId: focus.projectId, protocolId: focus.protocolId })
      .then((answer) => setMessages((list) => list.map((message) => message.id === answerId
        ? { id: answerId, from: "help", answer } : message)))
      .catch((error: unknown) => setMessages((list) => list.map((message) => message.id === answerId
        ? { id: answerId, from: "help", error: error instanceof Error ? error.message : "The help could not answer" }
        : message)));
  }, [busy, focus.projectId, focus.protocolId]);

  const shortcuts: string[] = [];
  if (focus.protocolId) shortcuts.push("Why did it fail?", "What comes next?");
  if (focus.projectId) shortcuts.push("How is the project going?");
  const lastIsAnswer = messages.length > 0 && messages[messages.length - 1].from === "help" && !busy;

  return (
    <>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-label="Help chat" title="Ask the help"
              aria-expanded={open}
              className="relative flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white">
        <MessageCircleQuestionMark className="h-5 w-5" />
      </button>
      {open && (
        <aside role="dialog" aria-label="Help chat"
               className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-gray-50 shadow-2xl dark:bg-gray-950 sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(680px,calc(100vh-7rem))] sm:w-[420px] sm:rounded-2xl sm:border sm:border-gray-200 sm:dark:border-gray-800">
          <header className="flex items-center gap-3 bg-blue-600 px-4 py-3 text-white">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
              <Bot className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-semibold">Help assistant</div>
              <div className="truncate text-[13.5px] text-blue-100">
                {focus.projectId
                  ? <>{focus.projectName || `Project ${focus.projectId}`}{focus.protocolId
                    ? ` · #${focus.protocolId}${focus.protocolLabel ? ` ${focus.protocolLabel}` : ""}` : ""}</>
                  : "Answers from the web's own help"}
              </div>
            </div>
            {messages.length > 0 && (
              <button type="button" aria-label="Start again" title="Start again" onClick={() => setMessages([])}
                      className="rounded-full p-2 text-white/90 hover:bg-white/15">
                <RotateCcw className="h-[18px] w-[18px]" />
              </button>
            )}
            <button type="button" aria-label="Close the help" title="Close" onClick={() => setOpen(false)}
                    className="rounded-full p-2 text-white/90 hover:bg-white/15">
              <X className="h-5 w-5" />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-3.5 py-4">
            <HelpBubble>
              <p>Hi! I can help you with steps, parameters, protocols that failed and what to run next.</p>
              <p className="mt-1.5 text-gray-600 dark:text-gray-400">Write your question in English or Spanish.</p>
            </HelpBubble>
            {messages.length === 0 && (
              <QuickReplies items={[...shortcuts, ...EXAMPLES]} disabled={busy} onAsk={ask} />
            )}
            {messages.map((message) => {
              if (message.from === "user") {
                return (
                  <div key={message.id} className="flex justify-end">
                    <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-blue-600 px-3.5 py-2 text-[15px] text-white shadow-sm">
                      {message.text}
                    </div>
                  </div>
                );
              }
              if (message.waiting) return <Typing key={message.id} />;
              if (message.error) return <HelpBubble key={message.id} tone="error">{message.error}</HelpBubble>;
              return message.answer ? <Answer key={message.id} answer={message.answer} onAsk={ask} /> : null;
            })}
            {lastIsAnswer && <QuickReplies items={shortcuts} disabled={busy} onAsk={ask} />}
          </div>

          <footer className="border-t border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
            <form className="flex items-end gap-2 rounded-3xl border border-gray-300 bg-white py-1.5 pl-4 pr-1.5 focus-within:border-blue-500 dark:border-gray-700 dark:bg-gray-950"
                  onSubmit={(event) => { event.preventDefault(); ask(draft); }}>
              <textarea ref={inputRef} rows={1} value={draft} maxLength={500} placeholder="Write your question…"
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); ask(draft); }
                        }}
                        className="max-h-[120px] flex-1 resize-none self-center bg-transparent py-1.5 text-[15.5px] text-gray-900 outline-none dark:text-gray-100" />
              <button type="submit" aria-label="Send" disabled={busy || !draft.trim()}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
                <SendHorizontal className="h-[18px] w-[18px]" />
              </button>
            </form>
          </footer>
        </aside>
      )}
    </>
  );
}
