import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";

import { useProjectService } from "@/ProjectServiceContext";
import AnalyzeOutputDialog from "@/components/analyze/analyze-output-dialog";
import type { ProtocolSummary, ProtocolSummaryObject } from "@/services/ProjectService";

type ProtocolSummaryPanelProps = {
  projectId: number | string | null | undefined;
  protocolId: number | string | null | undefined;
  protocolLabel?: string;
  /** A new status reads the summary again (a running protocol's summary grows). */
  protocolStatus?: string | null;
};

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

type Section = "normal" | "error" | "warning";

/** Every line of the summary (a line may hold several), with the section it belongs to. */
function summaryRows(lines: string[]): { text: string; section: Section }[] {
  let section: Section = "normal";
  const rows: { text: string; section: Section }[] = [];
  for (const text of lines.flatMap((line) => line.split("\n"))) {
    const heading = text.trim();
    // summary() closes with *COMMENTS:*, *ERROR:* and *WARNINGS:*, each after an empty line
    if (heading === "*ERROR:*") section = "error";
    else if (heading === "*WARNINGS:*") section = "warning";
    else if (heading.startsWith("*COMMENTS:*")) section = "normal";
    rows.push({ text, section });
  }
  return rows;
}

const SECTION_CLASS: Record<Section, string> = {
  normal: "",
  error: "text-red-700 dark:text-red-300",
  warning: "text-amber-700 dark:text-amber-300",
};

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
  const [opened, setOpened] = useState<ProtocolSummaryObject | null>(null);
  const ready = projectId != null && protocolId != null && String(protocolId) !== "";

  const load = useCallback(() => {
    if (!ready || !svc.fetchProtocolSummary) return () => undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    svc.fetchProtocolSummary(projectId!, protocolId!)
      .then((value) => {
        if (!cancelled) setSummary(value);
      })
      .catch((reason: any) => {
        if (!cancelled) {
          setSummary(null);
          setError(String(reason?.message || "The summary could not be read"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [svc, ready, projectId, protocolId]);

  useEffect(() => load(), [load, protocolStatus]);

  const renderPiece = (piece: SummaryPiece, index: number): ReactNode => {
    switch (piece.kind) {
      case "bold":
        return <strong key={index} className="font-semibold">{piece.text}</strong>;
      case "italic":
        return <em key={index}>{piece.text}</em>;
      case "fixed":
        return <code key={index} className="rounded bg-muted px-1 font-mono text-[0.9em]">{piece.text}</code>;
      case "url":
        return (
          <a key={index} href={piece.href} target="_blank" rel="noopener noreferrer"
             className="text-blue-700 underline dark:text-blue-300">
            {piece.text}
          </a>
        );
      case "object": {
        const target = summary?.objects?.[piece.objectId];
        if (!target) return <span key={index} className="font-medium">{piece.text}</span>;
        return (
          <button key={index} type="button" onClick={() => setOpened(target)}
                  title={`Open ${target.label} (${target.className})`}
                  className="font-medium text-blue-700 underline hover:text-blue-900 dark:text-blue-300">
            {piece.text}
          </button>
        );
      }
      case "path":
        return <span key={index} className="font-medium" title={piece.path}>{piece.text}</span>;
      default:
        return <Fragment key={index}>{piece.text}</Fragment>;
    }
  };

  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Select a protocol to see its summary.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-label="Protocol summary">
      <div className="flex shrink-0 items-center gap-2 px-2 py-1">
        {summary?.hasWarnings && (
          <span className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" /> Warnings
          </span>
        )}
        <button type="button" onClick={() => load()} disabled={loading} title="Read the summary again"
                aria-label="Reload summary"
                className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 pb-3 text-sm leading-6">
        {error ? (
          <p className="text-red-700 dark:text-red-300">{error}</p>
        ) : !summary && loading ? (
          <p className="text-muted-foreground">Reading the summary…</p>
        ) : summary ? (
          summaryRows(summary.lines).map((row, index) => (
            <p key={index} className={`min-h-[1.5rem] whitespace-pre-wrap break-words ${SECTION_CLASS[row.section]}`}>
              {parseSummaryLine(row.text).map(renderPiece)}
            </p>
          ))
        ) : null}
      </div>

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
