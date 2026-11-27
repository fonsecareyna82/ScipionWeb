import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, ChevronDown, FileText, History, Trash2, CircleAlert, ExternalLink, MessageCircleQuestionMark, RotateCcw, SendHorizontal,
  SlidersHorizontal, Sparkles, Workflow, X, CheckCircle2, Circle, CircleDashed, CircleMinus, GraduationCap, Hand, Loader2,
  LocateFixed, XCircle } from "lucide-react";

import {
  applyHelpAction, askHelp, deleteConversation, downloadReport, getConversation, getHelpChatStatus, listConversations, type HelpActionCard, type HelpAnswer, type HelpCard, type HelpChatStatus,
  type HelpComparisonCard, type HelpLogPlace, type HelpRelaunchMode, type HelpReportCard, type HelpSubsetCard,
  type HelpSubsetCondition, type HelpTemplateCard, type HelpTemplateOptions, type HelpSubworkflowCard, type HelpTagCard,
  type HelpRenameCard, type HelpScheduleCard, type HelpManyCard, type HelpFocusCard, type HelpNewProjectCard, type HelpWatchCard,
  type HelpCustomCard,
  type HelpConversationSummary, type HelpTurn, type HelpChatMode, type HelpTutorialCard, type HelpTutorialState,
} from "@/api/helpChat";
import { requestFromHelpChat } from "@/utils/help_chat_actions";
import { renderChatMarkdown } from "@/utils/chat_markdown";
import { useHelpFocus } from "@/utils/help_chat_focus";
import { renderRichHelpText } from "@/utils/rich_help_text";

type Message =
  | { id: number; from: "user"; text: string }
  | { id: number; from: "help"; answer?: HelpAnswer; error?: string; waiting?: boolean; earlier?: boolean };

// The newest answer of the chat (the tutor's progress shows open only there)
const LatestAnswer = createContext(true);

// An answer from an earlier conversation: its cards show what was proposed, but nothing can be applied from them
const CardsReadOnly = createContext(false);

function EarlierNote() {
  return (
    <div className="mt-2 text-gray-500 dark:text-gray-400">
      From an earlier conversation: ask again to do it as things are now.
    </div>
  );
}

// The conversation open, kept in this browser so that a reload goes back to it
const CONVERSATION_KEY = "scipionweb.helpChat.conversation";

function storedConversation(): number | null {
  try {
    const value = Number(window.localStorage.getItem(CONVERSATION_KEY));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function storeConversation(id: number | null) {
  try {
    if (id) window.localStorage.setItem(CONVERSATION_KEY, String(id));
    else window.localStorage.removeItem(CONVERSATION_KEY);
  } catch {
    // Nothing kept: the chat still works
  }
}

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
// The first question of the tutor (the user sees it as theirs)
const TUTOR_START = "Guide me step by step";
const EXAMPLES = ["How do I estimate the CTF?", "¿Cómo comparto un proyecto?", "What is the dose filter?"];
// The turns sent to the assistant so it follows the conversation
const HISTORY_TURNS = 12;

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

// The parts of the documentation, as the published site names them
const DOC_AREAS: Record<string, string> = {
  "user-guide": "User guide", "getting-started": "Getting started", installation: "Installation",
  configuration: "Configuration", operations: "Operations", cli: "Command line", support: "Support",
};

function whereOf(card: SearchCard) {
  if (card.kind === "guide") return `${DOC_AREAS[card.area ?? "user-guide"] ?? "Documentation"} · ${card.page}`;
  if (card.kind === "param") return `Parameter of ${card.protocolLabel}${card.section ? ` · ${card.section}` : ""}`;
  return "Protocol";
}

// Scipion's helmet, the web's own logo (as in the sidebar)
const LOGO = "/images/logo/scipion_icon.png";
const LOGO_WHITE = "/images/logo/scipion_icon_white.png";

function Avatar() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <img src={LOGO} alt="" aria-hidden="true" className="h-5 w-5 object-contain dark:hidden" />
      <img src={LOGO_WHITE} alt="" aria-hidden="true" className="hidden h-5 w-5 object-contain dark:block" />
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

function Typing({ label }: { label: string }) {
  return (
    <div className="flex items-start gap-2" role="status" aria-label={label}>
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
            Open in the documentation <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
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

const valueText = (value: unknown) => value === true ? "yes" : value === false ? "no" : String(value ?? "");

const MODE_TEXT: Record<HelpRelaunchMode, { title: string; note: string }> = {
  continue: { title: "Continue", note: "keeps what is done and goes on from where it stopped" },
  restart: { title: "Restart", note: "runs it again from the start; its current results are deleted" },
};

/** A proposal of the assistant: what would happen, and nothing until the user applies it. */
type SimpleActionCard = Exclude<HelpActionCard, { action: "template" | "continue" | "subset" | "copyworkflow" | "reset"
  | "deletefrom" | "tag" | "untag" | "rename" | "schedule" | "stopmany" | "relaunchmany" | "newproject" | "watch"
  | "unwatch" | "custom" }>;

const CARD_BOX = "mt-2 rounded-xl border border-amber-300 bg-amber-50/60 p-3 text-[14.5px] text-gray-900 dark:border-amber-800 dark:bg-amber-950/20 dark:text-gray-100";
const CARD_EYEBROW = "text-[13.5px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300";
const PRIMARY_BUTTON = "rounded-full bg-blue-600 px-3.5 py-1.5 text-[14px] font-medium text-white hover:bg-blue-700 disabled:opacity-50";
const QUIET_BUTTON = "rounded-full px-3.5 py-1.5 text-[14px] font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800";

function shortClass(className: string) {
  return className.replace(/^Prot/, "").replace(/([a-z])([A-Z])/g, "$1 $2");
}

/** What applying a chain did: the protocols added and the ones launched now. */
function chainResult(result: { created?: string[]; launched?: string[]; errors?: string[] }) {
  const parts = [];
  if (result.created?.length) parts.push(`Added ${result.created.length} protocols (#${result.created[0]}…#${result.created[result.created.length - 1]}).`);
  parts.push(result.launched?.length ? `Launched now: ${result.launched.map((id) => `#${id}`).join(", ")}; they run as their inputs are ready.` : "Nothing launched now.");
  if (result.errors?.length) parts.push(`Could not launch: ${result.errors.join("; ")}`);
  return parts.join(" ");
}

/** A template to add, whole or from an output of the project: what it links to, where it stops, and its fields. */
function TemplateCard({ card }: { card: HelpTemplateCard }) {
  const readOnly = useContext(CardsReadOnly);
  const [stops, setStops] = useState<Set<string>>(() => new Set(card.steps.filter((step) => step.stop).map((step) => step.id)));
  const [fields, setFields] = useState<Record<string, string>>(
    () => Object.fromEntries(card.fields.map((field) => [field.alias, String(field.value ?? "")])));
  const [state, setState] = useState<"open" | "applying" | "done" | "cancelled">("open");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState("");
  const [launching, setLaunching] = useState(true);
  const blocked = card.missing.length > 0;

  const toggle = (id: string) => setStops((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const apply = async (launch: boolean) => {
    setLaunching(launch);
    setState("applying");
    setError(null);
    try {
      const result = await applyHelpAction({
        action: "template", projectId: card.projectId, protocolId: card.source?.protocolId ?? "", launch,
        templateId: card.templateId, fromOutput: card.source?.output, anchor: card.anchor ?? undefined,
        links: Object.fromEntries(card.links.filter((link) => link.projectRef).map((link) => [link.templateRef, link.projectRef as string])),
        stops: card.steps.filter((step) => stops.has(step.id)).map((step) => step.id),
        ...(card.fields.length ? { fields } : {}),
      });
      requestFromHelpChat({ kind: "refresh", projectId: card.projectId });
      setDone(launch ? chainResult(result)
        : `${chainResult({ created: result.created })} Ask me to start it when you want, or launch them from the graph.`);
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The template could not be added");
      setState("open");
    }
  };

  return (
    <div className={CARD_BOX} data-testid="help-action">
      <div className={CARD_EYEBROW}>Needs your confirmation</div>
      <div className="mt-0.5 font-semibold">
        Add {card.templateName}{card.source ? ` from #${card.source.protocolId} ${card.source.label}` : ""}
      </div>
      {card.source && <div className="text-gray-600 dark:text-gray-400">Starting from its {card.source.output}.</div>}
      {card.few && (
        <div className="mt-1.5 rounded-lg bg-amber-100 px-2.5 py-1.5 font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
          From here this template adds only {card.steps.length === 1 ? "1 protocol" : `${card.steps.length} protocols`}.
          Ask for the other templates if you expected more.
        </div>
      )}
      {card.reason && <div className="mt-0.5 text-gray-600 dark:text-gray-400">{card.reason}</div>}

      {card.links.length > 0 && (
        <div className="mt-2">
          <div className="font-medium">Takes from your project</div>
          <ul className="mt-0.5 space-y-0.5">
            {card.links.map((link) => (
              <li key={link.templateRef} className={link.projectRef ? "" : "text-red-700 dark:text-red-300"}>
                {shortClass(link.templateClass)} {link.templateRef.split(".").slice(1).join(".")}:{" "}
                {link.projectRef
                  ? <><strong>#{link.projectRef.split(".")[0]}</strong> {link.projectLabel}</>
                  : <strong>nothing found</strong>}
              </li>
            ))}
          </ul>
          {blocked && (
            <div className="mt-1 text-red-700 dark:text-red-300">
              Ask the assistant which protocol to use for what is missing.
            </div>
          )}
        </div>
      )}

      {card.fields.length > 0 && (
        <div className="mt-2 space-y-1.5">
          <div className="font-medium">Its values</div>
          {card.fields.map((field) => (
            <label key={field.alias} className="block">
              <span className="text-gray-700 dark:text-gray-300">{field.title}</span>
              <input value={fields[field.alias] ?? ""} disabled={state !== "open"}
                     onChange={(event) => setFields((current) => ({ ...current, [field.alias]: event.target.value }))}
                     className="mt-0.5 block w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-[14.5px] outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950" />
            </label>
          ))}
        </div>
      )}

      <div className="mt-2">
        <div className="font-medium">{card.steps.length} protocols. It stops after the ticked ones for you to look:</div>
        <ul className="mt-1 max-h-60 space-y-0.5 overflow-y-auto rounded-lg border border-amber-200 bg-white/70 p-1.5 dark:border-amber-900 dark:bg-gray-950/40">
          {card.steps.map((step) => (
            <li key={step.id}>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" checked={stops.has(step.id)} disabled={state !== "open"}
                       onChange={() => toggle(step.id)} aria-label={`Stop after ${step.label || step.className}`} />
                <span className="min-w-0">
                  {step.label || shortClass(step.className)}
                  {step.keyStep && <span className="ml-1.5 text-[13.5px] text-amber-700 dark:text-amber-300">{step.keyStep}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-1 text-gray-600 dark:text-gray-400">
          Add: adds them, and nothing runs until you ask. Add and launch: also launches up to the stops; ask me
          to go on when you have looked.
        </div>
      </div>

      {error && <div className="mt-2 text-red-700 dark:text-red-300">{error}</div>}
      {readOnly ? <EarlierNote /> : state === "done" ? (
        <div className="mt-2 font-medium text-green-700 dark:text-green-300">{done}</div>
      ) : state === "cancelled" ? (
        <div className="mt-2 text-gray-500 dark:text-gray-400">Cancelled: nothing was done.</div>
      ) : (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" onClick={() => void apply(false)} disabled={state === "applying" || blocked}
                  className="rounded-full border border-blue-300 px-3.5 py-1.5 text-[14px] font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/40">
            {state === "applying" && !launching ? "Adding…" : "Add"}
          </button>
          <button type="button" onClick={() => void apply(true)} disabled={state === "applying" || blocked} className={PRIMARY_BUTTON}>
            {state === "applying" && launching ? "Adding…" : "Add and launch"}
          </button>
          <button type="button" onClick={() => setState("cancelled")} disabled={state === "applying"} className={QUIET_BUTTON}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

const conditionText = (condition: HelpSubsetCondition) => `${condition.column} ${condition.op} ${valueText(condition.value)}`;

/** A subset of an output kept by its values: how many stay, and the name of the new subset. */
function SubsetCard({ card }: { card: HelpSubsetCard }) {
  const readOnly = useContext(CardsReadOnly);
  const [name, setName] = useState(card.name);
  const [state, setState] = useState<"open" | "applying" | "done" | "cancelled">("open");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState("");

  const apply = async () => {
    setState("applying");
    setError(null);
    try {
      const result = await applyHelpAction({
        action: "subset", projectId: card.projectId, protocolId: card.protocolId, outputName: card.outputName,
        table: card.table, conditions: card.conditions, makes: card.makes, name: name.trim() || card.name,
      });
      requestFromHelpChat({ kind: "refresh", projectId: card.projectId });
      setDone(`Subset made: it keeps ${result.kept ?? card.kept} of ${result.total ?? card.total}.`);
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The subset could not be made");
      setState("open");
    }
  };

  return (
    <div className={CARD_BOX} data-testid="help-action">
      <div className={CARD_EYEBROW}>Needs your confirmation</div>
      <div className="mt-0.5 font-semibold">Subset of #{card.protocolId} {card.label}, {card.outputName}</div>
      {card.reason && <div className="mt-0.5 text-gray-600 dark:text-gray-400">{card.reason}</div>}
      <div className="mt-2">
        <span className="font-medium">Keeps the ones with </span>
        {card.conditions.map((condition, index) => (
          <span key={index}>{index > 0 && " and "}<code className="rounded bg-white/70 px-1 font-mono text-[13.5px] dark:bg-gray-900">{conditionText(condition)}</code></span>
        ))}
      </div>
      <div className="mt-1.5 text-[15px] font-semibold">
        Keeps {card.kept.toLocaleString()} of {card.total.toLocaleString()}
        <span className="font-normal text-gray-600 dark:text-gray-400"> ({card.removed.toLocaleString()} left out)</span>
      </div>
      <div className="mt-0.5 text-gray-600 dark:text-gray-400">
        It makes a new subset of {card.makes}; the output it comes from stays as it is.
      </div>
      <label className="mt-2 block">
        <span className="text-gray-700 dark:text-gray-300">Name of the subset</span>
        <input value={name} disabled={state !== "open"} onChange={(event) => setName(event.target.value)}
               className="mt-0.5 block w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-[14.5px] outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950" />
      </label>
      {error && <div className="mt-2 text-red-700 dark:text-red-300">{error}</div>}
      {readOnly ? <EarlierNote /> : state === "done" ? (
        <div className="mt-2 font-medium text-green-700 dark:text-green-300">{done}</div>
      ) : state === "cancelled" ? (
        <div className="mt-2 text-gray-500 dark:text-gray-400">Cancelled: nothing was done.</div>
      ) : (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" onClick={() => void apply()} disabled={state === "applying"} className={PRIMARY_BUTTON}>
            {state === "applying" ? "Making it…" : "Create subset"}
          </button>
          <button type="button" onClick={() => setState("cancelled")} disabled={state === "applying"} className={QUIET_BUTTON}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

/** Protocols side by side: the parameters that differ, their outputs and how long they ran. */
function ComparisonCard({ card }: { card: HelpComparisonCard }) {
  const ids = card.protocols.map((protocol) => protocol.protocolId);
  const cell = "border-t border-gray-200 px-2 py-1 align-top dark:border-gray-700";
  return (
    <div className="mt-2 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700" data-testid="help-comparison">
      <table className="w-full border-collapse text-left text-[13.5px]">
        <thead className="bg-gray-50 dark:bg-gray-800/60">
          <tr>
            <th className="px-2 py-1.5 font-medium text-gray-500 dark:text-gray-400"> </th>
            {card.protocols.map((protocol) => (
              <th key={protocol.protocolId} className="px-2 py-1.5 font-semibold text-gray-900 dark:text-gray-100">
                #{protocol.protocolId}
                <span className="block font-normal text-gray-500 dark:text-gray-400">{protocol.status}
                  {protocol.minutes != null ? ` · ${protocol.minutes} min` : ""}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {card.parameters.map((parameter) => (
            <tr key={parameter.name}>
              <td className={`${cell} text-gray-600 dark:text-gray-400`}>{parameter.label}</td>
              {ids.map((pid) => <td key={pid} className={`${cell} font-medium`}>{parameter.values[pid] || "–"}</td>)}
            </tr>
          ))}
          {card.outputs.filter((output) => ids.some((pid) => output.sizes[pid] != null)).map((output) => (
            <tr key={output.output}>
              <td className={`${cell} text-gray-600 dark:text-gray-400`}>{output.output}</td>
              {ids.map((pid) => <td key={pid} className={`${cell} tabular-nums`}>
                {output.sizes[pid] != null ? output.sizes[pid]!.toLocaleString() : "–"}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-gray-200 px-2 py-1.5 text-[13.5px] text-gray-500 dark:border-gray-700 dark:text-gray-400">
        {card.parameters.length === 0 ? "Every parameter is the same" : `${card.same} other parameters are the same`}
      </div>
    </div>
  );
}

/** Going on with a chain after a stop: what runs now. */
function ContinueCard({ card }: { card: Extract<HelpActionCard, { action: "continue" }> }) {
  const readOnly = useContext(CardsReadOnly);
  const [state, setState] = useState<"open" | "applying" | "done" | "cancelled">("open");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState("");

  const apply = async () => {
    setState("applying");
    setError(null);
    try {
      const result = await applyHelpAction({ action: "continue", projectId: card.projectId, protocolId: card.protocolId,
                                             chainId: card.chainId });
      requestFromHelpChat({ kind: "refresh", projectId: card.projectId });
      setDone(chainResult(result));
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The chain could not go on");
      setState("open");
    }
  };

  return (
    <div className={CARD_BOX} data-testid="help-action">
      <div className={CARD_EYEBROW}>Needs your confirmation</div>
      <div className="mt-0.5 font-semibold">
        {card.protocolId ? `Go on after #${card.protocolId} ${card.label}` : "Start the chain"}
      </div>
      <div className="text-gray-600 dark:text-gray-400">{card.title}</div>
      {card.reason && <div className="mt-0.5 text-gray-600 dark:text-gray-400">{card.reason}</div>}
      <div className="mt-2 font-medium">Launches now:</div>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
        {card.next.map((item) => (
          <li key={item.protocolId}>
            #{item.protocolId} {item.label || shortClass(item.className)}
            {item.stop && <span className="ml-1.5 text-[13.5px] text-amber-700 dark:text-amber-300">stops after it</span>}
          </li>
        ))}
      </ul>
      {error && <div className="mt-2 text-red-700 dark:text-red-300">{error}</div>}
      {readOnly ? <EarlierNote /> : state === "done" ? (
        <div className="mt-2 font-medium text-green-700 dark:text-green-300">{done}</div>
      ) : state === "cancelled" ? (
        <div className="mt-2 text-gray-500 dark:text-gray-400">Cancelled: nothing was done.</div>
      ) : (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" onClick={() => void apply()} disabled={state === "applying"} className={PRIMARY_BUTTON}>
            {state === "applying" ? "Launching…" : "Launch them"}
          </button>
          <button type="button" onClick={() => setState("cancelled")} disabled={state === "applying"} className={QUIET_BUTTON}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function LaunchChoice({ checked, onChange, disabled, text }: { checked: boolean; onChange: (value: boolean) => void;
                                                               disabled: boolean; text: string }) {
  return (
    <label className="mt-2 flex items-center gap-2">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span>{text}</span>
    </label>
  );
}

function CardButtons({ state, applyText, danger = false, disabled = false, onApply, onCancel }: {
  state: "open" | "applying"; applyText: string; danger?: boolean; disabled?: boolean; onApply: () => void;
  onCancel: () => void }) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-2">
      <button type="button" onClick={onApply} disabled={state === "applying" || disabled}
              className={`rounded-full px-3.5 py-1.5 text-[14px] font-medium text-white disabled:opacity-50 ${danger
                ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}>
        {state === "applying" ? "Applying…" : applyText}
      </button>
      <button type="button" onClick={onCancel} disabled={state === "applying"}
              className="rounded-full px-3.5 py-1.5 text-[14px] font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800">
        Cancel
      </button>
    </div>
  );
}

const SUBWORKFLOW_TEXT = {
  copyworkflow: { title: "Copy", note: "Copies of these protocols, linked among themselves. The originals stay as they are.",
                  apply: "Make the copies" },
  reset: { title: "Reset", note: "Their results are cleared so they can run again. The protocols stay.",
           apply: "Reset" },
  deletefrom: { title: "Delete", note: "They are deleted with their folders and results. They cannot be recovered.",
                apply: "Delete them" },
} as const;

function isSubworkflowCard(card: HelpActionCard): card is HelpSubworkflowCard {
  return card.action === "copyworkflow" || card.action === "reset" || card.action === "deletefrom";
}

/** A protocol with everything depending on it: copied, reset or deleted, exactly the protocols listed. */
function SubworkflowCard({ card }: { card: HelpSubworkflowCard }) {
  const readOnly = useContext(CardsReadOnly);
  const [state, setState] = useState<"open" | "applying" | "done" | "cancelled">("open");
  const [error, setError] = useState<string | null>(null);
  const [launch, setLaunch] = useState(Boolean(card.launch));
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState("");
  const text = SUBWORKFLOW_TEXT[card.action];
  const count = card.protocols.length;
  const danger = card.action === "deletefrom";
  const losesResults = card.action !== "copyworkflow";
  const lost = card.protocols.flatMap((protocol) => protocol.outputs ?? []);
  const where = `#${card.protocolId}${card.label ? ` ${card.label}` : ""}`;

  const apply = async () => {
    setState("applying");
    setError(null);
    try {
      const result = await applyHelpAction({
        action: card.action, projectId: card.projectId, protocolId: card.protocolId,
        protocolIds: card.protocols.map((protocol) => protocol.protocolId),
        ...(card.action === "copyworkflow" ? { launch } : {}),
        ...(danger ? { confirm: confirm.trim() } : {}),
      });
      requestFromHelpChat({ kind: "refresh", projectId: card.projectId });
      setDone(card.action === "copyworkflow"
        ? `${count === 1 ? "Copy" : `${count} copies`} made${result.newProtocolId ? `, starting at #${result.newProtocolId}` : ""}${result.started ? ", and launched" : ""}.`
        : card.action === "reset" ? `${count === 1 ? "Reset" : `${count} protocols reset`}.` : `${count === 1 ? "Deleted" : `${count} protocols deleted`}.`);
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The action could not be applied");
      setState("open");
    }
  };

  return (
    <div className={`mt-2 rounded-xl border p-3 text-[14.5px] text-gray-900 dark:text-gray-100 ${danger
      ? "border-red-300 bg-red-50/70 dark:border-red-900 dark:bg-red-950/25"
      : "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20"}`}
         data-testid="help-action">
      <div className={`text-[13.5px] font-semibold uppercase tracking-wide ${danger
        ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`}>
        {danger ? "Cannot be undone" : "Needs your confirmation"}
      </div>
      <div className="mt-0.5 font-semibold">
        {text.title} {where}{count > 1 ? ` and the ${count - 1} after it` : ""}
      </div>
      {card.reason && <div className="mt-0.5 text-gray-600 dark:text-gray-400">{card.reason}</div>}
      <div className={`mt-2 ${danger ? "font-semibold" : "text-gray-600 dark:text-gray-400"}`}>{text.note}</div>
      <ul className="mt-1.5 max-h-48 space-y-0.5 overflow-y-auto pl-1">
        {card.protocols.map((protocol) => (
          <li key={protocol.protocolId}>
            <strong>#{protocol.protocolId}</strong> {protocol.label}
            <span className="text-gray-500 dark:text-gray-400"> · {protocol.status || "new"}</span>
            {losesResults && (protocol.outputs ?? []).length > 0 && (
              <span className="block pl-4 text-[13.5px] text-gray-600 dark:text-gray-400">
                {(protocol.outputs ?? []).map((output) => `${output.name}${output.size != null
                  ? `: ${output.size.toLocaleString()} items` : ""}`).join(" · ")}
              </span>
            )}
          </li>
        ))}
      </ul>
      {losesResults && (
        <div className="mt-1.5 text-gray-700 dark:text-gray-300">
          {lost.length === 0 ? "No results are lost." : `${lost.length} result${lost.length === 1 ? "" : "s"} lost.`}
        </div>
      )}
      {card.action === "copyworkflow" && (
        <LaunchChoice checked={launch} onChange={setLaunch} disabled={state !== "open" || readOnly}
                      text="Launch the copies when they are made" />
      )}
      {danger && !readOnly && state !== "done" && (
        <label className="mt-2 block">
          <span className="text-gray-700 dark:text-gray-300">Write how many protocols are deleted (<strong>{count}</strong>) to confirm</span>
          <input value={confirm} onChange={(event) => setConfirm(event.target.value)} disabled={state !== "open"}
                 aria-label={`Write ${count} to confirm`} inputMode="numeric"
                 className="mt-1 block w-32 rounded-lg border border-red-300 bg-white px-2.5 py-1.5 text-[14.5px] outline-none focus:border-red-500 dark:border-red-800 dark:bg-gray-950" />
        </label>
      )}
      {error && <div className="mt-2 text-red-700 dark:text-red-300">{error}</div>}
      {readOnly ? <EarlierNote /> : state === "done" ? (
        <div className="mt-2 font-medium text-green-700 dark:text-green-300">{done}</div>
      ) : state === "cancelled" ? (
        <div className="mt-2 text-gray-500 dark:text-gray-400">Cancelled: nothing was done.</div>
      ) : (
        <CardButtons state={state} danger={danger} onApply={() => void apply()} onCancel={() => setState("cancelled")}
                     applyText={card.action === "copyworkflow" && launch ? "Copy and launch" : text.apply}
                     disabled={danger && confirm.trim() !== String(count)} />
      )}
    </div>
  );
}

/** One protocol's change made with a click: a rename or a schedule. */
function useSimpleApply(card: { projectId: number }) {
  const [state, setState] = useState<"open" | "applying" | "done" | "cancelled">("open");
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>) => {
    setState("applying");
    setError(null);
    try {
      await action();
      requestFromHelpChat({ kind: "refresh", projectId: card.projectId });
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The action could not be applied");
      setState("open");
    }
  };
  return { state, setState, error, run };
}

function CardEnd({ state, error, done, applyText, onApply, onCancel }: {
  state: "open" | "applying" | "done" | "cancelled"; error: string | null; done: string; applyText: string;
  onApply: () => void; onCancel: () => void }) {
  const readOnly = useContext(CardsReadOnly);
  return (
    <>
      {error && <div className="mt-2 text-red-700 dark:text-red-300">{error}</div>}
      {readOnly ? <EarlierNote /> : state === "done" ? (
        <div className="mt-2 font-medium text-green-700 dark:text-green-300">{done}</div>
      ) : state === "cancelled" ? (
        <div className="mt-2 text-gray-500 dark:text-gray-400">Cancelled: nothing was done.</div>
      ) : (
        <CardButtons state={state} applyText={applyText} onApply={onApply} onCancel={onCancel} />
      )}
    </>
  );
}

/** A new name and/or comment for a protocol, before and after. */
function RenameCard({ card }: { card: HelpRenameCard }) {
  const { state, setState, error, run } = useSimpleApply(card);
  const where = `#${card.protocolId}${card.label ? ` ${card.label}` : ""}`;
  return (
    <div className={CARD_BOX} data-testid="help-action">
      <div className={CARD_EYEBROW}>Needs your confirmation</div>
      <div className="mt-0.5 font-semibold">
        {card.changes.some((change) => change.field === "name") ? "Rename" : "Change the comment of"} {where}
      </div>
      {card.reason && <div className="mt-0.5 text-gray-600 dark:text-gray-400">{card.reason}</div>}
      <dl className="mt-2 space-y-1.5">
        {card.changes.map((change) => (
          <div key={change.field}>
            <dt className="font-medium">{change.field === "name" ? "Name" : "Comment"}</dt>
            <dd className="whitespace-pre-wrap">
              {change.from && (
                <span className="block text-gray-500 line-through dark:text-gray-400">{change.from}</span>
              )}
              <strong className="block">{change.to || "(empty)"}</strong>
            </dd>
          </div>
        ))}
      </dl>
      <CardEnd state={state} error={error} done="Done." applyText="Apply" onCancel={() => setState("cancelled")}
               onApply={() => void run(() => applyHelpAction({
                 action: "rename", projectId: card.projectId, protocolId: card.protocolId,
                 renames: card.changes.map((change) => ({ field: change.field, to: change.to })) }))} />
    </div>
  );
}

/** A protocol that starts by itself when the protocols it waits for finish. */
function ScheduleCard({ card }: { card: HelpScheduleCard }) {
  const { state, setState, error, run } = useSimpleApply(card);
  const where = `#${card.protocolId}${card.label ? ` ${card.label}` : ""}`;
  const pending = card.waitFor.filter((item) => !item.done);
  return (
    <div className={CARD_BOX} data-testid="help-action">
      <div className={CARD_EYEBROW}>Needs your confirmation</div>
      <div className="mt-0.5 font-semibold">Start {where} when these finish</div>
      {card.reason && <div className="mt-0.5 text-gray-600 dark:text-gray-400">{card.reason}</div>}
      <ul className="mt-1.5 space-y-0.5">
        {card.waitFor.map((item) => (
          <li key={item.protocolId}>
            <strong>#{item.protocolId}</strong> {item.label}
            <span className="text-gray-500 dark:text-gray-400"> · {item.done ? "finished already" : item.status || "new"}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 text-gray-600 dark:text-gray-400">
        {pending.length === 0 ? "They finished already: it starts right away. " : "It waits as scheduled, and starts by itself. "}
        It also waits for its own inputs. Stop it to cancel the wait.
      </div>
      <CardEnd state={state} error={error} done="Scheduled." applyText="Schedule it"
               onCancel={() => setState("cancelled")}
               onApply={() => void run(() => applyHelpAction({
                 action: "schedule", projectId: card.projectId, protocolId: card.protocolId,
                 protocolIds: card.waitFor.map((item) => item.protocolId) }))} />
    </div>
  );
}

/** Several protocols stopped or relaunched at once, each as alone; the ones left out are shown. */
function ManyCard({ card }: { card: HelpManyCard }) {
  const readOnly = useContext(CardsReadOnly);
  const [state, setState] = useState<"open" | "applying" | "done" | "cancelled">("open");
  const [error, setError] = useState<string | null>(null);
  const [restartAll, setRestartAll] = useState(false);
  const [scope, setScope] = useState<"single" | "all" | null>(null);
  const [done, setDone] = useState("");
  const stop = card.action === "stopmany";
  const doing = card.items.filter((item) => item.skip === null);
  const withChildren = doing.filter((item) => (item.children ?? []).length > 0);
  const ids = (list: string[]) => list.map((id) => `#${id}`).join(", ");

  const apply = async () => {
    setState("applying");
    setError(null);
    try {
      const result = await applyHelpAction({
        action: card.action, projectId: card.projectId, protocolId: card.protocolId,
        protocolIds: doing.map((item) => item.protocolId),
        ...(stop ? {} : { mode: restartAll ? "restart" : undefined, scope: scope ?? undefined }) });
      requestFromHelpChat({ kind: "refresh", projectId: card.projectId });
      const failed = result.failed ?? [];
      setDone(`${stop ? "Stopped" : "Sent"}: ${ids(result.done ?? [])}.${failed.length
        ? ` Not done: ${failed.map((item) => `#${item.protocolId} (${item.error})`).join("; ")}.` : ""}`);
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The action could not be applied");
      setState("open");
    }
  };

  return (
    <div className={CARD_BOX} data-testid="help-action">
      <div className={CARD_EYEBROW}>Needs your confirmation</div>
      <div className="mt-0.5 font-semibold">
        {stop ? "Stop" : "Relaunch"} {doing.length === 1 ? "1 protocol" : `${doing.length} protocols`}
      </div>
      {card.reason && <div className="mt-0.5 text-gray-600 dark:text-gray-400">{card.reason}</div>}
      <ul className="mt-1.5 space-y-0.5">
        {card.items.map((item) => (
          <li key={item.protocolId} className={item.skip ? "text-gray-500 dark:text-gray-400" : ""}>
            <strong>#{item.protocolId}</strong> {item.label}
            <span className="text-gray-500 dark:text-gray-400"> · {item.status || "new"}</span>
            {item.skip ? <span> · left out: {item.skip}</span>
              : item.mode && <span> · {restartAll || item.mode === "restart" ? "from scratch" : "goes on where it stopped"}</span>}
          </li>
        ))}
      </ul>
      {!stop && card.canContinue && (
        <LaunchChoice checked={restartAll} onChange={setRestartAll} disabled={state !== "open" || readOnly}
                      text="Restart them all from scratch" />
      )}
      {!stop && card.needsScope && (
        <fieldset className="mt-2 space-y-1" disabled={state !== "open" || readOnly}>
          <legend className="font-medium">
            Other protocols depend on {ids(withChildren.map((item) => item.protocolId))}
          </legend>
          <label className="flex items-start gap-2">
            <input type="radio" name={`many-scope-${card.protocolId}`} className="mt-1" checked={scope === "single"}
                   onChange={() => setScope("single")} />
            <span><strong>Only these</strong>: the ones depending on them are reset and lose their outputs, without running again</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name={`many-scope-${card.protocolId}`} className="mt-1" checked={scope === "all"}
                   onChange={() => setScope("all")} />
            <span><strong>Each with its whole workflow</strong>: the ones depending on them run again after them</span>
          </label>
        </fieldset>
      )}
      {error && <div className="mt-2 text-red-700 dark:text-red-300">{error}</div>}
      {readOnly ? <EarlierNote /> : state === "done" ? (
        <div className="mt-2 font-medium text-green-700 dark:text-green-300">{done}</div>
      ) : state === "cancelled" ? (
        <div className="mt-2 text-gray-500 dark:text-gray-400">Cancelled: nothing was done.</div>
      ) : (
        <CardButtons state={state} applyText={stop ? "Stop them" : "Relaunch them"}
                     disabled={!stop && card.needsScope && scope === null}
                     onApply={() => void apply()} onCancel={() => setState("cancelled")} />
      )}
    </div>
  );
}

/** A new project: empty, or with the import of the data said (saved, its form opens to review it). */
function NewProjectCard({ card }: { card: HelpNewProjectCard }) {
  const { state, setState, error, run } = useSimpleApply(card);
  const apply = () => void run(async () => {
    const result = await applyHelpAction({
      action: "newproject", projectId: 0, protocolId: "", name: card.name,
      fields: { data: card.importClass ?? "", folder: card.folder ?? "", pattern: card.pattern ?? "",
                streaming: card.streaming, gainFile: card.gainFile ?? "",
                ...Object.fromEntries(card.values.map((value) => [value.name, value.value])) } });
    if (result.projectId != null) {
      window.location.assign(`/project/load/${encodeURIComponent(String(result.projectId))}${result.newProtocolId
        ? `?protocol=${encodeURIComponent(result.newProtocolId)}&form=1` : ""}`);
    }
  });
  const label = "text-gray-600 dark:text-gray-400";
  return (
    <div className={CARD_BOX} data-testid="help-action">
      <div className={CARD_EYEBROW}>Needs your confirmation</div>
      <div className="mt-0.5 font-semibold">New project “{card.name}”</div>
      {card.reason && <div className={`mt-0.5 ${label}`}>{card.reason}</div>}
      {card.importClass ? (
        <>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className={label}>Import</dt>
            <dd className="first-letter:uppercase">{card.importTitle}{card.streaming ? ", in streaming" : ""}</dd>
            {card.folder && (
              <><dt className={label}>Folder</dt><dd className="break-all font-mono text-[13.5px]">{card.folder}</dd></>
            )}
            {card.pattern && (
              <><dt className={label}>Files</dt>
                <dd><span className="font-mono text-[13.5px]">{card.pattern}</span>:{" "}
                  <strong>{(card.count ?? 0).toLocaleString()}{card.capped ? "+" : ""}</strong> found</dd></>
            )}
            {card.values.map((value) => (
              <div key={value.name} className="contents">
                <dt className={label}>{value.label}</dt><dd>{value.value}</dd>
              </div>
            ))}
            {card.gainFile && (
              <><dt className={label}>Gain</dt><dd className="break-all font-mono text-[13.5px]">{card.gainFile}</dd></>
            )}
          </dl>
          {card.examples.length > 0 && (
            <div className={`mt-1.5 ${label}`}>
              e.g. <span className="break-all font-mono text-[13.5px]">{card.examples.join(", ")}</span>
            </div>
          )}
          <div className={`mt-2 ${label}`}>
            The import is added without launching it: its form opens for you to review{card.missing.length
              ? ` and fill in ${card.missing.join(", ")}` : card.folder ? "" : " and choose the files"}, then
            launch it.
          </div>
        </>
      ) : (
        <div className={`mt-1.5 ${label}`}>An empty project: it opens once made.</div>
      )}
      <CardEnd state={state} error={error} done="Made: opening it…" applyText="Make the project"
               onApply={apply} onCancel={() => setState("cancelled")} />
    </div>
  );
}

const fmt = (value: number | null | undefined, digits = 1) => value == null ? null : value.toFixed(digits);

/** Watching a project that processes in streaming: notices in the bell when something gets worse or stops. */
function WatchCard({ card }: { card: HelpWatchCard }) {
  const { state, setState, error, run } = useSimpleApply(card);
  const [until, setUntil] = useState("");
  const now = card.now;
  const figures = now ? [
    now.items != null ? `${now.items} ${now.unit ?? "movies"}` : null,
    fmt(now.resolution) && `CTF ${fmt(now.resolution)} Å`,
    fmt(now.totalDrift) && `drift ${fmt(now.totalDrift)} Å`,
    fmt(now.particles, 0) && `${fmt(now.particles, 0)} particles per micrograph`,
  ].filter(Boolean) : [];
  if (card.action === "unwatch") {
    return (
      <div className={CARD_BOX} data-testid="help-action">
        <div className={CARD_EYEBROW}>Needs your confirmation</div>
        <div className="mt-0.5 font-semibold">Stop watching {card.label}</div>
        {card.reason && <div className="mt-0.5 text-gray-600 dark:text-gray-400">{card.reason}</div>}
        <CardEnd state={state} error={error} done="I stopped watching it." applyText="Stop watching"
                 onCancel={() => setState("cancelled")}
                 onApply={() => void run(() => applyHelpAction({ action: "unwatch", projectId: card.projectId,
                                                                 protocolId: "" }))} />
      </div>
    );
  }
  return (
    <div className={CARD_BOX} data-testid="help-action">
      <div className={CARD_EYEBROW}>Needs your confirmation</div>
      <div className="mt-0.5 font-semibold">Watch {card.label} for {card.hours} h</div>
      {card.reason && <div className="mt-0.5 text-gray-600 dark:text-gray-400">{card.reason}</div>}
      {figures.length > 0 && <div className="mt-1.5">Now: {figures.join(" · ")}</div>}
      <div className="mt-1.5 font-medium">I tell you in the bell when there is:</div>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
        {(card.watched ?? []).map((item) => <li key={item}>{item}</li>)}
      </ul>
      <div className="mt-1.5 text-gray-600 dark:text-gray-400">
        I stop by myself when the session is over, or ask me to stop.
      </div>
      <CardEnd state={state} error={error} done={`Watching${until ? ` until ${new Date(until).toLocaleString()}` : ""}.`}
               applyText="Watch it" onCancel={() => setState("cancelled")}
               onApply={() => void run(async () => {
                 const result = await applyHelpAction({ action: "watch", projectId: card.projectId, protocolId: "",
                                                        hours: card.hours });
                 setUntil(result.until ?? "");
               })} />
    </div>
  );
}

/** A custom operation: what it does, what it reads, its script to check; added as a protocol and launched. */
function CustomCard({ card }: { card: HelpCustomCard }) {
  const { state, setState, error, run } = useSimpleApply(card);
  const [showScript, setShowScript] = useState(false);
  const [added, setAdded] = useState("");
  const label = "text-gray-600 dark:text-gray-400";
  const apply = () => void run(async () => {
    const result = await applyHelpAction({
      action: "custom", projectId: card.projectId, protocolId: "", name: card.title,
      fields: { operation: card.operation, script: card.script,
                inputs: card.inputs.map(({ protocolId, output }) => ({ protocolId, output })) } });
    if (result.newProtocolId) {
      setAdded(result.newProtocolId);
      requestFromHelpChat({ kind: "focusProtocol", projectId: card.projectId, protocolId: result.newProtocolId });
    }
  });
  return (
    <div className={CARD_BOX} data-testid="help-action">
      <div className={CARD_EYEBROW}>Needs your confirmation</div>
      <div className="mt-0.5 font-semibold">Custom operation “{card.title}”</div>
      {card.reason && <div className={`mt-0.5 ${label}`}>{card.reason}</div>}
      <div className="mt-2">{card.operation}</div>
      <div className={`mt-2 font-medium`}>{card.inputs.length === 1 ? "Input" : "Inputs, in this order"}</div>
      <ol className={`mt-0.5 space-y-0.5 ${card.inputs.length > 1 ? "list-decimal pl-5" : ""}`}>
        {card.inputs.map((item) => (
          <li key={`${item.protocolId}.${item.output}`}>
            <strong>#{item.protocolId}</strong> {item.protocolLabel} · {item.output}
            <span className={label}> ({item.type}{item.size != null ? `, ${item.size.toLocaleString()} items` : ""})</span>
          </li>
        ))}
      </ol>
      <button type="button" className="mt-2 text-[14px] font-medium text-blue-700 hover:underline dark:text-blue-300"
              aria-expanded={showScript} onClick={() => setShowScript((shown) => !shown)}>
        {showScript ? "Hide the script" : `Show the script (${card.lines} lines)`}
      </button>
      {showScript && (
        <pre className="mt-1.5 max-h-80 overflow-auto rounded-lg border border-gray-200 bg-white p-2.5 font-mono text-[13.5px] leading-snug text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
             data-testid="help-custom-script">{card.script}</pre>
      )}
      <div className={`mt-2 ${label}`}>
        It becomes a new protocol of the project with this script kept in it, and is launched. It runs on the
        server, writing only in its own folder. Check its result before using it.
      </div>
      <CardEnd state={state} error={error} done={added ? `Added as #${added} and launched.` : "Added and launched."}
               applyText="Add and launch" onApply={apply} onCancel={() => setState("cancelled")} />
    </div>
  );
}

function isTagCard(card: HelpActionCard): card is HelpTagCard {
  return card.action === "tag" || card.action === "untag";
}

/** A tag added by its name to protocols, or taken off them. */
function TagCard({ card }: { card: HelpTagCard }) {
  const readOnly = useContext(CardsReadOnly);
  const [state, setState] = useState<"open" | "applying" | "done" | "cancelled">("open");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState("");
  const remove = card.action === "untag";
  const toTag = card.protocols.filter((protocol) => (remove ? protocol.already : !protocol.already));

  const apply = async () => {
    setState("applying");
    setError(null);
    try {
      const result = await applyHelpAction({ action: card.action, projectId: card.projectId, protocolId: card.protocolId,
                                             tag: card.tag, protocolIds: toTag.map((protocol) => protocol.protocolId) });
      requestFromHelpChat({ kind: "refresh", projectId: card.projectId });
      const changed = (remove ? result.untagged : result.tagged) ?? [];
      const list = changed.map((id) => `#${id}`).join(", ");
      setDone(remove ? (changed.length === 0 ? "None of them had it." : `Tag taken off ${list}.`)
        : (changed.length === 0 ? "They already had it." : `Tag added to ${list}.`));
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The tag could not be added");
      setState("open");
    }
  };

  return (
    <div className={CARD_BOX} data-testid="help-action">
      <div className={CARD_EYEBROW}>Needs your confirmation</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-semibold">
        {remove ? "Take off the tag" : "Add the tag"}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-2.5 py-0.5 text-[14px] dark:border-gray-700 dark:bg-gray-900">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: card.color || "#9ca3af" }} aria-hidden="true" />
          {card.tag}
        </span>
      </div>
      {card.reason && <div className="mt-0.5 text-gray-600 dark:text-gray-400">{card.reason}</div>}
      {card.newTag && !remove && <div className="mt-2 text-gray-600 dark:text-gray-400">The project has no such tag yet: it is created.</div>}
      {remove && <div className="mt-2 text-gray-600 dark:text-gray-400">The tag stays in the project for other protocols.</div>}
      <ul className="mt-1.5 space-y-0.5">
        {card.protocols.map((protocol) => (
          <li key={protocol.protocolId}>
            <strong>#{protocol.protocolId}</strong> {protocol.label}
            {remove ? !protocol.already && <span className="text-gray-500 dark:text-gray-400"> · does not have it</span>
              : protocol.already && <span className="text-gray-500 dark:text-gray-400"> · already has it</span>}
          </li>
        ))}
      </ul>
      {error && <div className="mt-2 text-red-700 dark:text-red-300">{error}</div>}
      {readOnly ? <EarlierNote /> : state === "done" ? (
        <div className="mt-2 font-medium text-green-700 dark:text-green-300">{done}</div>
      ) : state === "cancelled" ? (
        <div className="mt-2 text-gray-500 dark:text-gray-400">Cancelled: nothing was done.</div>
      ) : (
        <CardButtons state={state} applyText={remove ? "Take it off" : "Add the tag"} onApply={() => void apply()}
                     onCancel={() => setState("cancelled")} disabled={toTag.length === 0} />
      )}
    </div>
  );
}

function ActionCard({ card }: { card: SimpleActionCard }) {
  const readOnly = useContext(CardsReadOnly);
  const [mode, setMode] = useState<HelpRelaunchMode>(card.action === "relaunch" ? card.mode : "restart");
  const [scope, setScope] = useState<"single" | "all" | null>(null);
  const [state, setState] = useState<"open" | "applying" | "done" | "cancelled">("open");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const [copyId, setCopyId] = useState<string | null>(null);
  const [launch, setLaunch] = useState(card.action === "duplicate" && Boolean(card.launch));
  const [started, setStarted] = useState(false);
  const danger = card.action === "delete";
  const confirmed = !danger || confirm.trim().replace(/^#/, "") === card.protocolId;
  const where = `#${card.protocolId}${card.label ? ` ${card.label}` : ""}`;
  const children = card.action === "relaunch" ? card.children : [];
  const needsScope = children.length > 0;
  const activeChildren = children.filter((child) => child.active);

  const apply = async () => {
    if (card.action === "next") {
      const shown = requestFromHelpChat({ kind: "openProtocolClass", projectId: card.projectId, className: card.nextClassName });
      if (!shown) {
        setError(`Open project ${card.projectId} to add it.`);
        return;
      }
      setState("done");
      return;
    }
    setState("applying");
    setError(null);
    try {
      const base = { projectId: card.projectId, protocolId: card.protocolId };
      const result = await applyHelpAction(card.action === "stop" ? { ...base, action: "stop" }
        : card.action === "delete" ? { ...base, action: "delete", confirm: confirm.trim() }
          : card.action === "duplicate"
            ? { ...base, action: "duplicate", launch,
                changes: Object.fromEntries(card.changes.map((change) => [change.name, change.to])) }
            : { ...base, action: "relaunch", mode, scope: scope ?? undefined,
                changes: Object.fromEntries(card.changes.map((change) => [change.name, change.to])) });
      requestFromHelpChat({ kind: "refresh", projectId: card.projectId });
      if (card.action === "duplicate" && result.newProtocolId) setCopyId(result.newProtocolId);
      setStarted(Boolean(result.started));
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The action could not be applied");
      setState("open");
    }
  };

  const openForm = () => {
    if (!requestFromHelpChat({ kind: "openProtocol", projectId: card.projectId, protocolId: card.protocolId })) {
      setError(`Open project ${card.projectId} to see its form.`);
    }
  };

  const title = card.action === "stop" ? `Stop ${where}`
    : card.action === "next" ? `Add ${card.nextLabel} after ${where}`
      : card.action === "duplicate" ? `Copy ${where}`
        : card.action === "delete" ? `Delete ${where}`
          : `${MODE_TEXT[mode].title} ${where}`;
  const doneText = card.action === "stop" ? "Stopping it."
    : card.action === "next" ? "Its form is open: choose the input and launch it."
      : card.action === "duplicate" ? `Copy${copyId ? ` #${copyId}` : ""} made${started ? " and launched" : ", not launched"}.`
        : card.action === "delete" ? "Deleted."
          : `${MODE_TEXT[mode].title} sent.`;
  const applyText = card.action === "next" ? "Open its form" : card.action === "delete" ? "Delete"
    : card.action === "duplicate" ? (launch ? "Copy and launch" : "Make the copy") : "Apply";

  return (
    <div className={`mt-2 rounded-xl border p-3 text-[14.5px] text-gray-900 dark:text-gray-100 ${danger
      ? "border-red-300 bg-red-50/70 dark:border-red-900 dark:bg-red-950/25"
      : "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20"}`}
         data-testid="help-action">
      <div className={`text-[13.5px] font-semibold uppercase tracking-wide ${danger
        ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`}>
        {danger ? "Cannot be undone" : "Needs your confirmation"}
      </div>
      <div className="mt-0.5 font-semibold">{title}</div>
      {card.reason && <div className="mt-0.5 text-gray-600 dark:text-gray-400">{card.reason}</div>}

      {card.action === "duplicate" && (
        <>
          <div className="mt-2 text-gray-600 dark:text-gray-400">
            A new protocol. The original and what depends on it stay as they are.
          </div>
          <LaunchChoice checked={launch} onChange={setLaunch} disabled={state !== "open" || readOnly}
                        text="Launch the copy when it is made" />
        </>
      )}

      {card.action === "delete" && (
        <div className="mt-2 space-y-1">
          <div>
            <strong>It is deleted with its folder and results.</strong> They cannot be recovered.
          </div>
          {card.outputs.length > 0 && (
            <ul className="list-disc pl-5">
              {card.outputs.map((output) => (
                <li key={output.name}>
                  {output.name}{output.size != null ? `: ${output.size.toLocaleString()} items` : ""}
                </li>
              ))}
            </ul>
          )}
          {card.children.length > 0 && (
            <div>
              Protocols that use it lose their input:{" "}
              {card.children.map((child) => `#${child.protocolId}`).join(", ")}.
            </div>
          )}
          <label className="mt-1.5 block">
            <span className="text-gray-700 dark:text-gray-300">Write <strong>{card.protocolId}</strong> to confirm</span>
            <input value={confirm} onChange={(event) => setConfirm(event.target.value)} disabled={state !== "open"}
                   aria-label={`Write ${card.protocolId} to confirm`} inputMode="numeric"
                   className="mt-1 block w-32 rounded-lg border border-red-300 bg-white px-2.5 py-1.5 text-[14.5px] outline-none focus:border-red-500 dark:border-red-800 dark:bg-gray-950" />
          </label>
        </div>
      )}

      {(card.action === "relaunch" || card.action === "duplicate") && card.changes.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {card.changes.map((change) => (
            <li key={change.name}>
              {change.label}: <span className="text-gray-500 line-through dark:text-gray-400">{valueText(change.from)}</span>
              {" → "}<strong>{valueText(change.to)}</strong>
            </li>
          ))}
        </ul>
      )}

      {card.action === "relaunch" && card.modes.length > 1 && (
        <fieldset className="mt-2 space-y-1" disabled={state !== "open"}>
          <legend className="sr-only">How to relaunch it</legend>
          {card.modes.map((value) => (
            <label key={value} className="flex items-start gap-2">
              <input type="radio" name={`mode-${card.protocolId}`} className="mt-1" checked={mode === value}
                     onChange={() => setMode(value)} />
              <span><strong>{MODE_TEXT[value].title}</strong>: {MODE_TEXT[value].note}</span>
            </label>
          ))}
        </fieldset>
      )}
      {card.action === "relaunch" && card.modes.length === 1 && (
        <div className="mt-2 text-gray-600 dark:text-gray-400">{MODE_TEXT[mode].title}: {MODE_TEXT[mode].note}.</div>
      )}

      {needsScope && (
        <fieldset className="mt-2 space-y-1" disabled={state !== "open"}>
          <legend className="font-medium">
            {children.length === 1 ? "1 protocol depends on it" : `${children.length} protocols depend on it`}:{" "}
            <span className="font-normal">{children.map((child) => `#${child.protocolId}`).join(", ")}</span>
          </legend>
          <label className="flex items-start gap-2">
            <input type="radio" name={`scope-${card.protocolId}`} className="mt-1" checked={scope === "single"}
                   onChange={() => setScope("single")} />
            <span><strong>Only this one</strong>: they are reset and lose their outputs, without running again</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name={`scope-${card.protocolId}`} className="mt-1" checked={scope === "all"}
                   onChange={() => setScope("all")} />
            <span><strong>The whole workflow</strong>: they run again after it</span>
          </label>
          {activeChildren.length > 0 && (
            <div className="text-amber-800 dark:text-amber-300">
              Running now: {activeChildren.map((child) => `#${child.protocolId}`).join(", ")}.
            </div>
          )}
        </fieldset>
      )}

      {error && <div className="mt-2 text-red-700 dark:text-red-300">{error}</div>}

      {readOnly ? <EarlierNote /> : state === "done" ? (
        <div className="mt-2 font-medium text-green-700 dark:text-green-300">{doneText}</div>
      ) : state === "cancelled" ? (
        <div className="mt-2 text-gray-500 dark:text-gray-400">Cancelled: nothing was done.</div>
      ) : (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" onClick={() => void apply()}
                  disabled={state === "applying" || (needsScope && scope === null) || !confirmed}
                  className={`rounded-full px-3.5 py-1.5 text-[14px] font-medium text-white disabled:opacity-50 ${danger
                    ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}>
            {state === "applying" ? "Applying…" : applyText}
          </button>
          {card.action === "relaunch" && (
            <button type="button" onClick={openForm} disabled={state === "applying"}
                    className="rounded-full border border-blue-300 px-3.5 py-1.5 text-[14px] font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/40">
              Open in the form
            </button>
          )}
          <button type="button" onClick={() => setState("cancelled")} disabled={state === "applying"}
                  className="rounded-full px-3.5 py-1.5 text-[14px] font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

/** The templates the user may start from a protocol's output: one click asks the assistant for its card. */
function TemplateOptions({ card, onAsk }: { card: HelpTemplateOptions; onAsk: (question: string) => void }) {
  return (
    <div className="mt-2 space-y-1.5">
      {card.items.map((item) => (
        <div key={item.id} className="rounded-lg border border-gray-200 px-2.5 py-2 dark:border-gray-700">
          <div className="flex items-start gap-2">
            <Workflow className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-gray-900 dark:text-gray-100">{item.name}</div>
              <div className="text-[13.5px] text-gray-500 dark:text-gray-400">
                Adds {item.adds === 1 ? "1 protocol" : `${item.adds} protocols`}
                {item.keySteps.length > 0 && ` · ${item.keySteps.join(", ")}`}
              </div>
            </div>
            <button type="button"
                    onClick={() => onAsk(`Apply the template "${item.name}" (${item.id}) from protocol #${card.fromProtocolId}${card.fromOutput ? ` (${card.fromOutput})` : ""}`)}
                    className="shrink-0 rounded-full border border-blue-300 px-3 py-1 text-[13.5px] font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/40">
              Use this one
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The processing report, to download: the PDF (written on the server, with the methods) and the workflow file. */
function ReportCard({ card }: { card: HelpReportCard }) {
  const [busy, setBusy] = useState<"" | "pdf" | "workflow">("");
  const [error, setError] = useState<string | null>(null);

  const download = async (format: "pdf" | "workflow") => {
    setBusy(format);
    setError(null);
    try {
      const { blob, filename } = await downloadReport({ projectId: card.projectId, format,
                                                        ...(card.protocolId ? { protocolId: card.protocolId } : {}) });
      saveFile(blob, filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The report could not be made");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-[14.5px] dark:border-gray-700 dark:bg-gray-800/60"
         data-testid="help-report">
      <div className="flex items-center gap-1.5 font-semibold text-gray-900 dark:text-gray-100">
        <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
        Processing report of {card.project}{card.protocolId ? ` up to #${card.protocolId}` : ""}
      </div>
      <div className="mt-0.5 text-gray-600 dark:text-gray-400">
        {card.protocols === 1 ? "1 protocol" : `${card.protocols} protocols`}: programs and versions, every
        parameter, outputs and runs, and a methods text. The workflow file runs them again with the same parameters.
      </div>
      {error && <div className="mt-1.5 text-red-700 dark:text-red-300">{error}</div>}
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button type="button" onClick={() => void download("pdf")} disabled={busy !== ""} className={PRIMARY_BUTTON}>
          {busy === "pdf" ? "Writing the PDF…" : "Download PDF"}
        </button>
        <button type="button" onClick={() => void download("workflow")} disabled={busy !== ""}
                className="rounded-full border border-blue-300 px-3.5 py-1.5 text-[14px] font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/40">
          {busy === "workflow" ? "Exporting…" : "Download workflow file"}
        </button>
      </div>
    </div>
  );
}

/** What the assistant looked at to answer: hidden until asked. */
const STAGE_STATE: Record<HelpTutorialState, { label: string; icon: typeof Circle; className: string }> = {
  done: { label: "Done", icon: CheckCircle2, className: "text-green-600 dark:text-green-400" },
  running: { label: "Running", icon: Loader2, className: "animate-spin text-sky-600 dark:text-sky-400" },
  waiting: { label: "Waiting for you", icon: Hand, className: "text-amber-600 dark:text-amber-400" },
  failed: { label: "Failed", icon: XCircle, className: "text-red-600 dark:text-red-400" },
  prepared: { label: "Added, not launched", icon: CircleDashed, className: "text-blue-600 dark:text-blue-400" },
  skipped: { label: "Not needed", icon: CircleMinus, className: "text-gray-400 dark:text-gray-500" },
  pending: { label: "To do", icon: Circle, className: "text-gray-300 dark:text-gray-600" },
};

/** A protocol the assistant found: the graph centres on it when the answer comes (if that project is open), and
 * the button does it again, or opens the project there. */
function FocusCard({ card }: { card: HelpFocusCard }) {
  const latest = useContext(LatestAnswer);
  const readOnly = useContext(CardsReadOnly);
  const shownRef = useRef(false);
  useEffect(() => {
    if (shownRef.current || !latest || readOnly) return;
    shownRef.current = true;
    requestFromHelpChat({ kind: "focusProtocol", projectId: card.projectId, protocolId: card.protocolId });
  }, [latest, readOnly, card.projectId, card.protocolId]);
  const show = () => {
    if (!requestFromHelpChat({ kind: "focusProtocol", projectId: card.projectId, protocolId: card.protocolId })) {
      window.location.assign(`/project/load/${encodeURIComponent(String(card.projectId))}?protocol=${
        encodeURIComponent(card.protocolId)}`);
    }
  };
  return (
    <button type="button" onClick={show}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-blue-300 px-3 py-1.5 text-[14px] font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/40">
      <LocateFixed className="h-4 w-4" aria-hidden="true" />
      Show #{card.protocolId}{card.label ? ` ${card.label}` : ""} in the graph
    </button>
  );
}

/** Where the project is on the usual road of a processing, under each answer of the tutor. */
function TutorialCard({ card }: { card: HelpTutorialCard }) {
  const latest = useContext(LatestAnswer);
  const [open, setOpen] = useState(latest);
  // Folded once a newer answer shows the progress again
  useEffect(() => { if (!latest) setOpen(false); }, [latest]);
  const done =card.stages.filter((stage) => stage.state === "done" || stage.state === "skipped").length;
  const current = card.stages.find((stage) => stage.key === card.current);
  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950/40"
         data-testid="help-tutorial">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <GraduationCap className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-gray-900 dark:text-gray-100">
            {card.title} · {done} of {card.stages.length} steps
          </span>
          {current && !open && (
            <span className="block truncate text-[13.5px] text-gray-500 dark:text-gray-400">Now: {current.title}</span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
                     aria-hidden="true" />
      </button>
      {open && (
        <ol className="space-y-0.5 px-2 pb-2">
          {card.stages.map((stage) => {
            const state = STAGE_STATE[stage.state] ?? STAGE_STATE.pending;
            const Icon = state.icon;
            const isCurrent = stage.key === card.current;
            const last = stage.protocols[stage.protocols.length - 1];
            return (
              <li key={stage.key} className={`flex items-start gap-2 rounded-lg px-2 py-1.5 ${isCurrent
                ? "bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:ring-blue-900" : ""}`}>
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${state.className}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className={`block text-[14px] ${stage.state === "pending" || stage.state === "skipped"
                    ? "text-gray-500 dark:text-gray-400" : "text-gray-900 dark:text-gray-100"} ${isCurrent ? "font-semibold" : ""}`}>
                    {stage.title}
                  </span>
                  <span className="block text-[13.5px] text-gray-500 dark:text-gray-400">
                    {state.label}{stage.items ? ` · ${stage.items.toLocaleString()} items` : ""}
                    {last && (
                      <>
                        {" · "}
                        <button type="button" title={last.label} className={LINK_BUTTON}
                                onClick={() => requestFromHelpChat({ kind: "openProtocol", projectId: card.projectId,
                                                                     protocolId: last.id })}>
                          #{last.id}
                        </button>
                      </>
                    )}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function Steps({ steps }: { steps: string[] }) {
  const [open, setOpen] = useState(false);
  if (steps.length === 0) return null;
  return (
    <div className="mt-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}
              className="inline-flex items-center gap-1 text-[13.5px] text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        {steps.length === 1 ? "Looked at 1 thing" : `Looked at ${steps.length} things`}
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 pl-5 text-[13.5px] text-gray-500 dark:text-gray-400">
          {steps.map((step, index) => <li key={index} className="list-disc">{step}</li>)}
        </ul>
      )}
    </div>
  );
}

function Answer({ answer, onAsk, earlier = false }: { answer: HelpAnswer; onAsk: (question: string) => void;
                                                     earlier?: boolean }) {
  return (
    <CardsReadOnly.Provider value={earlier}>
      <AnswerBody answer={answer} onAsk={onAsk} />
    </CardsReadOnly.Provider>
  );
}

function AnswerBody({ answer, onAsk }: { answer: HelpAnswer; onAsk: (question: string) => void }) {
  if (answer.assistant) {
    const found = answer.cards.filter(isSearchCard);
    return (
      <HelpBubble>
        {renderChatMarkdown(answer.text)}
        {found.length > 0 && (
          <>
            <div className="mb-1.5 mt-3 text-[13.5px] font-medium text-gray-500 dark:text-gray-400">From the help</div>
            <div className="space-y-1.5">
              {found.map((card, index) => <RelatedResult key={index} card={card} />)}
            </div>
          </>
        )}
        {answer.cards.map((card, index) => card.kind === "tutorial"
          ? <TutorialCard key={`u${index}`} card={card} /> : null)}
        {answer.cards.map((card, index) => card.kind === "templates"
          ? <TemplateOptions key={`t${index}`} card={card} onAsk={onAsk} /> : null)}
        {answer.cards.map((card, index) => card.kind === "report" ? <ReportCard key={`r${index}`} card={card} /> : null)}
        {answer.cards.map((card, index) => card.kind === "comparison"
          ? <ComparisonCard key={`c${index}`} card={card} /> : null)}
        {answer.cards.map((card, index) => card.kind === "focus" ? <FocusCard key={`f${index}`} card={card} /> : null)}
        {answer.cards.map((card, index) => card.kind !== "action" ? null
          : card.action === "template" ? <TemplateCard key={index} card={card} />
            : card.action === "continue" ? <ContinueCard key={index} card={card} />
            : card.action === "subset" ? <SubsetCard key={index} card={card} />
            : isSubworkflowCard(card) ? <SubworkflowCard key={index} card={card} />
            : isTagCard(card) ? <TagCard key={index} card={card} />
            : card.action === "rename" ? <RenameCard key={index} card={card as HelpRenameCard} />
            : card.action === "schedule" ? <ScheduleCard key={index} card={card as HelpScheduleCard} />
            : card.action === "stopmany" || card.action === "relaunchmany"
              ? <ManyCard key={index} card={card as HelpManyCard} />
            : card.action === "newproject" ? <NewProjectCard key={index} card={card as HelpNewProjectCard} />
            : card.action === "watch" || card.action === "unwatch"
              ? <WatchCard key={index} card={card as HelpWatchCard} />
            : card.action === "custom" ? <CustomCard key={index} card={card as HelpCustomCard} />
              : <ActionCard key={index} card={card as SimpleActionCard} />)}
        <Steps steps={answer.steps ?? []} />
      </HelpBubble>
    );
  }
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
  // Whether the questions go to the AI assistant (asked each time the chat opens: an admin may turn it on or off)
  const [status, setStatus] = useState<HelpChatStatus>({ assistant: false });
  const ai = status.assistant;
  // The conversation kept on the server that the questions go on (null: the next question starts one)
  const [conversationId, setConversationId] = useState<number | null>(null);
  // "tutor": the assistant guides the user step by step (kept with the conversation)
  const [mode, setMode] = useState<HelpChatMode | null>(null);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [history, setHistory] = useState<HelpConversationSummary[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const restored = useRef(false);

  const keep = useCallback((id: number | null) => {
    setConversationId(id);
    storeConversation(id);
  }, []);

  const openConversation = useCallback(async (id: number) => {
    const loaded = await getConversation(id);
    setMessages(loaded.messages.map((message): Message => message.role === "user"
      ? { id: nextId.current++, from: "user", text: message.text }
      : { id: nextId.current++, from: "help", answer: message.answer ?? { text: message.text, cards: [] },
          earlier: true }));
    setMode(loaded.mode || null);
    keep(loaded.id);
    setView("chat");
  }, [keep]);

  // The first time it opens, back to the conversation open before a reload
  useEffect(() => {
    if (!open || restored.current) return;
    restored.current = true;
    const id = storedConversation();
    if (id && messages.length === 0) openConversation(id).catch(() => keep(null));
  }, [open, messages.length, openConversation, keep]);

  const showHistory = useCallback(() => {
    setView("history");
    setHistoryError(null);
    listConversations().then((loaded) => setHistory(loaded.conversations))
      .catch((error: unknown) => setHistoryError(error instanceof Error ? error.message : "Could not list them"));
  }, []);

  const startAgain = useCallback(() => {
    setMessages([]);
    setMode(null);
    keep(null);
    setView("chat");
  }, [keep]);

  const removeConversation = useCallback(async (id: number) => {
    try {
      await deleteConversation(id);
      setHistory((list) => (list ?? []).filter((item) => item.id !== id));
      if (id === conversationId) {
        setMessages([]);
        setMode(null);
        keep(null);
      }
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Could not delete it");
    }
  }, [conversationId, keep]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    getHelpChatStatus().then((loaded) => { if (alive) setStatus(loaded); }).catch(() => undefined);
    return () => { alive = false; };
  }, [open]);

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

  const ask = useCallback((question: string, askedMode: HelpChatMode | null = mode) => {
    const text = question.trim();
    if (!text || busy) return;
    if (askedMode !== mode) setMode(askedMode);
    const askedId = nextId.current++;
    const answerId = nextId.current++;
    const history: HelpTurn[] = messages.flatMap((message): HelpTurn[] => message.from === "user"
      ? [{ role: "user", text: message.text }]
      : message.answer ? [{ role: "assistant", text: message.answer.text }] : []).slice(-HISTORY_TURNS);
    setMessages((list) => [...list, { id: askedId, from: "user", text }, { id: answerId, from: "help", waiting: true }]);
    setDraft("");
    const where = { projectId: focus.projectId, protocolId: focus.protocolId };
    (askedMode ? askHelp(text, where, history, conversationId, askedMode) : askHelp(text, where, history, conversationId))
      .then((answer) => {
        if (answer.mode) setMode(answer.mode);
        if (answer.left !== undefined) setStatus((current) => ({ ...current, left: answer.left }));
        if (answer.conversationId) keep(answer.conversationId);
        setMessages((list) => list.map((message) => message.id === answerId
          ? { id: answerId, from: "help", answer } : message));
      })
      .catch((error: unknown) => setMessages((list) => list.map((message) => message.id === answerId
        ? { id: answerId, from: "help", error: error instanceof Error ? error.message : "The help could not answer" }
        : message)));
  }, [busy, focus.projectId, focus.protocolId, messages, conversationId, keep, mode]);
  const askQuick = useCallback((question: string) => ask(question), [ask]);

  const tutor = mode === "tutor";
  const shortcuts: string[] = [];
  if (tutor) shortcuts.push("What do I do now?", "Is the result fine?", "Explain it more simply");
  else {
    if (focus.protocolId) shortcuts.push("Why did it fail?", "What comes next?");
    if (focus.projectId) shortcuts.push("How is the project going?");
  }
  const lastAnswerId = [...messages].reverse().find((message) => message.from === "help")?.id;
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
          {/* The header of the web's dialogs and forms (DialogFrame) */}
          <header className="flex items-center gap-3 bg-[#333d49] px-4 py-3.5 text-white">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10">
              <img src={LOGO_WHITE} alt="" aria-hidden="true" className="h-6 w-6 object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[16px] font-semibold">
                Help assistant
                {ai && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[13.5px] font-medium"
                        title={status.left !== undefined ? `${status.left} questions left today` : undefined}>
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> AI
                  </span>
                )}
                {tutor && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[13.5px] font-medium"
                        title="The assistant guides you step by step">
                    <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" /> Tutor
                  </span>
                )}
              </div>
              <div className="truncate text-[14px] text-gray-200">
                {focus.projectId
                  ? <>{focus.projectName || `Project ${focus.projectId}`}{focus.protocolId
                    ? ` · #${focus.protocolId}${focus.protocolLabel ? ` ${focus.protocolLabel}` : ""}` : ""}</>
                  : ai ? "Answers with AI" : "Answers from the web's own help"}
              </div>
            </div>
            <button type="button" aria-label="Earlier conversations" title="Earlier conversations"
                    aria-pressed={view === "history"} onClick={() => (view === "history" ? setView("chat") : showHistory())}
                    className={`rounded-full p-2 text-gray-200 hover:bg-white/10 ${view === "history" ? "bg-white/15" : ""}`}>
              <History className="h-[18px] w-[18px]" />
            </button>
            {messages.length > 0 && (
              <button type="button" aria-label="New conversation" title="New conversation" onClick={startAgain}
                      className="rounded-full p-2 text-gray-200 hover:bg-white/10">
                <RotateCcw className="h-[18px] w-[18px]" />
              </button>
            )}
            <button type="button" aria-label="Close the help" title="Close" onClick={() => setOpen(false)}
                    className="rounded-full p-2 text-gray-200 hover:bg-white/10">
              <X className="h-5 w-5" />
            </button>
          </header>

          {view === "history" ? (
            <div className="flex-1 overflow-y-auto px-3.5 py-4" data-testid="help-history">
              <div className="mb-2 text-[15px] font-semibold text-gray-900 dark:text-gray-100">Earlier conversations</div>
              {historyError && <div className="text-[14.5px] text-red-700 dark:text-red-300">{historyError}</div>}
              {history === null && !historyError && <div className="text-[14.5px] text-gray-500">Loading…</div>}
              {history?.length === 0 && (
                <div className="text-[14.5px] text-gray-500 dark:text-gray-400">No conversations yet.</div>
              )}
              <ul className="space-y-1.5">
                {history?.map((item) => (
                  <li key={item.id} className={`flex items-start gap-1 rounded-lg border bg-white dark:bg-gray-900 ${item.id === conversationId
                    ? "border-blue-400 dark:border-blue-700" : "border-gray-200 dark:border-gray-800"}`}>
                    <button type="button" onClick={() => void openConversation(item.id).catch((error: unknown) =>
                              setHistoryError(error instanceof Error ? error.message : "Could not open it"))}
                            className="min-w-0 flex-1 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60">
                      <span className="flex items-center gap-1.5 text-[14.5px] font-medium text-gray-900 dark:text-gray-100">
                        {item.mode === "tutor" && (
                          <GraduationCap className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-label="Tutor" />
                        )}
                        <span className="truncate">{item.title || "Untitled"}</span>
                      </span>
                      <span className="block truncate text-[13.5px] text-gray-500 dark:text-gray-400">
                        {new Date(item.updatedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {item.project ? ` · ${item.project}` : ""} · {Math.ceil(item.messages / 2)} question{item.messages > 2 ? "s" : ""}
                      </span>
                    </button>
                    <button type="button" aria-label={`Delete ${item.title || "the conversation"}`} title="Delete"
                            onClick={() => void removeConversation(item.id)}
                            className="m-1.5 rounded-full p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
          <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-3.5 py-4">
            {ai ? (
              <HelpBubble>
                <p>Hi! I can look at your projects to answer: why a protocol failed, what it produced, which protocol
                  or parameter to use.</p>
                <p className="mt-1.5 text-gray-600 dark:text-gray-400">
                  I never change anything without your confirmation. Write in any language.
                  {status.left !== undefined && ` ${status.left} question${status.left === 1 ? "" : "s"} left today.`}
                </p>
              </HelpBubble>
            ) : (
              <HelpBubble>
                <p>Hi! I can help you with steps, parameters, protocols that failed and what to run next.</p>
                <p className="mt-1.5 text-gray-600 dark:text-gray-400">Write your question in English or Spanish.</p>
              </HelpBubble>
            )}
            {messages.length === 0 && ai && (
              <div className="pl-10">
                <button type="button" disabled={busy} onClick={() => ask(TUTOR_START, "tutor")}
                        className="flex w-full items-center gap-3 rounded-xl border border-blue-200 bg-white px-3.5 py-2.5 text-left hover:bg-blue-50 disabled:opacity-50 dark:border-blue-900 dark:bg-gray-900 dark:hover:bg-blue-950/40">
                  <GraduationCap className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                  <span>
                    <span className="block text-[15px] font-semibold text-blue-700 dark:text-blue-300">Guide me step by step</span>
                    <span className="block text-[13.5px] text-gray-500 dark:text-gray-400">
                      New to processing? I follow your project and tell you what to do next, and why.
                    </span>
                  </span>
                </button>
              </div>
            )}
            {messages.length === 0 && (
              <QuickReplies items={[...shortcuts, ...EXAMPLES]} disabled={busy} onAsk={askQuick} />
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
              if (message.waiting) return <Typing key={message.id} label={ai ? "Thinking" : "Looking in the help"} />;
              if (message.error) return <HelpBubble key={message.id} tone="error">{message.error}</HelpBubble>;
              return message.answer ? (
                <LatestAnswer.Provider key={message.id} value={message.id === lastAnswerId}>
                  <Answer answer={message.answer} onAsk={askQuick} earlier={message.earlier} />
                </LatestAnswer.Provider>
              ) : null;
            })}
            {lastIsAnswer && <QuickReplies items={shortcuts} disabled={busy} onAsk={askQuick} />}
          </div>
          )}

          <footer className="border-t border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
            <form className="flex items-end gap-2 rounded-3xl border border-gray-300 bg-white py-1.5 pl-4 pr-1.5 focus-within:border-blue-500 dark:border-gray-700 dark:bg-gray-950"
                  onSubmit={(event) => { event.preventDefault(); ask(draft); }}>
              <textarea ref={inputRef} rows={1} value={draft} maxLength={ai ? 2000 : 500} placeholder="Write your question…"
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
