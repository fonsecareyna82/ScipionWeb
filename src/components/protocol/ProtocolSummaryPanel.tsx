import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CircleAlert, FileText, MessageSquare, TriangleAlert } from "lucide-react";

import { useProjectService } from "@/ProjectServiceContext";
import AnalyzeOutputDialog from "@/components/analyze/analyze-output-dialog";
import type { ProtocolSummary, ProtocolSummaryObject } from "@/services/ProjectService";

type ProtocolSummaryPanelProps = {
  projectId: number | string | null | undefined;
  protocolId: number | string | null | undefined;
  protocolLabel?: string;
  /** A new status reads the summary again; while the protocol is live it is read every few seconds. */
  protocolStatus?: string | null;
};

// A live protocol's summary grows (items imported, classes made…); a finished one does not change
export const SUMMARY_POLL_MS = 10000;
const LIVE_STATUSES = new Set(["running", "launched", "scheduled"]);

// Scipion's markup (pyworkflow.utils PATTERN_ALL): *bold*, _italic_, [[link][label]], URLs, '''fixed'''.
// Bold and italic start a line or follow a space, which they keep.
const MARKUP = new RegExp(
  [
    String.raw`(^|\s)\*(?<bold>[^\s*][^*]*[^\s*]|[^\s*])\*`,
    String.raw`(^|\s)_(?<italic>[^\s_][^_]*[^\s_]|[^\s_])_`,
    String.raw`\[\[(?<link2>[^\s][^\]]+[^\s])\]\[(?<link2label>[^\s][^\]]+[^\s])\]\]`,
    String.raw`(?<link1>https?://(?:[a-zA-Z]|[0-9]|[$-_@.&+#]|[!*(),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+)`,
    String.raw`'''(?<fixed>.*?)'''`,
  ].join("|"),
  "g",
);

export type SummaryPiece =
  | { kind: "text" | "bold" | "italic" | "fixed"; text: string }
  | { kind: "url"; text: string; href: string }
  | { kind: "object"; text: string; objectId: string }
  | { kind: "path"; text: string; path: string };

/** A summary line in pieces, as the desktop's TaggedText draws it. */
export function parseSummaryLine(line: string): SummaryPiece[] {
  const pieces: SummaryPiece[] = [];
  let last = 0;
  const pushText = (text: string) => {
    if (text) pieces.push({ kind: "text", text });
  };
  for (const match of line.matchAll(MARKUP)) {
    const groups = match.groups ?? {};
    const start = match.index ?? 0;
    pushText(line.slice(last, start));
    // The space before bold or italic stays as text
    const leading = groups.bold !== undefined || groups.italic !== undefined ? match[1] || match[3] || "" : "";
    pushText(leading);
    if (groups.bold !== undefined) pieces.push({ kind: "bold", text: groups.bold });
    else if (groups.italic !== undefined) pieces.push({ kind: "italic", text: groups.italic });
    else if (groups.fixed !== undefined) pieces.push({ kind: "fixed", text: groups.fixed });
    else if (groups.link1 !== undefined) pieces.push({ kind: "url", text: groups.link1, href: groups.link1 });
    else if (groups.link2 !== undefined) {
      const target = groups.link2;
      const label = groups.link2label ?? target;
      if (target.startsWith("sci-open:")) pieces.push({ kind: "object", text: label, objectId: target.slice(9) });
      else if (/^(https?:|mailto:)/.test(target)) pieces.push({ kind: "url", text: label, href: target });
      else pieces.push({ kind: "path", text: label, path: target });
    }
    last = start + match[0].length;
  }
  pushText(line.slice(last));
  return pieces;
}

export type SummaryRow = { kind: "fact"; label: string; value: string } | { kind: "line"; text: string };
export type SummaryBlock = { kind: "main" | "comments" | "error" | "warnings"; rows: SummaryRow[] };

// "Sampling rate: *1.91* Å/px", "patch_size = *32*": a short label, then a value after a space
const FACT = /^\s*([^:=*[\]]{1,48}?)\s*(?::|\s=)\s+(\S.*)$/;
const SECTIONS: Record<string, SummaryBlock["kind"]> = {
  "*COMMENTS:*": "comments", "*ERROR:*": "error", "*WARNINGS:*": "warnings",
};

/** The summary as the blocks it is made of: the plugin's lines, then comments, error and warnings. */
export function buildSummaryBlocks(lines: string[]): SummaryBlock[] {
  const blocks: SummaryBlock[] = [{ kind: "main", rows: [] }];
  for (const text of lines.flatMap((line) => line.split("\n"))) {
    const section = SECTIONS[text.trim()];
    if (section) {
      blocks.push({ kind: section, rows: [] });
      continue;
    }
    if (!text.trim()) continue;
    const current = blocks[blocks.length - 1];
    const fact = current.kind === "main" ? FACT.exec(text) : null;
    current.rows.push(fact ? { kind: "fact", label: fact[1].trim(), value: fact[2] } : { kind: "line", text: text.trim() });
  }
  return blocks.filter((block) => block.rows.length > 0);
}

const CALLOUTS = {
  comments: { title: "Comments", Icon: MessageSquare,
              box: "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40",
              head: "text-slate-600 dark:text-slate-300" },
  error: { title: "Error", Icon: CircleAlert,
           box: "border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30",
           head: "text-red-700 dark:text-red-300" },
  warnings: { title: "Warnings", Icon: TriangleAlert,
              box: "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30",
              head: "text-amber-700 dark:text-amber-300" },
} as const;

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function ProtocolSummaryPanel({
  projectId,
  protocolId,
  protocolLabel = "",
  protocolStatus,
}: ProtocolSummaryPanelProps) {
  const svc = useProjectService();
  const [summary, setSummary] = useState<ProtocolSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [opened, setOpened] = useState<ProtocolSummaryObject | null>(null);
  const ready = projectId != null && protocolId != null && String(protocolId) !== "";
  const live = LIVE_STATUSES.has(String(protocolStatus ?? "").toLowerCase());
  const inFlight = useRef(false);
  const scope = useRef("");

  const read = useCallback(async () => {
    if (!ready || !svc.fetchProtocolSummary || inFlight.current) return;
    const asked = `${projectId}:${protocolId}`;
    inFlight.current = true;
    setLoading(true);
    try {
      const value = await svc.fetchProtocolSummary(projectId!, protocolId!);
      if (scope.current !== asked) return;
      setSummary(value);
      setError(null);
      setUpdatedAt(new Date());
    } catch (reason: any) {
      if (scope.current === asked) setError(String(reason?.message || "The summary could not be read"));
    } finally {
      inFlight.current = false;
      if (scope.current === asked) setLoading(false);
    }
  }, [svc, ready, projectId, protocolId]);

  // Another protocol starts from nothing
  useEffect(() => {
    scope.current = `${projectId}:${protocolId}`;
    inFlight.current = false;
    setSummary(null);
    setError(null);
    setUpdatedAt(null);
  }, [projectId, protocolId]);

  useEffect(() => {
    void read();
  }, [read, protocolStatus]);

  // While the protocol is live, and the page is in view
  useEffect(() => {
    if (!live) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void read();
    }, SUMMARY_POLL_MS);
    return () => window.clearInterval(timer);
  }, [live, read]);

  const renderPiece = (piece: SummaryPiece, index: number): ReactNode => {
    switch (piece.kind) {
      case "bold":
        return <strong key={index} className="font-semibold text-foreground">{piece.text}</strong>;
      case "italic":
        return <em key={index}>{piece.text}</em>;
      case "fixed":
        return <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{piece.text}</code>;
      case "url":
        return (
          <a key={index} href={piece.href} target="_blank" rel="noopener noreferrer"
             className="text-blue-700 underline-offset-2 hover:underline dark:text-blue-300">
            {piece.text}
          </a>
        );
      case "object": {
        const target = summary?.objects?.[piece.objectId];
        if (!target) return <span key={index} className="font-medium">{piece.text}</span>;
        return (
          <button key={index} type="button" onClick={() => setOpened(target)}
                  title={`Open ${target.label} (${target.className})`}
                  className="rounded bg-blue-50 px-1.5 py-0.5 font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/50">
            {piece.text}
          </button>
        );
      }
      case "path":
        return <span key={index} className="font-mono text-[0.85em]" title={piece.path}>{piece.text}</span>;
      default:
        return <Fragment key={index}>{piece.text}</Fragment>;
    }
  };

  const renderRows = (rows: SummaryRow[]) => rows.map((row, index) => (
    row.kind === "fact" ? (
      <div key={index} className="grid grid-cols-[minmax(7rem,38%)_1fr] gap-3 py-1.5">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground pt-0.5">{row.label}</dt>
        <dd className="min-w-0 break-words text-foreground/90">{parseSummaryLine(row.value).map(renderPiece)}</dd>
      </div>
    ) : (
      <p key={index} className="py-1 break-words whitespace-pre-wrap text-foreground/90">
        {parseSummaryLine(row.text).map(renderPiece)}
      </p>
    )
  ));

  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Select a protocol to see its summary.
      </div>
    );
  }

  const blocks = summary ? buildSummaryBlocks(summary.lines) : [];
  const isEmpty = summary !== null && (blocks.length === 0 || (blocks.length === 1 && blocks[0].kind === "main"
    && blocks[0].rows.length === 1 && blocks[0].rows[0].kind === "line"
    && blocks[0].rows[0].text === "No summary information."));

  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-label="Protocol summary">
      <div className="min-h-0 flex-1 overflow-auto p-3 text-sm leading-6">
        {!summary ? (
          error ? (
            <p className="text-red-700 dark:text-red-300">{error}</p>
          ) : (
            <p className="text-muted-foreground">Reading the summary…</p>
          )
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
            <FileText className="h-6 w-6 opacity-60" aria-hidden="true" />
            <span>This protocol gives no summary.</span>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {blocks.map((block, index) => {
              if (block.kind === "main") {
                return (
                  <dl key={index} className="divide-y divide-border rounded-lg border border-border bg-background px-3 py-1">
                    {renderRows(block.rows)}
                  </dl>
                );
              }
              const callout = CALLOUTS[block.kind];
              return (
                <section key={index} className={`rounded-lg border px-3 py-2 ${callout.box}`}
                         aria-label={callout.title}>
                  <h4 className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${callout.head}`}>
                    <callout.Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {callout.title}
                  </h4>
                  <dl className="mt-1">{renderRows(block.rows)}</dl>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {summary && (
        <div className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-1 text-[11px] text-muted-foreground">
          {live && (
            <span className="flex items-center gap-1.5" title={`Read every ${SUMMARY_POLL_MS / 1000} s while the protocol runs`}>
              <span className={`h-1.5 w-1.5 rounded-full bg-emerald-500 ${loading ? "animate-pulse" : ""}`} aria-hidden="true" />
              Live
            </span>
          )}
          {updatedAt && <span>Updated {formatTime(updatedAt)}</span>}
          {error && <span className="text-amber-700 dark:text-amber-300">Could not update: {error}</span>}
        </div>
      )}

      {opened && projectId != null && (
        <AnalyzeOutputDialog
          open
          onClose={() => setOpened(null)}
          projectId={Number(projectId)}
          protocolId={opened.protocolId}
          protocolLabel={String(opened.protocolId) === String(protocolId) ? protocolLabel : `#${opened.protocolId}`}
          outputName={opened.outputName}
          displayName={opened.label}
          outputRaw={opened.className ? { pointerClass: opened.className } : null}
        />
      )}
    </div>
  );
}
