import { ACTIVE_STATUSES, FAILED_STATUSES, countIn } from "@/utils/project-list";

function classNames(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}

/** A dot that beats while some protocol of the project is going on. */
export function RunningDot({ count }: { count: number }) {
  const text = `${count} ${count === 1 ? "protocol" : "protocols"} running`;
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0" title={text} aria-label={text} role="img">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60 motion-reduce:animate-none" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
    </span>
  );
}

/** How a project's protocols are doing: running, failed, finished and the rest, each only when there is some. */
export default function ProjectStatusSummary({
  counts,
  className,
}: {
  counts: Record<string, number>;
  className?: string;
}) {
  const running = countIn(counts, ACTIVE_STATUSES);
  const failed = countIn(counts, FAILED_STATUSES);
  const finished = countIn(counts, ["finished"]);
  const total = Object.values(counts).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const other = Math.max(0, total - running - failed - finished);

  const parts: Array<{ key: string; count: number; label: string; dot: string; text: string }> = [
    { key: "running", count: running, label: "running", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-300" },
    { key: "failed", count: failed, label: "failed", dot: "bg-red-500", text: "text-red-700 dark:text-red-300" },
    { key: "finished", count: finished, label: "finished", dot: "bg-emerald-500", text: "text-gray-800 dark:text-gray-200" },
    { key: "other", count: other, label: "not run", dot: "bg-gray-400", text: "text-gray-800 dark:text-gray-200" },
  ].filter((part) => part.count > 0);

  const summary = parts.map((part) => `${part.count} ${part.label}`).join(", ");

  return (
    <span
      className={classNames("inline-flex flex-wrap items-center gap-x-3 gap-y-1", className)}
      title={`${total} ${total === 1 ? "protocol" : "protocols"}: ${summary}`}
      data-testid="project-status-summary"
    >
      {parts.map((part) => (
        <span key={part.key} className="inline-flex items-center gap-1.5">
          <span className={classNames("h-2 w-2 rounded-full", part.dot)} aria-hidden="true" />
          <span className={classNames("font-medium tabular-nums", part.text)}>{part.count}</span>
          <span>{part.label}</span>
        </span>
      ))}
    </span>
  );
}
