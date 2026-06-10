import { useEffect, useMemo, useState } from "react";
import { RefreshCw, X } from "lucide-react";

type ProjectWorkspaceCompareTab = {
  id: string;
  projectName: string;
  title: string;
};

type ProjectWorkspaceCompareDialogProps = {
  open: boolean;
  tabs: ProjectWorkspaceCompareTab[];
  onClose: () => void;
  fetchProject: (projectName: string) => Promise<any>;
};

type ProtocolSummary = {
  id: string;
  label: string;
  className: string;
  status: string;
  outputCount: number;
};

type ProjectSummary = {
  id: string;
  title: string;
  protocols: ProtocolSummary[];
  protocolCount: number;
  outputCount: number;
  classCounts: Map<string, number>;
  statusCounts: Map<string, number>;
};

type ProtocolMatchType = "shared" | "changed" | "only-left" | "only-right";

type ProtocolComparisonRow = {
  key: string;
  className: string;
  leftProtocol?: ProtocolSummary;
  rightProtocol?: ProtocolSummary;
  matchType: ProtocolMatchType;
};

type CompareResult = {
  left: ProjectSummary;
  right: ProjectSummary;
  commonClasses: string[];
  onlyLeftClasses: string[];
  onlyRightClasses: string[];
  classDeltas: Array<{ name: string; left: number; right: number; delta: number }>;
  statusRows: Array<{ name: string; left: number; right: number }>;
  protocolRows: ProtocolComparisonRow[];
  similarityScore: number;
};

function classNames(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}

function getText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function getOutputCount(raw: any): number {
  const outputs = raw?.outputs ?? raw?.outputList ?? raw?.resultOutputs;

  if (Array.isArray(outputs)) return outputs.length;
  if (outputs && typeof outputs === "object") return Object.keys(outputs).length;

  return 0;
}

function normalizeProtocol(raw: any, fallbackId: string): ProtocolSummary {
  const id = getText(
    raw?.id ?? raw?.objId ?? raw?.objectId ?? raw?.protocolId ?? raw?.runId,
    fallbackId,
  );

  const label = getText(
    raw?.runName ?? raw?.label ?? raw?.name ?? raw?.protocolName ?? raw?.className,
    id,
  );

  const className = getText(
    raw?.className ?? raw?.protocolClassName ?? raw?.protocolClass ?? raw?.protocol ?? raw?.classname,
    label,
  );

  const status = getText(raw?.status ?? raw?.state ?? raw?.runState, "unknown").toLowerCase();

  return {
    id,
    label,
    className,
    status,
    outputCount: getOutputCount(raw),
  };
}

function isProjectRootProtocol(protocol: ProtocolSummary): boolean {
  const values = [protocol.id, protocol.label, protocol.className].map((value) => value.trim().toUpperCase());
  return values.includes("PROJECT");
}

function normalizeProtocols(rawProtocols: unknown): ProtocolSummary[] {
  const protocols = Array.isArray(rawProtocols)
    ? rawProtocols.map((item, index) => normalizeProtocol(item, String(index + 1)))
    : rawProtocols && typeof rawProtocols === "object"
      ? Object.entries(rawProtocols as Record<string, unknown>).map(([key, value]) =>
        normalizeProtocol(value, key),
      )
      : [];

  return protocols.filter((protocol) => !isProjectRootProtocol(protocol));
}

function countBy(items: ProtocolSummary[], picker: (item: ProtocolSummary) => string): Map<string, number> {
  const counts = new Map<string, number>();

  for (const item of items) {
    const key = picker(item) || "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function getSortedKeys(map: Map<string, number>): string[] {
  return Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
}

function getUnionKeys(a: Map<string, number>, b: Map<string, number>): string[] {
  return Array.from(new Set([...a.keys(), ...b.keys()])).sort((x, y) => x.localeCompare(y));
}

function groupByClass(protocols: ProtocolSummary[]): Map<string, ProtocolSummary[]> {
  const groups = new Map<string, ProtocolSummary[]>();

  for (const protocol of protocols) {
    const current = groups.get(protocol.className) ?? [];
    current.push(protocol);
    groups.set(protocol.className, current);
  }

  return groups;
}

function getClassOrder(left: ProtocolSummary[], right: ProtocolSummary[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const protocol of [...left, ...right]) {
    if (seen.has(protocol.className)) continue;
    seen.add(protocol.className);
    ordered.push(protocol.className);
  }

  return ordered;
}

function getProtocolMatchType(
  leftProtocol?: ProtocolSummary,
  rightProtocol?: ProtocolSummary,
): ProtocolMatchType {
  if (leftProtocol && !rightProtocol) return "only-left";
  if (!leftProtocol && rightProtocol) return "only-right";
  if (!leftProtocol || !rightProtocol) return "changed";

  const sameStatus = leftProtocol.status === rightProtocol.status;
  const sameOutputs = leftProtocol.outputCount === rightProtocol.outputCount;
  const sameLabel = leftProtocol.label === rightProtocol.label;

  return sameStatus && sameOutputs && sameLabel ? "shared" : "changed";
}

function buildProtocolRows(left: ProjectSummary, right: ProjectSummary): ProtocolComparisonRow[] {
  const leftGroups = groupByClass(left.protocols);
  const rightGroups = groupByClass(right.protocols);
  const classOrder = getClassOrder(left.protocols, right.protocols);

  return classOrder.flatMap((className) => {
    const leftProtocols = leftGroups.get(className) ?? [];
    const rightProtocols = rightGroups.get(className) ?? [];
    const rowCount = Math.max(leftProtocols.length, rightProtocols.length);

    return Array.from({ length: rowCount }).map((_, index) => {
      const leftProtocol = leftProtocols[index];
      const rightProtocol = rightProtocols[index];

      return {
        key: `${className}:${index}:${leftProtocol?.id ?? "none"}:${rightProtocol?.id ?? "none"}`,
        className,
        leftProtocol,
        rightProtocol,
        matchType: getProtocolMatchType(leftProtocol, rightProtocol),
      };
    });
  });
}

function calculateSimilarityScore(rows: ProtocolComparisonRow[]): number {
  if (!rows.length) return 0;

  const weights: Record<ProtocolMatchType, number> = {
    shared: 1,
    changed: 0.65,
    "only-left": 0,
    "only-right": 0,
  };

  const score = rows.reduce((total, row) => total + weights[row.matchType], 0) / rows.length;
  return Math.round(score * 100);
}

function summarizeProject(tab: ProjectWorkspaceCompareTab, payload: any): ProjectSummary {
  const protocols = normalizeProtocols(payload?.protocols ?? payload?.protocolsMap ?? payload?.workflow);
  const id = getText(payload?.id ?? payload?.projectId ?? tab.projectName, tab.projectName);
  const title = getText(payload?.name ?? payload?.shortName ?? payload?.title ?? tab.title, tab.title);

  return {
    id,
    title,
    protocols,
    protocolCount: protocols.length,
    outputCount: protocols.reduce((total, protocol) => total + protocol.outputCount, 0),
    classCounts: countBy(protocols, (protocol) => protocol.className),
    statusCounts: countBy(protocols, (protocol) => protocol.status),
  };
}

function buildComparison(
  leftTab: ProjectWorkspaceCompareTab,
  leftPayload: any,
  rightTab: ProjectWorkspaceCompareTab,
  rightPayload: any,
): CompareResult {
  const left = summarizeProject(leftTab, leftPayload);
  const right = summarizeProject(rightTab, rightPayload);
  const leftClasses = getSortedKeys(left.classCounts);
  const rightClasses = getSortedKeys(right.classCounts);
  const leftSet = new Set(leftClasses);
  const rightSet = new Set(rightClasses);
  const commonClasses = leftClasses.filter((name) => rightSet.has(name));
  const onlyLeftClasses = leftClasses.filter((name) => !rightSet.has(name));
  const onlyRightClasses = rightClasses.filter((name) => !leftSet.has(name));
  const protocolRows = buildProtocolRows(left, right);

  const classDeltas = getUnionKeys(left.classCounts, right.classCounts)
    .map((name) => {
      const leftCount = left.classCounts.get(name) ?? 0;
      const rightCount = right.classCounts.get(name) ?? 0;

      return {
        name,
        left: leftCount,
        right: rightCount,
        delta: leftCount - rightCount,
      };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.name.localeCompare(b.name))
    .slice(0, 12);

  const statusRows = getUnionKeys(left.statusCounts, right.statusCounts).map((name) => ({
    name,
    left: left.statusCounts.get(name) ?? 0,
    right: right.statusCounts.get(name) ?? 0,
  }));

  return {
    left,
    right,
    commonClasses,
    onlyLeftClasses,
    onlyRightClasses,
    classDeltas,
    statusRows,
    protocolRows,
    similarityScore: calculateSimilarityScore(protocolRows),
  };
}

function StatBox(props: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-slate-950">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {props.label}
      </div>
      <div className="mt-1 text-2xl font-bold tracking-tight text-gray-950 dark:text-white">
        {props.value}
      </div>
      {props.hint ? <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{props.hint}</div> : null}
    </div>
  );
}

function ChipList(props: { items: string[]; emptyText: string; tone?: "green" | "amber" | "gray" }) {
  const toneClass =
    props.tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"
      : props.tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
        : "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-slate-900 dark:text-gray-200";

  if (!props.items.length) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">{props.emptyText}</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {props.items.slice(0, 30).map((item) => (
        <span key={item} className={classNames("rounded-full border px-2.5 py-1 text-xs font-semibold", toneClass)}>
          {item}
        </span>
      ))}
      {props.items.length > 30 ? (
        <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-slate-900 dark:text-gray-200">
          +{props.items.length - 30} more
        </span>
      ) : null}
    </div>
  );
}

function MatchBadge(props: { matchType: ProtocolMatchType }) {
  const config: Record<ProtocolMatchType, { label: string; className: string }> = {
    shared: {
      label: "Shared",
      className: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200",
    },
    changed: {
      label: "Changed",
      className: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200",
    },
    "only-left": {
      label: "Only left",
      className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200",
    },
    "only-right": {
      label: "Only right",
      className: "border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-900/60 dark:bg-purple-950/30 dark:text-purple-200",
    },
  };

  const item = config[props.matchType];

  return (
    <span className={classNames("inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold", item.className)}>
      {item.label}
    </span>
  );
}

function ProtocolCell(props: { protocol?: ProtocolSummary }) {
  if (!props.protocol) {
    return <span className="text-xs text-gray-400 dark:text-gray-500">Missing</span>;
  }

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-bold text-gray-700 dark:bg-slate-800 dark:text-gray-200">
          {props.protocol.id}
        </span>
        <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100" title={props.protocol.label}>
          {props.protocol.label}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
        <span>{props.protocol.status}</span>
        <span>·</span>
        <span>{props.protocol.outputCount} outputs</span>
      </div>
    </div>
  );
}

function ProtocolDiffTable(props: { rows: ProtocolComparisonRow[]; leftTitle: string; rightTitle: string }) {
  if (!props.rows.length) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No comparable protocols found.</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-gray-100 text-xs uppercase tracking-wide text-gray-500 dark:bg-slate-900 dark:text-gray-400">
            <tr>
              <th className="w-[28%] px-3 py-2">Protocol class</th>
              <th className="w-[28%] px-3 py-2">{props.leftTitle}</th>
              <th className="w-[28%] px-3 py-2">{props.rightTitle}</th>
              <th className="w-[16%] px-3 py-2">Match</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-slate-950">
            {props.rows.map((row) => (
              <tr key={row.key}>
                <td className="px-3 py-3 align-top">
                  <div className="max-w-[320px] truncate font-semibold text-gray-900 dark:text-gray-100" title={row.className}>
                    {row.className}
                  </div>
                </td>
                <td className="px-3 py-3 align-top">
                  <ProtocolCell protocol={row.leftProtocol} />
                </td>
                <td className="px-3 py-3 align-top">
                  <ProtocolCell protocol={row.rightProtocol} />
                </td>
                <td className="px-3 py-3 align-top">
                  <MatchBadge matchType={row.matchType} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ProjectWorkspaceCompareDialog({
  open,
  tabs,
  onClose,
  fetchProject,
}: ProjectWorkspaceCompareDialogProps) {
  const [leftProjectName, setLeftProjectName] = useState("");
  const [rightProjectName, setRightProjectName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [comparison, setComparison] = useState<CompareResult | null>(null);

  const orderedTabs = useMemo(() => tabs.filter((tab) => tab.projectName), [tabs]);
  const leftTab = orderedTabs.find((tab) => tab.projectName === leftProjectName) ?? orderedTabs[0];
  const rightTab = orderedTabs.find((tab) => tab.projectName === rightProjectName) ?? orderedTabs[1] ?? orderedTabs[0];
  const canCompare = Boolean(leftTab && rightTab && leftTab.projectName !== rightTab.projectName);

  useEffect(() => {
    if (!open) return;
    const first = orderedTabs[0]?.projectName ?? "";
    const second = orderedTabs[1]?.projectName ?? "";

    setLeftProjectName((current) => current || first);
    setRightProjectName((current) => current || second || first);
  }, [open, orderedTabs]);

  useEffect(() => {
    if (!open || !canCompare || !leftTab || !rightTab) return;

    let cancelled = false;

    const loadComparison = async () => {
      setLoading(true);
      setErrorMessage(null);

      try {
        const [leftPayload, rightPayload] = await Promise.all([
          fetchProject(leftTab.projectName),
          fetchProject(rightTab.projectName),
        ]);

        if (cancelled) return;

        setComparison(buildComparison(leftTab, leftPayload, rightTab, rightPayload));
      } catch (err: any) {
        if (cancelled) return;
        setComparison(null);
        setErrorMessage(err?.message ?? String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadComparison();

    return () => {
      cancelled = true;
    };
  }, [open, canCompare, leftTab, rightTab, fetchProject]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 shadow-2xl dark:border-gray-700 dark:bg-slate-900">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-200 bg-white px-5 py-4 dark:border-gray-700 dark:bg-slate-950">
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight text-gray-950 dark:text-white">Compare projects</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Protocol-level workflow comparison, status distribution and protocol class overlap.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 hover:text-gray-950 dark:border-gray-700 dark:bg-slate-900 dark:text-gray-300 dark:hover:bg-slate-800 dark:hover:text-white"
            aria-label="Close comparison"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-b border-gray-200 bg-gray-50 px-5 py-4 dark:border-gray-700 dark:bg-slate-900 md:flex-row md:items-end">
          <label className="min-w-0 flex-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
            Left project
            <select
              value={leftProjectName}
              onChange={(event) => setLeftProjectName(event.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 outline-none focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/10 dark:border-gray-700 dark:bg-slate-950 dark:text-white"
            >
              {orderedTabs.map((tab) => (
                <option key={tab.id} value={tab.projectName}>
                  {tab.title}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-0 flex-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
            Right project
            <select
              value={rightProjectName}
              onChange={(event) => setRightProjectName(event.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 outline-none focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/10 dark:border-gray-700 dark:bg-slate-950 dark:text-white"
            >
              {orderedTabs.map((tab) => (
                <option key={tab.id} value={tab.projectName}>
                  {tab.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!canCompare ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              Open at least two different project tabs to compare them.
            </div>
          ) : loading ? (
            <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-700 dark:border-gray-700 dark:bg-slate-950 dark:text-gray-200">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Loading project comparison...
            </div>
          ) : errorMessage ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
              Could not compare projects: {errorMessage}
            </div>
          ) : comparison ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-slate-950">
                  <h3 className="text-sm font-bold text-gray-950 dark:text-white">{comparison.left.title}</h3>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <StatBox label="Protocols" value={comparison.left.protocolCount} />
                    <StatBox label="Outputs" value={comparison.left.outputCount} />
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-slate-950">
                  <h3 className="text-sm font-bold text-gray-950 dark:text-white">Workflow similarity</h3>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <StatBox label="Score" value={`${comparison.similarityScore}%`} hint="Class, status and output overlap" />
                    <StatBox label="Compared rows" value={comparison.protocolRows.length} />
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-slate-950">
                  <h3 className="text-sm font-bold text-gray-950 dark:text-white">{comparison.right.title}</h3>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <StatBox label="Protocols" value={comparison.right.protocolCount} />
                    <StatBox label="Outputs" value={comparison.right.outputCount} />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-slate-950">
                <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-gray-950 dark:text-white">Protocol-level workflow diff</h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Protocols are grouped by class and paired by their occurrence order in each workflow.
                    </p>
                  </div>
                </div>
                <ProtocolDiffTable
                  rows={comparison.protocolRows}
                  leftTitle={comparison.left.title}
                  rightTitle={comparison.right.title}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-slate-950">
                  <h3 className="text-sm font-bold text-gray-950 dark:text-white">Common protocol classes</h3>
                  <p className="mb-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Classes present in both projects.
                  </p>
                  <ChipList items={comparison.commonClasses} emptyText="No shared protocol classes." tone="green" />
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-slate-950">
                  <h3 className="text-sm font-bold text-gray-950 dark:text-white">Only in left project</h3>
                  <p className="mb-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Protocol classes unique to the left project.
                  </p>
                  <ChipList items={comparison.onlyLeftClasses} emptyText="No unique protocol classes." tone="amber" />
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-slate-950">
                  <h3 className="text-sm font-bold text-gray-950 dark:text-white">Only in right project</h3>
                  <p className="mb-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Protocol classes unique to the right project.
                  </p>
                  <ChipList items={comparison.onlyRightClasses} emptyText="No unique protocol classes." tone="amber" />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-slate-950">
                  <h3 className="text-sm font-bold text-gray-950 dark:text-white">Largest protocol class deltas</h3>
                  <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-100 text-xs uppercase tracking-wide text-gray-500 dark:bg-slate-900 dark:text-gray-400">
                        <tr>
                          <th className="px-3 py-2">Class</th>
                          <th className="px-3 py-2 text-right">Left</th>
                          <th className="px-3 py-2 text-right">Right</th>
                          <th className="px-3 py-2 text-right">Delta</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {comparison.classDeltas.map((row) => (
                          <tr key={row.name}>
                            <td className="max-w-[260px] truncate px-3 py-2 text-gray-900 dark:text-gray-100" title={row.name}>
                              {row.name}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{row.left}</td>
                            <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{row.right}</td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-gray-100">
                              {row.delta > 0 ? `+${row.delta}` : row.delta}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-slate-950">
                  <h3 className="text-sm font-bold text-gray-950 dark:text-white">Status distribution</h3>
                  <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-100 text-xs uppercase tracking-wide text-gray-500 dark:bg-slate-900 dark:text-gray-400">
                        <tr>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2 text-right">Left</th>
                          <th className="px-3 py-2 text-right">Right</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {comparison.statusRows.map((row) => (
                          <tr key={row.name}>
                            <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{row.name}</td>
                            <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{row.left}</td>
                            <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{row.right}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
