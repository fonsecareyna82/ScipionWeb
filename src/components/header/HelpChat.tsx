import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, ChevronDown, FileText, CircleAlert, ExternalLink, MessageCircleQuestionMark, RotateCcw, SendHorizontal,
  SlidersHorizontal, Sparkles, Workflow, X } from "lucide-react";

import {
  applyHelpAction, askHelp, downloadReport, getHelpChatStatus, type HelpActionCard, type HelpAnswer, type HelpCard, type HelpChatStatus,
  type HelpComparisonCard, type HelpLogPlace, type HelpRelaunchMode, type HelpReportCard, type HelpSubsetCard,
  type HelpSubsetCondition, type HelpTemplateCard, type HelpTemplateOptions,
  type HelpTurn,
} from "@/api/helpChat";
import { requestFromHelpChat } from "@/utils/help_chat_actions";
import { renderChatMarkdown } from "@/utils/chat_markdown";
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
type SimpleActionCard = Exclude<HelpActionCard, { action: "template" | "continue" | "subset" }>;

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
      {state === "done" ? (
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
      {state === "done" ? (
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
      {state === "done" ? (
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

function ActionCard({ card }: { card: SimpleActionCard }) {
  const [mode, setMode] = useState<HelpRelaunchMode>(card.action === "relaunch" ? card.mode : "restart");
  const [scope, setScope] = useState<"single" | "all" | null>(null);
  const [state, setState] = useState<"open" | "applying" | "done" | "cancelled">("open");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const [copyId, setCopyId] = useState<string | null>(null);
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
            ? { ...base, action: "duplicate",
                changes: Object.fromEntries(card.changes.map((change) => [change.name, change.to])) }
            : { ...base, action: "relaunch", mode, scope: scope ?? undefined,
                changes: Object.fromEntries(card.changes.map((change) => [change.name, change.to])) });
      requestFromHelpChat({ kind: "refresh", projectId: card.projectId });
      if (card.action === "duplicate" && result.newProtocolId) setCopyId(result.newProtocolId);
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
      : card.action === "duplicate" ? `Copy${copyId ? ` #${copyId}` : ""} made, not launched.`
        : card.action === "delete" ? "Deleted."
          : `${MODE_TEXT[mode].title} sent.`;
  const applyText = card.action === "next" ? "Open its form" : card.action === "delete" ? "Delete"
    : card.action === "duplicate" ? "Make the copy" : "Apply";

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
        <div className="mt-2 text-gray-600 dark:text-gray-400">
          A new protocol, not launched. The original and what depends on it stay as they are.
        </div>
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

      {state === "done" ? (
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

function Answer({ answer, onAsk }: { answer: HelpAnswer; onAsk: (question: string) => void }) {
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
        {answer.cards.map((card, index) => card.kind === "templates"
          ? <TemplateOptions key={`t${index}`} card={card} onAsk={onAsk} /> : null)}
        {answer.cards.map((card, index) => card.kind === "report" ? <ReportCard key={`r${index}`} card={card} /> : null)}
        {answer.cards.map((card, index) => card.kind === "comparison"
          ? <ComparisonCard key={`c${index}`} card={card} /> : null)}
        {answer.cards.map((card, index) => card.kind !== "action" ? null
          : card.action === "template" ? <TemplateCard key={index} card={card} />
            : card.action === "continue" ? <ContinueCard key={index} card={card} />
            : card.action === "subset" ? <SubsetCard key={index} card={card} />
              : <ActionCard key={index} card={card} />)}
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

  const ask = useCallback((question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    const askedId = nextId.current++;
    const answerId = nextId.current++;
    const history: HelpTurn[] = messages.flatMap((message): HelpTurn[] => message.from === "user"
      ? [{ role: "user", text: message.text }]
      : message.answer ? [{ role: "assistant", text: message.answer.text }] : []).slice(-HISTORY_TURNS);
    setMessages((list) => [...list, { id: askedId, from: "user", text }, { id: answerId, from: "help", waiting: true }]);
    setDraft("");
    askHelp(text, { projectId: focus.projectId, protocolId: focus.protocolId }, history)
      .then((answer) => {
        if (answer.left !== undefined) setStatus((current) => ({ ...current, left: answer.left }));
        setMessages((list) => list.map((message) => message.id === answerId
          ? { id: answerId, from: "help", answer } : message));
      })
      .catch((error: unknown) => setMessages((list) => list.map((message) => message.id === answerId
        ? { id: answerId, from: "help", error: error instanceof Error ? error.message : "The help could not answer" }
        : message)));
  }, [busy, focus.projectId, focus.protocolId, messages]);

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
              </div>
              <div className="truncate text-[14px] text-gray-200">
                {focus.projectId
                  ? <>{focus.projectName || `Project ${focus.projectId}`}{focus.protocolId
                    ? ` · #${focus.protocolId}${focus.protocolLabel ? ` ${focus.protocolLabel}` : ""}` : ""}</>
                  : ai ? "Answers with AI" : "Answers from the web's own help"}
              </div>
            </div>
            {messages.length > 0 && (
              <button type="button" aria-label="Start again" title="Start again" onClick={() => setMessages([])}
                      className="rounded-full p-2 text-gray-200 hover:bg-white/10">
                <RotateCcw className="h-[18px] w-[18px]" />
              </button>
            )}
            <button type="button" aria-label="Close the help" title="Close" onClick={() => setOpen(false)}
                    className="rounded-full p-2 text-gray-200 hover:bg-white/10">
              <X className="h-5 w-5" />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-3.5 py-4">
            {ai ? (
              <HelpBubble>
                <p>Hi! I can look at your projects to answer: why a protocol failed, what it produced, which protocol
                  or parameter to use.</p>
                <p className="mt-1.5 text-gray-600 dark:text-gray-400">
                  I only read: I cannot launch, change or delete anything. Write in any language.
                  {status.left !== undefined && ` ${status.left} question${status.left === 1 ? "" : "s"} left today.`}
                </p>
              </HelpBubble>
            ) : (
              <HelpBubble>
                <p>Hi! I can help you with steps, parameters, protocols that failed and what to run next.</p>
                <p className="mt-1.5 text-gray-600 dark:text-gray-400">Write your question in English or Spanish.</p>
              </HelpBubble>
            )}
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
              if (message.waiting) return <Typing key={message.id} label={ai ? "Thinking" : "Looking in the help"} />;
              if (message.error) return <HelpBubble key={message.id} tone="error">{message.error}</HelpBubble>;
              return message.answer ? <Answer key={message.id} answer={message.answer} onAsk={ask} /> : null;
            })}
            {lastIsAnswer && <QuickReplies items={shortcuts} disabled={busy} onAsk={ask} />}
          </div>

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
