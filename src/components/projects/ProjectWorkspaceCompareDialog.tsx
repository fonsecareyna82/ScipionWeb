import { Fragment, useEffect, useMemo, useState } from "react";
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
  fetchProtocolDetails?: (projectName: string, protocolId: string) => Promise<any>;
};

type ProtocolParams = Record<string, string>;

type ProtocolSummary = {
  id: string;
  label: string;
  className: string;
  status: string;
  outputCount: number;
  params: ProtocolParams;
};

type ProjectSummary = {
  id: string;
  title: string;
  fullTitle: string;
  protocols: ProtocolSummary[];
  protocolCount: number;
  outputCount: number;
  classCounts: Map<string, number>;
  statusCounts: Map<string, number>;
};

type ProtocolMatchType = "shared" | "changed" | "only-left" | "only-right";
type ProtocolMatchQuality = "strong" | "likely" | "weak" | "none";
type ComparisonFilter = "all" | "changed" | "param-diff" | "only-left" | "only-right" | "shared" | "weak";

type ParamDiffRow = {
  name: string;
  leftValue: string;
  rightValue: string;
};

type ProtocolComparisonRow = {
  key: string;
  className: string;
  leftProtocol?: ProtocolSummary;
  rightProtocol?: ProtocolSummary;
  matchType: ProtocolMatchType;
  matchScore: number;
  matchQuality: ProtocolMatchQuality;
  paramDiffRows: ParamDiffRow[];
};

type ProtocolDetailsDiffState = {
  loading: boolean;
  error: string | null;
  rows: ParamDiffRow[] | null;
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
  insights: string[];
};

type MatchCandidate = {
  leftIndex: number;
  rightIndex: number;
  score: number;
  paramDiffRows: ParamDiffRow[];
};

function classNames(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}

function getText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unwrapProtocolPayload(payload: any): any {
  return payload?.protocol ?? payload?.data ?? payload?.result ?? payload;
}

function getProjectDisplayName(tab: ProjectWorkspaceCompareTab, payload: any): { title: string; fullTitle: string } {
  const rawTitle = getText(payload?.name ?? payload?.shortName ?? payload?.title ?? tab.projectName, tab.projectName);
  const tabTitle = getText(tab.title, rawTitle);
  const parts = tabTitle.split("/").filter(Boolean);
  const title = tabTitle.includes("/") ? parts[parts.length - 1] ?? tabTitle : tabTitle;

  return {
    title,
    fullTitle: rawTitle,
  };
}

function stringifyParamValue(value: unknown): string {
  if (value === null || value === undefined) return "";

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length <= 6 && value.every((item) => ["string", "number", "boolean"].includes(typeof item))) {
      return value.map((item) => String(item)).join(", ");
    }

    return JSON.stringify(value);
  }

  if (isPlainRecord(value)) {
    if ("value" in value) return stringifyParamValue(value.value);
    if ("currentValue" in value) return stringifyParamValue(value.currentValue);
    if ("default" in value) return stringifyParamValue(value.default);

    return JSON.stringify(value);
  }

  return String(value);
}

function extractProtocolParams(raw: any): ProtocolParams {
  const protocol = unwrapProtocolPayload(raw);
  const candidateKeys = ["params", "parameters", "formValues", "values", "paramValues", "inputParams"];
  const source = candidateKeys.map((key) => protocol?.[key]).find((candidate) => isPlainRecord(candidate));

  if (!isPlainRecord(source)) return {};

  return Object.fromEntries(
    Object.entries(source)
      .filter(([key]) => !key.startsWith("_"))
      .map(([key, value]) => [key, stringifyParamValue(value)]),
  );
}

function getOutputCount(raw: any): number {
  const protocol = unwrapProtocolPayload(raw);
  const outputs = protocol?.outputs ?? protocol?.outputList ?? protocol?.resultOutputs;

  if (Array.isArray(outputs)) return outputs.length;
  if (outputs && typeof outputs === "object") return Object.keys(outputs).length;

  return 0;
}

function normalizeProtocol(raw: any, fallbackId: string): ProtocolSummary {
  const protocol = unwrapProtocolPayload(raw);
  const id = getText(
    protocol?.id ?? protocol?.objId ?? protocol?.objectId ?? protocol?.protocolId ?? protocol?.runId,
    fallbackId,
  );
  const label = getText(
    protocol?.runName ?? protocol?.label ?? protocol?.name ?? protocol?.protocolName ?? protocol?.className,
    id,
  );
  const className = getText(
    protocol?.className ?? protocol?.protocolClassName ?? protocol?.protocolClass ?? protocol?.protocol ?? protocol?.classname,
    label,
  );
  const status = getText(protocol?.status ?? protocol?.state ?? protocol?.runState, "unknown").toLowerCase();

  return {
    id,
    label,
    className,
    status,
    outputCount: getOutputCount(protocol),
    params: extractProtocolParams(protocol),
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
      ? Object.entries(rawProtocols as Record<string, unknown>).map(([key, value]) => normalizeProtocol(value, key))
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

function normalizeComparableText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTokenSet(value: string): Set<string> {
  return new Set(normalizeComparableText(value).split(" ").filter((token) => token.length > 1));
}

function getLabelSimilarity(a: string, b: string): number {
  const left = normalizeComparableText(a);
  const right = normalizeComparableText(b);

  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.82;

  const leftTokens = getTokenSet(left);
  const rightTokens = getTokenSet(right);
  const union = new Set([...leftTokens, ...rightTokens]);

  if (!union.size) return 0;

  const intersection = Array.from(leftTokens).filter((token) => rightTokens.has(token));
  return intersection.length / union.size;
}

function getParamSimilarity(leftParams: ProtocolParams, rightParams: ProtocolParams): number {
  const keys = new Set([...Object.keys(leftParams), ...Object.keys(rightParams)]);

  if (!keys.size) return 0.72;

  let matches = 0;
  for (const key of keys) {
    if ((leftParams[key] ?? "") === (rightParams[key] ?? "")) matches += 1;
  }

  return matches / keys.size;
}

function getIdSimilarity(leftId: string, rightId: string): number {
  const left = Number(leftId);
  const right = Number(rightId);

  if (!Number.isFinite(left) || !Number.isFinite(right)) return leftId === rightId ? 1 : 0;
  if (left === right) return 1;

  const distance = Math.abs(left - right);
  if (distance <= 5) return 0.8;
  if (distance <= 25) return 0.45;
  return 0;
}

function getProtocolMatchScore(leftProtocol: ProtocolSummary, rightProtocol: ProtocolSummary): number {
  const labelSimilarity = getLabelSimilarity(leftProtocol.label, rightProtocol.label);
  const paramSimilarity = getParamSimilarity(leftProtocol.params, rightProtocol.params);
  const idSimilarity = getIdSimilarity(leftProtocol.id, rightProtocol.id);
  const statusScore = leftProtocol.status === rightProtocol.status ? 1 : 0;
  const outputScore =
    leftProtocol.outputCount === rightProtocol.outputCount
      ? 1
      : Math.abs(leftProtocol.outputCount - rightProtocol.outputCount) <= 1
        ? 0.55
        : 0;

  const score =
    20 +
    labelSimilarity * 30 +
    statusScore * 15 +
    outputScore * 15 +
    paramSimilarity * 15 +
    idSimilarity * 5;

  return Math.min(100, Math.round(score));
}

function getMatchQuality(score: number, matchType: ProtocolMatchType): ProtocolMatchQuality {
  if (matchType === "only-left" || matchType === "only-right") return "none";
  if (score >= 85) return "strong";
  if (score >= 65) return "likely";
  return "weak";
}

function getParamDiffRows(leftParams: ProtocolParams, rightParams: ProtocolParams): ParamDiffRow[] {
  const keys = Array.from(new Set([...Object.keys(leftParams), ...Object.keys(rightParams)])).sort((a, b) =>
    a.localeCompare(b),
  );

  return keys
    .map((name) => ({
      name,
      leftValue: leftParams[name] ?? "",
      rightValue: rightParams[name] ?? "",
    }))
    .filter((row) => row.leftValue !== row.rightValue);
}

function getProtocolParamDiffRows(leftProtocol?: ProtocolSummary, rightProtocol?: ProtocolSummary): ParamDiffRow[] {
  if (!leftProtocol || !rightProtocol) return [];
  return getParamDiffRows(leftProtocol.params, rightProtocol.params);
}

function getProtocolMatchType(
  leftProtocol?: ProtocolSummary,
  rightProtocol?: ProtocolSummary,
  paramDiffRows: ParamDiffRow[] = [],
): ProtocolMatchType {
  if (leftProtocol && !rightProtocol) return "only-left";
  if (!leftProtocol && rightProtocol) return "only-right";
  if (!leftProtocol || !rightProtocol) return "changed";

  const sameStatus = leftProtocol.status === rightProtocol.status;
  const sameOutputs = leftProtocol.outputCount === rightProtocol.outputCount;
  const sameLabel = leftProtocol.label === rightProtocol.label;
  const sameParams = paramDiffRows.length === 0;

  return sameStatus && sameOutputs && sameLabel && sameParams ? "shared" : "changed";
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

function buildMatchedRow(
  className: string,
  leftProtocol: ProtocolSummary | undefined,
  rightProtocol: ProtocolSummary | undefined,
  index: number,
  matchScore = 0,
  paramDiffRows: ParamDiffRow[] = getProtocolParamDiffRows(leftProtocol, rightProtocol),
): ProtocolComparisonRow {
  const matchType = getProtocolMatchType(leftProtocol, rightProtocol, paramDiffRows);

  return {
    key: `${className}:${index}:${leftProtocol?.id ?? "none"}:${rightProtocol?.id ?? "none"}`,
    className,
    leftProtocol,
    rightProtocol,
    matchType,
    matchScore,
    matchQuality: getMatchQuality(matchScore, matchType),
    paramDiffRows,
  };
}

function buildProtocolRows(left: ProjectSummary, right: ProjectSummary): ProtocolComparisonRow[] {
  const leftGroups = groupByClass(left.protocols);
  const rightGroups = groupByClass(right.protocols);
  const classOrder = getClassOrder(left.protocols, right.protocols);
  const rows: ProtocolComparisonRow[] = [];

  for (const className of classOrder) {
    const leftProtocols = leftGroups.get(className) ?? [];
    const rightProtocols = rightGroups.get(className) ?? [];
    const candidates: MatchCandidate[] = [];

    for (let leftIndex = 0; leftIndex < leftProtocols.length; leftIndex += 1) {
      for (let rightIndex = 0; rightIndex < rightProtocols.length; rightIndex += 1) {
        candidates.push({
          leftIndex,
          rightIndex,
          score: getProtocolMatchScore(leftProtocols[leftIndex], rightProtocols[rightIndex]),
          paramDiffRows: getProtocolParamDiffRows(leftProtocols[leftIndex], rightProtocols[rightIndex]),
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    const usedLeft = new Set<number>();
    const usedRight = new Set<number>();
    const classRows: ProtocolComparisonRow[] = [];

    for (const candidate of candidates) {
      if (usedLeft.has(candidate.leftIndex) || usedRight.has(candidate.rightIndex)) continue;

      usedLeft.add(candidate.leftIndex);
      usedRight.add(candidate.rightIndex);
      classRows.push(
        buildMatchedRow(
          className,
          leftProtocols[candidate.leftIndex],
          rightProtocols[candidate.rightIndex],
          candidate.leftIndex,
          candidate.score,
          candidate.paramDiffRows,
        ),
      );
    }

    leftProtocols.forEach((protocol, index) => {
      if (!usedLeft.has(index)) {
        classRows.push(buildMatchedRow(className, protocol, undefined, index));
      }
    });

    rightProtocols.forEach((protocol, index) => {
      if (!usedRight.has(index)) {
        classRows.push(buildMatchedRow(className, undefined, protocol, index));
      }
    });

    classRows.sort((a, b) => {
      const leftA = a.leftProtocol ? leftProtocols.indexOf(a.leftProtocol) : Number.MAX_SAFE_INTEGER;
      const leftB = b.leftProtocol ? leftProtocols.indexOf(b.leftProtocol) : Number.MAX_SAFE_INTEGER;
      const rightA = a.rightProtocol ? rightProtocols.indexOf(a.rightProtocol) : Number.MAX_SAFE_INTEGER;
      const rightB = b.rightProtocol ? rightProtocols.indexOf(b.rightProtocol) : Number.MAX_SAFE_INTEGER;
      return leftA - leftB || rightA - rightB;
    });

    rows.push(...classRows);
  }

  return rows;
}

function calculateSimilarityScore(rows: ProtocolComparisonRow[]): number {
  if (!rows.length) return 0;

  const weights: Record<ProtocolMatchType, number> = {
    shared: 1,
    changed: 0.65,
    "only-left": 0,
    "only-right": 0,
  };

  const score = rows.reduce((total, row) => {
    const confidenceFactor = row.matchScore > 0 ? Math.max(0.45, row.matchScore / 100) : 1;
    return total + weights[row.matchType] * confidenceFactor;
  }, 0) / rows.length;

  return Math.round(score * 100);
}

function getComparisonInsights(
  left: ProjectSummary,
  right: ProjectSummary,
  protocolRows: ProtocolComparisonRow[],
  classDeltas: Array<{ name: string; left: number; right: number; delta: number }>,
): string[] {
  const onlyLeft = protocolRows.filter((row) => row.matchType === "only-left").length;
  const onlyRight = protocolRows.filter((row) => row.matchType === "only-right").length;
  const changed = protocolRows.filter((row) => row.matchType === "changed").length;
  const paramDiff = protocolRows.filter((row) => row.paramDiffRows.length > 0).length;
  const weak = protocolRows.filter((row) => row.matchQuality === "weak").length;
  const outputDelta = left.outputCount - right.outputCount;
  const topDeltas = classDeltas.filter((row) => row.delta !== 0).slice(0, 3);
  const insights: string[] = [];

  if (onlyLeft || onlyRight) {
    insights.push(`${onlyLeft} protocols only exist in the left project and ${onlyRight} only exist in the right project.`);
  }

  if (changed) {
    insights.push(`${changed} matched protocol rows changed by label, status, outputs or parameters.`);
  }

  if (paramDiff) {
    insights.push(`${paramDiff} matched rows already show parameter differences from the loaded project payload.`);
  }

  if (weak) {
    insights.push(`${weak} matches have weak confidence and should be reviewed manually.`);
  }

  if (outputDelta !== 0) {
    insights.push(
      `The left project has ${Math.abs(outputDelta)} ${outputDelta > 0 ? "more" : "fewer"} detected outputs than the right project.`,
    );
  }

  if (topDeltas.length) {
    insights.push(
      `Largest class deltas: ${topDeltas.map((row) => `${row.name} (${row.delta > 0 ? "+" : ""}${row.delta})`).join(", ")}.`,
    );
  }

  if (!insights.length) {
    insights.push("The compared workflows look highly similar with the currently loaded metadata.");
  }

  return insights.slice(0, 5);
}

function summarizeProject(tab: ProjectWorkspaceCompareTab, payload: any): ProjectSummary {
  const protocols = normalizeProtocols(payload?.protocols ?? payload?.protocolsMap ?? payload?.workflow);
  const id = getText(payload?.id ?? payload?.projectId ?? tab.projectName, tab.projectName);
  const { title, fullTitle } = getProjectDisplayName(tab, payload);

  return {
    id,
    title,
    fullTitle,
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
    insights: getComparisonInsights(left, right, protocolRows, classDeltas),
  };
}

function StatBox(props: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-slate-950">
      <div className="truncate text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {props.label}
      </div>
      <div className="mt-1 truncate text-2xl font-bold tracking-tight text-gray-950 dark:text-white">
        {props.value}
      </div>
      {props.hint ? <div className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{props.hint}</div> : null}
    </div>
  );
}

function ProjectSummaryCard(props: { project: ProjectSummary }) {
  return (
    <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-slate-950">
      <h3 className="truncate text-sm font-bold text-gray-950 dark:text-white" title={props.project.fullTitle}>
        {props.project.title}
      </h3>
      {props.project.fullTitle && props.project.fullTitle !== props.project.title ? (
        <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400" title={props.project.fullTitle}>
          {props.project.fullTitle}
        </p>
      ) : null}
      <div className="mt-3 grid min-w-0 grid-cols-2 gap-3">
        <StatBox label="Protocols" value={props.project.protocolCount} />
        <StatBox label="Outputs" value={props.project.outputCount} />
      </div>
    </div>
  );
}

function InsightPanel(props: { insights: string[] }) {
  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50/80 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-blue-950 dark:text-blue-100">Scientific summary</h3>
          <p className="mt-1 text-xs text-blue-700/80 dark:text-blue-200/70">
            Auto-generated from smart workflow matching and loaded metadata.
          </p>
        </div>
        <span className="rounded-full border border-blue-200 bg-white/80 px-2.5 py-1 text-xs font-semibold text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
          Smart diff
        </span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {props.insights.map((insight, index) => (
          <div
            key={`${index}:${insight}`}
            className="rounded-xl border border-blue-100 bg-white/90 px-3 py-2 text-xs font-medium text-slate-700 shadow-sm dark:border-blue-900/50 dark:bg-slate-950/80 dark:text-slate-200"
          >
            {insight}
          </div>
        ))}
      </div>
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
        <span key={item} className={classNames("max-w-full truncate rounded-full border px-2.5 py-1 text-xs font-semibold", toneClass)} title={item}>
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

  return <span className={classNames("inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold", item.className)}>{item.label}</span>;
}

function ConfidenceBadge(props: { score: number; quality: ProtocolMatchQuality }) {
  if (props.quality === "none") {
    return <span className="text-[11px] text-gray-400 dark:text-gray-500">No match</span>;
  }

  const tone =
    props.quality === "strong"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"
      : props.quality === "likely"
        ? "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200"
        : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200";

  return (
    <span className={classNames("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize", tone)}>
      {props.quality} · {props.score}%
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
        <span className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-gray-100" title={props.protocol.label}>
          {props.protocol.label}
        </span>
      </div>
      <div className="mt-1 flex min-w-0 flex-wrap gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
        <span>{props.protocol.status}</span>
        <span>·</span>
        <span>{props.protocol.outputCount} outputs</span>
        {Object.keys(props.protocol.params).length ? (
          <>
            <span>·</span>
            <span>{Object.keys(props.protocol.params).length} params</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ParamDiffTable(props: { rows: ParamDiffRow[]; loading?: boolean; error?: string | null; sourceLabel?: string }) {
  if (props.loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 dark:border-gray-700 dark:bg-slate-900 dark:text-gray-300">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        Loading protocol details from fetchProtocolDetails...
      </div>
    );
  }

  if (props.error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
        Could not load protocol details: {props.error}
      </div>
    );
  }

  if (!props.rows.length) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500 dark:border-gray-700 dark:bg-slate-900 dark:text-gray-400">
        No parameter differences detected{props.sourceLabel ? ` (${props.sourceLabel}).` : "."}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
      <table className="w-full table-fixed text-left text-xs">
        <thead className="bg-gray-100 uppercase tracking-wide text-gray-500 dark:bg-slate-900 dark:text-gray-400">
          <tr>
            <th className="w-[28%] px-3 py-2">Parameter</th>
            <th className="w-[36%] px-3 py-2">Left value</th>
            <th className="w-[36%] px-3 py-2">Right value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-slate-950">
          {props.rows.map((row) => (
            <tr key={row.name}>
              <td className="break-words px-3 py-2 font-semibold text-gray-900 dark:text-gray-100">{row.name}</td>
              <td className="break-words px-3 py-2 text-gray-700 dark:text-gray-300">{row.leftValue || "—"}</td>
              <td className="break-words px-3 py-2 text-gray-700 dark:text-gray-300">{row.rightValue || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getFilterCounts(rows: ProtocolComparisonRow[]): Record<ComparisonFilter, number> {
  return {
    all: rows.length,
    changed: rows.filter((row) => row.matchType === "changed").length,
    "param-diff": rows.filter((row) => row.paramDiffRows.length > 0).length,
    "only-left": rows.filter((row) => row.matchType === "only-left").length,
    "only-right": rows.filter((row) => row.matchType === "only-right").length,
    shared: rows.filter((row) => row.matchType === "shared").length,
    weak: rows.filter((row) => row.matchQuality === "weak").length,
  };
}

function filterProtocolRows(rows: ProtocolComparisonRow[], filter: ComparisonFilter): ProtocolComparisonRow[] {
  if (filter === "all") return rows;
  if (filter === "param-diff") return rows.filter((row) => row.paramDiffRows.length > 0);
  if (filter === "weak") return rows.filter((row) => row.matchQuality === "weak");
  return rows.filter((row) => row.matchType === filter);
}

function FilterButton(props: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={classNames(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
        props.active
          ? "border-blue-500 bg-blue-600 text-white shadow-sm shadow-blue-500/20"
          : "border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50 dark:border-gray-700 dark:bg-slate-950 dark:text-gray-200 dark:hover:border-blue-800 dark:hover:bg-blue-950/30",
      )}
    >
      <span>{props.label}</span>
      <span
        className={classNames(
          "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
          props.active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-300",
        )}
      >
        {props.count}
      </span>
    </button>
  );
}

function ProtocolDiffTable(props: {
  rows: ProtocolComparisonRow[];
  leftTitle: string;
  rightTitle: string;
  leftProjectName: string;
  rightProjectName: string;
  fetchProtocolDetails?: (projectName: string, protocolId: string) => Promise<any>;
}) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [detailsDiffByRow, setDetailsDiffByRow] = useState<Record<string, ProtocolDetailsDiffState>>({});
  const [activeFilter, setActiveFilter] = useState<ComparisonFilter>("all");

  useEffect(() => {
    setExpandedRows(new Set());
    setDetailsDiffByRow({});
    setActiveFilter("all");
  }, [props.leftProjectName, props.rightProjectName, props.rows]);

  const filterCounts = useMemo(() => getFilterCounts(props.rows), [props.rows]);
  const filteredRows = useMemo(() => filterProtocolRows(props.rows, activeFilter), [props.rows, activeFilter]);

  if (!props.rows.length) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No comparable protocols found.</p>;
  }

  const loadDetailsDiff = async (row: ProtocolComparisonRow) => {
    if (!props.fetchProtocolDetails || !row.leftProtocol || !row.rightProtocol) return;
    if (detailsDiffByRow[row.key]?.rows || detailsDiffByRow[row.key]?.loading) return;

    setDetailsDiffByRow((prev) => ({
      ...prev,
      [row.key]: { loading: true, error: null, rows: null },
    }));

    try {
      const [leftDetails, rightDetails] = await Promise.all([
        props.fetchProtocolDetails(props.leftProjectName, row.leftProtocol.id),
        props.fetchProtocolDetails(props.rightProjectName, row.rightProtocol.id),
      ]);
      const leftParams = extractProtocolParams(leftDetails);
      const rightParams = extractProtocolParams(rightDetails);

      setDetailsDiffByRow((prev) => ({
        ...prev,
        [row.key]: { loading: false, error: null, rows: getParamDiffRows(leftParams, rightParams) },
      }));
    } catch (err: any) {
      setDetailsDiffByRow((prev) => ({
        ...prev,
        [row.key]: { loading: false, error: err?.message ?? String(err), rows: null },
      }));
    }
  };

  const toggleRow = (row: ProtocolComparisonRow) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(row.key)) next.delete(row.key);
      else next.add(row.key);
      return next;
    });

    if (!expandedRows.has(row.key)) {
      void loadDetailsDiff(row);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <FilterButton active={activeFilter === "all"} label="All" count={filterCounts.all} onClick={() => setActiveFilter("all")} />
        <FilterButton active={activeFilter === "changed"} label="Changed" count={filterCounts.changed} onClick={() => setActiveFilter("changed")} />
        <FilterButton active={activeFilter === "param-diff"} label="Param diff" count={filterCounts["param-diff"]} onClick={() => setActiveFilter("param-diff")} />
        <FilterButton active={activeFilter === "only-left"} label="Only left" count={filterCounts["only-left"]} onClick={() => setActiveFilter("only-left")} />
        <FilterButton active={activeFilter === "only-right"} label="Only right" count={filterCounts["only-right"]} onClick={() => setActiveFilter("only-right")} />
        <FilterButton active={activeFilter === "shared"} label="Shared" count={filterCounts.shared} onClick={() => setActiveFilter("shared")} />
        <FilterButton active={activeFilter === "weak"} label="Weak match" count={filterCounts.weak} onClick={() => setActiveFilter("weak")} />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="sticky top-0 z-10 bg-gray-100 text-xs uppercase tracking-wide text-gray-500 dark:bg-slate-900 dark:text-gray-400">
              <tr>
                <th className="w-[20%] px-3 py-2">Protocol class</th>
                <th className="w-[26%] px-3 py-2"><span className="block truncate" title={props.leftTitle}>{props.leftTitle}</span></th>
                <th className="w-[26%] px-3 py-2"><span className="block truncate" title={props.rightTitle}>{props.rightTitle}</span></th>
                <th className="w-[11%] px-3 py-2 text-right">Params</th>
                <th className="w-[9%] px-3 py-2">Match</th>
                <th className="w-[8%] px-3 py-2">Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-slate-950">
              {filteredRows.map((row) => {
                const isExpanded = expandedRows.has(row.key);
                const canShowParams = Boolean(row.leftProtocol && row.rightProtocol);
                const detailsState = detailsDiffByRow[row.key];
                const rows = detailsState?.rows ?? row.paramDiffRows;
                const detailsLoaded = Boolean(detailsState?.rows);
                const detailsSourceLabel = detailsLoaded
                  ? "loaded from protocol details"
                  : props.fetchProtocolDetails
                    ? "initial project payload, details not loaded yet"
                    : "initial project payload";
                const effectiveMatchType = detailsLoaded ? getProtocolMatchType(row.leftProtocol, row.rightProtocol, rows) : row.matchType;
                const effectiveQuality = detailsLoaded ? getMatchQuality(row.matchScore, effectiveMatchType) : row.matchQuality;
                const paramLabel = detailsLoaded
                  ? rows.length
                    ? `${rows.length} detail diff`
                    : "Details loaded"
                  : props.fetchProtocolDetails
                    ? row.paramDiffRows.length
                      ? `${row.paramDiffRows.length} initial diff · load`
                      : "Load details"
                    : row.paramDiffRows.length
                      ? `${row.paramDiffRows.length} diff`
                      : "View";

                return (
                  <Fragment key={row.key}>
                    <tr>
                      <td className="px-3 py-3 align-top">
                        <div className="truncate font-semibold text-gray-900 dark:text-gray-100" title={row.className}>{row.className}</div>
                      </td>
                      <td className="px-3 py-3 align-top"><ProtocolCell protocol={row.leftProtocol} /></td>
                      <td className="px-3 py-3 align-top"><ProtocolCell protocol={row.rightProtocol} /></td>
                      <td className="px-3 py-3 text-right align-top">
                        <button
                          type="button"
                          onClick={() => toggleRow(row)}
                          disabled={!canShowParams}
                          className={classNames(
                            "max-w-full rounded-lg border px-2 py-1 text-xs font-semibold transition",
                            canShowParams
                              ? "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-slate-900 dark:text-gray-200 dark:hover:bg-slate-800"
                              : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-700 dark:bg-slate-800 dark:text-gray-500",
                          )}
                          title={paramLabel}
                        >
                          <span className="block truncate">{isExpanded ? "Hide" : paramLabel}</span>
                        </button>
                      </td>
                      <td className="px-3 py-3 align-top"><MatchBadge matchType={effectiveMatchType} /></td>
                      <td className="px-3 py-3 align-top"><ConfidenceBadge score={row.matchScore} quality={effectiveQuality} /></td>
                    </tr>

                    {isExpanded && canShowParams ? (
                      <tr>
                        <td colSpan={6} className="bg-gray-50 px-3 py-3 dark:bg-slate-900/60">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Parameter differences</span>
                            <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 font-semibold text-gray-600 dark:border-gray-700 dark:bg-slate-950 dark:text-gray-300">
                              {detailsState?.loading ? "Loading protocol details" : detailsSourceLabel}
                            </span>
                          </div>
                          <ParamDiffTable rows={rows} loading={detailsState?.loading} error={detailsState?.error} sourceLabel={detailsSourceLabel} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}

              {!filteredRows.length ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    No rows match the selected filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function ProjectWorkspaceCompareDialog({
  open,
  tabs,
  onClose,
  fetchProject,
  fetchProtocolDetails,
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
              Smart workflow comparison with confidence scoring, quick filters and protocol-level parameter loading.
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
                <option key={tab.id} value={tab.projectName}>{tab.title}</option>
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
                <option key={tab.id} value={tab.projectName}>{tab.title}</option>
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
              <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3">
                <ProjectSummaryCard project={comparison.left} />

                <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-slate-950">
                  <h3 className="truncate text-sm font-bold text-gray-950 dark:text-white">Workflow similarity</h3>
                  <div className="mt-3 grid min-w-0 grid-cols-2 gap-3">
                    <StatBox label="Score" value={`${comparison.similarityScore}%`} hint="Smart match confidence, status, outputs and parameters" />
                    <StatBox label="Compared rows" value={comparison.protocolRows.length} />
                  </div>
                </div>

                <ProjectSummaryCard project={comparison.right} />
              </div>

              <InsightPanel insights={comparison.insights} />

              <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-slate-950">
                <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-gray-950 dark:text-white">Protocol-level workflow diff</h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Rows are matched by protocol class, label similarity, status, outputs, parameter overlap and id proximity. Use filters to focus on relevant differences.
                    </p>
                  </div>
                </div>
                <ProtocolDiffTable
                  rows={comparison.protocolRows}
                  leftTitle={comparison.left.title}
                  rightTitle={comparison.right.title}
                  leftProjectName={leftTab?.projectName ?? ""}
                  rightProjectName={rightTab?.projectName ?? ""}
                  fetchProtocolDetails={fetchProtocolDetails}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-slate-950">
                  <h3 className="text-sm font-bold text-gray-950 dark:text-white">Common protocol classes</h3>
                  <p className="mb-3 mt-1 text-xs text-gray-500 dark:text-gray-400">Classes present in both projects.</p>
                  <ChipList items={comparison.commonClasses} emptyText="No shared protocol classes." tone="green" />
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-slate-950">
                  <h3 className="text-sm font-bold text-gray-950 dark:text-white">Only in left project</h3>
                  <p className="mb-3 mt-1 text-xs text-gray-500 dark:text-gray-400">Protocol classes unique to the left project.</p>
                  <ChipList items={comparison.onlyLeftClasses} emptyText="No unique protocol classes." tone="amber" />
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-slate-950">
                  <h3 className="text-sm font-bold text-gray-950 dark:text-white">Only in right project</h3>
                  <p className="mb-3 mt-1 text-xs text-gray-500 dark:text-gray-400">Protocol classes unique to the right project.</p>
                  <ChipList items={comparison.onlyRightClasses} emptyText="No unique protocol classes." tone="amber" />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-slate-950">
                  <h3 className="text-sm font-bold text-gray-950 dark:text-white">Largest protocol class deltas</h3>
                  <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                    <table className="w-full table-fixed text-left text-sm">
                      <thead className="bg-gray-100 text-xs uppercase tracking-wide text-gray-500 dark:bg-slate-900 dark:text-gray-400">
                        <tr>
                          <th className="w-[52%] px-3 py-2">Class</th>
                          <th className="w-[16%] px-3 py-2 text-right">Left</th>
                          <th className="w-[16%] px-3 py-2 text-right">Right</th>
                          <th className="w-[16%] px-3 py-2 text-right">Delta</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {comparison.classDeltas.map((row) => (
                          <tr key={row.name}>
                            <td className="truncate px-3 py-2 text-gray-900 dark:text-gray-100" title={row.name}>{row.name}</td>
                            <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{row.left}</td>
                            <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{row.right}</td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-gray-100">{row.delta > 0 ? `+${row.delta}` : row.delta}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-slate-950">
                  <h3 className="text-sm font-bold text-gray-950 dark:text-white">Status distribution</h3>
                  <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                    <table className="w-full table-fixed text-left text-sm">
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
                            <td className="truncate px-3 py-2 text-gray-900 dark:text-gray-100">{row.name}</td>
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
