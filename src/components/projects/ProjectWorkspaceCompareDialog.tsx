import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, RefreshCw, X } from "lucide-react";
import { openPrintableComparisonReport } from "./project-comparison-report";

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
  onOpenProtocol?: (projectName: string, protocolId: string) => void;
};

type ProtocolParams = Record<string, string>;
type ProtocolParamLabels = Record<string, string>;

type ProtocolSummary = {
  id: string;
  label: string;
  className: string;
  status: string;
  outputCount: number;
  params: ProtocolParams;
  paramLabels: ProtocolParamLabels;
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
type ComparisonFilter = "all" | "changed" | "param-diff" | "critical-param" | "only-left" | "only-right" | "shared" | "weak";
type ParamDiffCategory = "inputs" | "sampling" | "mask" | "reconstruction" | "compute" | "metadata" | "other";
type ParamDiffSeverity = "critical" | "important" | "minor";

type ParamDiffRow = {
  name: string;
  label: string;
  leftValue: string;
  rightValue: string;
  category: ParamDiffCategory;
  severity: ParamDiffSeverity;
};

type ParamComparisonFilter = "all" | "changed" | ParamDiffSeverity;

type ParamComparisonRow = ParamDiffRow & {
  changed: boolean;
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

type ReportActionStatus = "idle" | "copied" | "downloaded" | "pdf" | "error";

const paramCategoryLabels: Record<ParamDiffCategory, string> = {
  inputs: "Inputs",
  sampling: "Sampling and resolution",
  mask: "Mask and geometry",
  reconstruction: "Reconstruction strategy",
  compute: "Compute and performance",
  metadata: "Metadata and bookkeeping",
  other: "Other parameters",
};

const paramCategoryOrder: ParamDiffCategory[] = [
  "inputs",
  "sampling",
  "mask",
  "reconstruction",
  "compute",
  "metadata",
  "other",
];

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

function normalizeParamValueSource(source: unknown): Record<string, unknown> | null {
  if (isPlainRecord(source)) return source;

  if (!Array.isArray(source)) return null;

  const entries = source.flatMap((item) => {
    if (!isPlainRecord(item)) return [];

    const name = getText(item.name ?? item.key ?? item.id, "");
    if (!name) return [];

    const value =
      "value" in item
        ? item.value
        : "currentValue" in item
          ? item.currentValue
          : "default" in item
            ? item.default
            : item;

    return [[name, value] as [string, unknown]];
  });

  return entries.length ? Object.fromEntries(entries) : null;
}

function getProtocolParamValuesSource(raw: any): Record<string, unknown> | null {
  const protocol = unwrapProtocolPayload(raw);
  const candidateKeys = ["values", "formValues", "paramValues", "params", "parameters", "inputParams"];

  for (const key of candidateKeys) {
    const source = normalizeParamValueSource(protocol?.[key]);
    if (source) return source;
  }

  return null;
}

function getNestedRecordLabel(value: Record<string, unknown>, key: string): string {
  const nestedValue = value[key];

  if (!isPlainRecord(nestedValue)) return "";

  return getText(
    nestedValue["label"] ??
    nestedValue["displayLabel"] ??
    nestedValue["displayName"] ??
    nestedValue["title"] ??
    nestedValue["paramLabel"],
    "",
  );
}

function getInlineParamLabel(value: unknown): string {
  if (!isPlainRecord(value)) return "";

  const directLabel = getText(
    value["label"] ??
    value["displayLabel"] ??
    value["displayName"] ??
    value["title"] ??
    value["paramLabel"],
    "",
  );

  if (directLabel) return directLabel;

  return (
    getNestedRecordLabel(value, "param") ||
    getNestedRecordLabel(value, "definition") ||
    getNestedRecordLabel(value, "config")
  );
}

function collectParamLabelsFromParams(params: unknown, labels: ProtocolParamLabels): void {
  if (!Array.isArray(params)) return;

  for (const param of params) {
    if (!isPlainRecord(param)) continue;

    const name = getText(param.name ?? param.key ?? param.id, "");
    const label = getInlineParamLabel(param);

    if (name && label) {
      labels[name] = label;
    }

    collectParamLabelsFromParams(param.params, labels);
    collectParamLabelsFromParams(param.children, labels);
    collectParamLabelsFromSections(param.sections, labels);

    if (isPlainRecord(param.form)) {
      collectParamLabelsFromSections(param.form.sections, labels);
    }
  }
}

function collectParamLabelsFromSections(sections: unknown, labels: ProtocolParamLabels): void {
  if (!Array.isArray(sections)) return;

  for (const section of sections) {
    if (!isPlainRecord(section)) continue;

    collectParamLabelsFromParams(section.params, labels);
    collectParamLabelsFromSections(section.sections, labels);
  }
}

function collectInlineParamLabels(raw: any, labels: ProtocolParamLabels): void {
  const protocol = unwrapProtocolPayload(raw);
  const candidateKeys = ["params", "parameters", "formValues", "values", "paramValues", "inputParams"];

  for (const key of candidateKeys) {
    const source = protocol?.[key];

    if (Array.isArray(source)) {
      for (const item of source) {
        if (!isPlainRecord(item)) continue;

        const name = getText(item.name ?? item.key ?? item.id, "");
        const label = getInlineParamLabel(item);

        if (name && label && !labels[name]) {
          labels[name] = label;
        }
      }

      continue;
    }

    if (!isPlainRecord(source)) continue;

    for (const [name, value] of Object.entries(source)) {
      if (name.startsWith("_")) continue;

      const label = getInlineParamLabel(value);

      if (label && !labels[name]) {
        labels[name] = label;
      }
    }
  }
}

function extractProtocolParams(raw: any): ProtocolParams {
  const source = getProtocolParamValuesSource(raw);

  if (!source) return {};

  return Object.fromEntries(
    Object.entries(source)
      .filter(([key]) => !key.startsWith("_"))
      .map(([key, value]) => [key, stringifyParamValue(value)]),
  );
}

function extractProtocolParamLabels(raw: any): ProtocolParamLabels {
  const protocol = unwrapProtocolPayload(raw);
  const labels: ProtocolParamLabels = {};

  collectParamLabelsFromSections(protocol?.form?.sections, labels);
  collectParamLabelsFromSections(protocol?.sections, labels);
  collectParamLabelsFromSections(protocol?.formSections, labels);
  collectInlineParamLabels(protocol, labels);

  return labels;
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
    paramLabels: extractProtocolParamLabels(protocol),
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

function getParamMatchLabel(
  name: string,
  leftLabels: ProtocolParamLabels = {},
  rightLabels: ProtocolParamLabels = {},
): string {
  return getText(leftLabels[name] ?? rightLabels[name] ?? name, name);
}

function isNoisyMatchParam(
  name: string,
  leftLabels: ProtocolParamLabels = {},
  rightLabels: ProtocolParamLabels = {},
): boolean {
  const label = getParamMatchLabel(name, leftLabels, rightLabels);
  const key = normalizeComparableText(`${label} ${name}`);

  return /run name|comment|expert level|prerequisite|wait for|queue|host|gpu|cpu|thread|mpi|memory|lane|batch|cache|ssd|tag|note|date|version/.test(key);
}

function getParamMatchWeight(
  name: string,
  leftLabels: ProtocolParamLabels = {},
  rightLabels: ProtocolParamLabels = {},
): number {
  const label = getParamMatchLabel(name, leftLabels, rightLabels);
  const category = getParamDiffCategory(`${label} ${name}`);

  if (category === "inputs") return 2.5;
  if (category === "sampling") return 2.25;
  if (category === "mask") return 2;
  if (category === "reconstruction") return 2;
  if (category === "metadata") return 0.45;
  if (category === "compute") return 0.35;

  return 1;
}

function getParamSimilarity(
  leftParams: ProtocolParams,
  rightParams: ProtocolParams,
  leftLabels: ProtocolParamLabels = {},
  rightLabels: ProtocolParamLabels = {},
): number {
  const keys = Array.from(new Set([...Object.keys(leftParams), ...Object.keys(rightParams)])).filter(
    (key) => !isNoisyMatchParam(key, leftLabels, rightLabels),
  );

  if (!keys.length) return 0.72;

  let matchedWeight = 0;
  let totalWeight = 0;

  for (const key of keys) {
    const weight = getParamMatchWeight(key, leftLabels, rightLabels);
    totalWeight += weight;

    if ((leftParams[key] ?? "") === (rightParams[key] ?? "")) {
      matchedWeight += weight;
    }
  }

  return totalWeight ? matchedWeight / totalWeight : 0.72;
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
  const paramSimilarity = getParamSimilarity(
    leftProtocol.params,
    rightProtocol.params,
    leftProtocol.paramLabels,
    rightProtocol.paramLabels,
  );
  const idSimilarity = getIdSimilarity(leftProtocol.id, rightProtocol.id);
  const statusScore = leftProtocol.status === rightProtocol.status ? 1 : 0;
  const outputScore =
    leftProtocol.outputCount === rightProtocol.outputCount
      ? 1
      : Math.abs(leftProtocol.outputCount - rightProtocol.outputCount) <= 1
        ? 0.55
        : 0;

  const score =
    18 +
    labelSimilarity * 32 +
    paramSimilarity * 30 +
    outputScore * 10 +
    statusScore * 8 +
    idSimilarity * 2;

  return Math.min(100, Math.round(score));
}

function getMatchQuality(score: number, matchType: ProtocolMatchType): ProtocolMatchQuality {
  if (matchType === "only-left" || matchType === "only-right") return "none";
  if (score >= 85) return "strong";
  if (score >= 65) return "likely";
  return "weak";
}

function getParamDiffCategory(name: string): ParamDiffCategory {
  const key = normalizeComparableText(name);

  if (/input|source|particle|volume|micrograph|movie|tilt|coordinate|ctf|metadata|dataset|set/.test(key)) return "inputs";
  if (/sampling|pixel|angst|resolution|box|bin|scale|downsample|fourier|freq|frequency|lowpass|highpass|nyquist/.test(key)) return "sampling";
  if (/mask|diameter|radius|inner|outer|threshold|crop|shape|size|padding|symmetry|sym/.test(key)) return "mask";
  if (/class|refine|iteration|align|angular|search|regularization|tau|initial|reference|reconstruct|extract|pick|classification/.test(key)) return "reconstruction";
  if (/gpu|cpu|thread|mpi|memory|queue|lane|batch|split|parallel|compute|cache|ssd/.test(key)) return "compute";
  if (/label|name|comment|note|tag|date|path|file|suffix|prefix|version/.test(key)) return "metadata";

  return "other";
}

function getParamDiffSeverity(name: string, category: ParamDiffCategory): ParamDiffSeverity {
  const key = normalizeComparableText(name);

  if (/input|source|particle|volume|micrograph|movie|tilt|coordinate|ctf|dataset|symmetry|sym|mask|diameter|radius|pixel|sampling|box|resolution|reference|class|refine|classification/.test(key)) {
    return "critical";
  }

  if (category === "sampling" || category === "mask" || category === "reconstruction" || category === "inputs") {
    return "important";
  }

  if (category === "compute") return "minor";
  return "important";
}

function hasCriticalParamDiff(row: ProtocolComparisonRow): boolean {
  return row.paramDiffRows.some((paramRow) => paramRow.severity === "critical");
}

function getParamDiffRows(
  leftParams: ProtocolParams,
  rightParams: ProtocolParams,
  leftLabels: ProtocolParamLabels = {},
  rightLabels: ProtocolParamLabels = {},
): ParamDiffRow[] {
  return getParamComparisonRows(leftParams, rightParams, leftLabels, rightLabels).filter((row) => row.changed);
}

function getParamComparisonRows(
  leftParams: ProtocolParams,
  rightParams: ProtocolParams,
  leftLabels: ProtocolParamLabels = {},
  rightLabels: ProtocolParamLabels = {},
): ParamComparisonRow[] {
  const keys = Array.from(new Set([...Object.keys(leftParams), ...Object.keys(rightParams)])).sort((a, b) =>
    a.localeCompare(b),
  );

  return keys.map((name) => {
    const label = getText(leftLabels[name] ?? rightLabels[name] ?? name, name);
    const category = getParamDiffCategory(`${label} ${name}`);
    const leftValue = leftParams[name] ?? "";
    const rightValue = rightParams[name] ?? "";

    return {
      name,
      label,
      leftValue,
      rightValue,
      category,
      severity: getParamDiffSeverity(`${label} ${name}`, category),
      changed: leftValue !== rightValue,
    };
  });
}

function getProtocolParamDiffRows(leftProtocol?: ProtocolSummary, rightProtocol?: ProtocolSummary): ParamDiffRow[] {
  if (!leftProtocol || !rightProtocol) return [];
  return getParamDiffRows(leftProtocol.params, rightProtocol.params, leftProtocol.paramLabels, rightProtocol.paramLabels);
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

    const minimumCandidateScore = leftProtocols.length === 1 && rightProtocols.length === 1 ? 36 : 50;

    for (const candidate of candidates) {
      if (usedLeft.has(candidate.leftIndex) || usedRight.has(candidate.rightIndex)) continue;
      if (candidate.score < minimumCandidateScore) continue;

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
  const criticalParamDiff = protocolRows.filter(hasCriticalParamDiff).length;
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

  if (criticalParamDiff) {
    insights.push(`${criticalParamDiff} matched rows include critical parameter differences in inputs, sampling, masks or reconstruction settings.`);
  } else if (paramDiff) {
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

function getSafeFileName(value: string): string {
  const safeName = normalizeComparableText(value)
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9.-]/g, "")
    .slice(0, 80);

  return safeName || "project-comparison";
}

function formatProtocolForReport(protocol?: ProtocolSummary): string {
  if (!protocol) return "Missing";
  return `${protocol.id} ${protocol.label} (${protocol.status}, ${protocol.outputCount} outputs)`;
}

function formatParamValueForReport(value: string): string {
  const text = value || "—";
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function buildComparisonReportMarkdown(comparison: CompareResult): string {
  const changedRows = comparison.protocolRows.filter((row) => row.matchType === "changed");
  const onlyLeftRows = comparison.protocolRows.filter((row) => row.matchType === "only-left");
  const onlyRightRows = comparison.protocolRows.filter((row) => row.matchType === "only-right");
  const weakRows = comparison.protocolRows.filter((row) => row.matchQuality === "weak");
  const criticalRows = comparison.protocolRows.filter(hasCriticalParamDiff);
  const keyRows = comparison.protocolRows
    .filter((row) => row.matchType !== "shared" || row.matchQuality === "weak" || row.paramDiffRows.length > 0)
    .slice(0, 30);
  const lines: string[] = [];

  lines.push("# Project comparison report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Projects");
  lines.push(`- Left: ${comparison.left.title}${comparison.left.fullTitle !== comparison.left.title ? ` (${comparison.left.fullTitle})` : ""}`);
  lines.push(`- Right: ${comparison.right.title}${comparison.right.fullTitle !== comparison.right.title ? ` (${comparison.right.fullTitle})` : ""}`);
  lines.push("");
  lines.push("## Metrics");
  lines.push(`- Workflow similarity: ${comparison.similarityScore}%`);
  lines.push(`- Left protocols: ${comparison.left.protocolCount}`);
  lines.push(`- Right protocols: ${comparison.right.protocolCount}`);
  lines.push(`- Left outputs: ${comparison.left.outputCount}`);
  lines.push(`- Right outputs: ${comparison.right.outputCount}`);
  lines.push(`- Changed rows: ${changedRows.length}`);
  lines.push(`- Critical parameter rows: ${criticalRows.length}`);
  lines.push(`- Only left rows: ${onlyLeftRows.length}`);
  lines.push(`- Only right rows: ${onlyRightRows.length}`);
  lines.push(`- Weak matches: ${weakRows.length}`);
  lines.push("");
  lines.push("## Scientific summary");
  comparison.insights.forEach((insight) => lines.push(`- ${insight}`));
  lines.push("");

  lines.push("## Status distribution");
  lines.push("| Status | Left | Right |");
  lines.push("| --- | ---: | ---: |");
  comparison.statusRows.forEach((row) => {
    lines.push(`| ${row.name} | ${row.left} | ${row.right} |`);
  });
  lines.push("");

  lines.push("## Largest protocol class deltas");
  lines.push("| Class | Left | Right | Delta |");
  lines.push("| --- | ---: | ---: | ---: |");
  comparison.classDeltas.forEach((row) => {
    lines.push(`| ${row.name} | ${row.left} | ${row.right} | ${row.delta > 0 ? "+" : ""}${row.delta} |`);
  });
  lines.push("");

  lines.push("## Key workflow differences");
  lines.push("| Class | Left protocol | Right protocol | Match | Confidence | Parameter diffs | Critical diffs |");
  lines.push("| --- | --- | --- | --- | ---: | ---: | ---: |");
  keyRows.forEach((row) => {
    const criticalCount = row.paramDiffRows.filter((paramRow) => paramRow.severity === "critical").length;
    lines.push(
      `| ${row.className} | ${formatProtocolForReport(row.leftProtocol)} | ${formatProtocolForReport(row.rightProtocol)} | ${row.matchType} | ${row.matchScore}% | ${row.paramDiffRows.length} | ${criticalCount} |`,
    );
  });
  lines.push("");

  if (criticalRows.length) {
    lines.push("## Critical parameter differences");
    criticalRows.slice(0, 15).forEach((row) => {
      const criticalParams = row.paramDiffRows.filter((paramRow) => paramRow.severity === "critical");
      lines.push("");
      lines.push(`### ${row.className}`);
      lines.push(`Left: ${formatProtocolForReport(row.leftProtocol)}`);
      lines.push(`Right: ${formatProtocolForReport(row.rightProtocol)}`);
      lines.push("");
      lines.push("| Category | Parameter | Left value | Right value |");
      lines.push("| --- | --- | --- | --- |");
      criticalParams.slice(0, 20).forEach((paramRow) => {
        lines.push(
          `| ${paramCategoryLabels[paramRow.category]} | ${paramRow.label} | ${formatParamValueForReport(paramRow.leftValue)} | ${formatParamValueForReport(paramRow.rightValue)} |`,
        );
      });
    });
    lines.push("");
  }

  return lines.join("\n");
}

function getReportFileName(comparison: CompareResult): string {
  const left = getSafeFileName(comparison.left.title);
  const right = getSafeFileName(comparison.right.title);
  return `project-comparison-${left}-vs-${right}.md`;
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("Clipboard is not available");
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Clipboard copy failed");
  }
}

function downloadTextFile(fileName: string, content: string): void {
  if (typeof document === "undefined") return;

  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function InsightPanel(props: { insights: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/70">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-950 dark:text-white">Scientific summary</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Auto-generated from smart workflow matching and loaded metadata.
          </p>
        </div>
        <span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200">
          Smart diff
        </span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {props.insights.map((insight, index) => (
          <div
            key={`${index}:${insight}`}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          >
            {insight}
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportActions(props: { comparison: CompareResult }) {
  const [status, setStatus] = useState<ReportActionStatus>("idle");
  const report = useMemo(() => buildComparisonReportMarkdown(props.comparison), [props.comparison]);
  const fileName = useMemo(() => getReportFileName(props.comparison), [props.comparison]);

  const resetStatus = () => window.setTimeout(() => setStatus("idle"), 1800);

  const handleCopy = async () => {
    try {
      await copyTextToClipboard(report);
      setStatus("copied");
      resetStatus();
    } catch {
      setStatus("error");
      resetStatus();
    }
  };

  const handleExportPdf = () => {
    try {
      openPrintableComparisonReport({
        title: "Project comparison report",
        subtitle: `${props.comparison.left.title} vs ${props.comparison.right.title}`,
        markdown: report,
        fileName: fileName.replace(/\.md$/i, ".pdf"),
      });

      setStatus("pdf");
      resetStatus();
    } catch {
      setStatus("error");
      resetStatus();
    }
  };

  const handleExportMarkdown = () => {
    downloadTextFile(fileName, report);
    setStatus("downloaded");
    resetStatus();
  };

  const statusLabel =
    status === "copied"
      ? "Copied"
      : status === "pdf"
        ? "PDF opened"
        : status === "downloaded"
          ? "Markdown downloaded"
          : "Failed";

  const buttonClass =
    "inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-slate-600 hover:text-white";

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button type="button" onClick={handleCopy} className={buttonClass}>
        <Copy className="h-3.5 w-3.5" />
        Copy
      </button>
      <button type="button" onClick={handleExportPdf} className={buttonClass}>
        <Download className="h-3.5 w-3.5" />
        PDF
      </button>
      <button type="button" onClick={handleExportMarkdown} className={buttonClass}>
        <Download className="h-3.5 w-3.5" />
        Markdown
      </button>
      {status !== "idle" ? (
        <span
          className={classNames(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
            status === "error"
              ? "border-red-400/60 bg-red-950/40 text-red-100"
              : "border-emerald-400/60 bg-emerald-950/40 text-emerald-100",
          )}
        >
          {status === "error" ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" />}
          {statusLabel}
        </span>
      ) : null}
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

function CompactSummaryItem(props: { label: string; value: string | number; hint?: string; tone?: "default" | "warning" | "danger" }) {
  const toneClass =
    props.tone === "danger"
      ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
      : props.tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
        : "border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

  return (
    <div className={classNames("min-w-0 rounded-xl border px-3 py-2", toneClass)}>
      <div className="truncate text-[10px] font-bold uppercase tracking-wide opacity-70">{props.label}</div>
      <div className="mt-0.5 truncate text-lg font-bold">{props.value}</div>
      {props.hint ? <div className="mt-0.5 truncate text-[11px] font-medium opacity-75">{props.hint}</div> : null}
    </div>
  );
}

function CompactProjectSnapshot(props: { label: string; project: ProjectSummary }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{props.label}</div>
      <div className="mt-0.5 truncate text-sm font-bold text-slate-950 dark:text-white" title={props.project.fullTitle}>
        {props.project.title}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        <span>{props.project.protocolCount} protocols</span>
        <span>{props.project.outputCount} outputs</span>
      </div>
    </div>
  );
}

function CompactComparisonSummary(props: { comparison: CompareResult }) {
  const changedRows = props.comparison.protocolRows.filter((row) => row.matchType === "changed").length;
  const criticalRows = props.comparison.protocolRows.filter(hasCriticalParamDiff).length;
  const onlyLeftRows = props.comparison.protocolRows.filter((row) => row.matchType === "only-left").length;
  const onlyRightRows = props.comparison.protocolRows.filter((row) => row.matchType === "only-right").length;
  const weakRows = props.comparison.protocolRows.filter((row) => row.matchQuality === "weak").length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-100/70 p-3 dark:border-slate-700 dark:bg-slate-900/70">
      <div className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1.1fr)_repeat(5,minmax(110px,0.7fr))_minmax(0,1.1fr)]">
        <CompactProjectSnapshot label="Left project" project={props.comparison.left} />
        <CompactSummaryItem label="Similarity" value={`${props.comparison.similarityScore}%`} />
        <CompactSummaryItem label="Rows" value={props.comparison.protocolRows.length} />
        <CompactSummaryItem label="Changed" value={changedRows} tone={changedRows ? "warning" : "default"} />
        <CompactSummaryItem label="Critical params" value={criticalRows} tone={criticalRows ? "danger" : "default"} />
        <CompactSummaryItem label="Only left/right" value={`${onlyLeftRows}/${onlyRightRows}`} hint={weakRows ? `${weakRows} weak matches` : undefined} />
        <CompactProjectSnapshot label="Right project" project={props.comparison.right} />
      </div>
    </div>
  );
}

function AdvancedComparisonDetails(props: { comparison: CompareResult }) {
  return (
    <details className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-900">
        Advanced comparison details
      </summary>

      <div className="space-y-4 border-t border-slate-200 p-4 dark:border-slate-700">
        <InsightPanel insights={props.comparison.insights} />

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-slate-950">
            <h3 className="text-sm font-bold text-gray-950 dark:text-white">Common protocol classes</h3>
            <p className="mb-3 mt-1 text-xs text-gray-500 dark:text-gray-400">Classes present in both projects.</p>
            <ChipList items={props.comparison.commonClasses} emptyText="No shared protocol classes." tone="green" />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-slate-950">
            <h3 className="text-sm font-bold text-gray-950 dark:text-white">Only in left project</h3>
            <p className="mb-3 mt-1 text-xs text-gray-500 dark:text-gray-400">Protocol classes unique to the left project.</p>
            <ChipList items={props.comparison.onlyLeftClasses} emptyText="No unique protocol classes." tone="amber" />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-slate-950">
            <h3 className="text-sm font-bold text-gray-950 dark:text-white">Only in right project</h3>
            <p className="mb-3 mt-1 text-xs text-gray-500 dark:text-gray-400">Protocol classes unique to the right project.</p>
            <ChipList items={props.comparison.onlyRightClasses} emptyText="No unique protocol classes." tone="amber" />
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
                  {props.comparison.classDeltas.map((row) => (
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
                  {props.comparison.statusRows.map((row) => (
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
    </details>
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
    return <span className="whitespace-nowrap text-[11px] text-gray-400 dark:text-gray-500">No match</span>;
  }

  const tone =
    props.quality === "strong"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"
      : props.quality === "likely"
        ? "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200"
        : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200";

  return (
    <span className={classNames("inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize", tone)}>
      <span>{props.quality}</span>
      <span className="mx-1 opacity-70">·</span>
      <span>{props.score}%</span>
    </span>
  );
}

function SeverityBadge(props: { severity: ParamDiffSeverity }) {
  const tone =
    props.severity === "critical"
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
      : props.severity === "important"
        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
        : "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-slate-900 dark:text-gray-300";

  return (
    <span className={classNames("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize", tone)}>
      {props.severity}
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

function groupParamComparisonRows(rows: ParamComparisonRow[]): Array<{ category: ParamDiffCategory; rows: ParamComparisonRow[] }> {
  return paramCategoryOrder
    .map((category) => ({
      category,
      rows: rows.filter((row) => row.category === category),
    }))
    .filter((group) => group.rows.length > 0);
}

function ParamFilterButton(props: {
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
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
        props.active
          ? "border-slate-700 bg-slate-800 text-white shadow-sm shadow-slate-500/20"
          : "border-gray-200 bg-white text-gray-700 hover:border-slate-300 hover:bg-slate-50 dark:border-gray-700 dark:bg-slate-950 dark:text-gray-200 dark:hover:border-slate-600 dark:hover:bg-slate-800",
      )}
    >
      <span>{props.label}</span>
      <span className={classNames("rounded-full px-1 py-0.5 text-[10px]", props.active ? "bg-white/20" : "bg-gray-100 dark:bg-slate-800")}>
        {props.count}
      </span>
    </button>
  );
}

function ProtocolParamsCard(props: { label: string; protocol?: ProtocolSummary }) {
  if (!props.protocol) {
    return (
      <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-slate-950">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
          {props.label}
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500">Missing protocol</span>
      </div>
    );
  }

  return (
    <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-slate-950">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {props.label}
      </div>
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
        <span>·</span>
        <span>{Object.keys(props.protocol.params).length} params in project payload</span>
      </div>
    </div>
  );
}

function ProtocolParamsComparisonDialog(props: {
  open: boolean;
  row: ProtocolComparisonRow | null;
  leftTitle: string;
  rightTitle: string;
  leftProjectName: string;
  rightProjectName: string;
  onClose: () => void;
  fetchProtocolDetails?: (projectName: string, protocolId: string) => Promise<any>;
}) {
  const [loadedRows, setLoadedRows] = useState<ParamComparisonRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<ParamComparisonFilter>("all");
  const [query, setQuery] = useState("");
  const detailsCacheRef = useRef(new Map<string, Promise<any>>());

  const fallbackRows = useMemo(() => {
    if (!props.row) return [];
    return getParamComparisonRows(
      props.row.leftProtocol?.params ?? {},
      props.row.rightProtocol?.params ?? {},
      props.row.leftProtocol?.paramLabels ?? {},
      props.row.rightProtocol?.paramLabels ?? {},
    );
  }, [props.row?.key]);

  useEffect(() => {
    if (!props.open) return;
    setLoadedRows(null);
    setLoading(false);
    setErrorMessage(null);
    setActiveFilter("all");
    setQuery("");
  }, [props.open, props.row?.key]);

  useEffect(() => {
    const row = props.row;
    const fetchProtocolDetails = props.fetchProtocolDetails;

    if (!props.open || !row || !fetchProtocolDetails || !row.leftProtocol || !row.rightProtocol) {
      return;
    }

    const leftProtocol = row.leftProtocol;
    const rightProtocol = row.rightProtocol;
    const leftRequest = { projectName: props.leftProjectName, protocolId: String(leftProtocol.id) };
    const rightRequest = { projectName: props.rightProjectName, protocolId: String(rightProtocol.id) };
    let cancelled = false;

    const getCachedProtocolDetails = (projectName: string, protocolId: string): Promise<any> => {
      const cacheKey = `${projectName}:${protocolId}`;
      const cached = detailsCacheRef.current.get(cacheKey);

      if (cached) return cached;

      const request = fetchProtocolDetails(projectName, protocolId).catch((err) => {
        detailsCacheRef.current.delete(cacheKey);
        throw err;
      });

      detailsCacheRef.current.set(cacheKey, request);
      return request;
    };

    const loadProtocolDetails = async () => {
      setLoading(true);
      setErrorMessage(null);

      try {
        const [leftDetails, rightDetails] = await Promise.all([
          getCachedProtocolDetails(leftRequest.projectName, leftRequest.protocolId),
          getCachedProtocolDetails(rightRequest.projectName, rightRequest.protocolId),
        ]);

        if (cancelled) return;

        const fullRows = getParamComparisonRows(
          extractProtocolParams(leftDetails),
          extractProtocolParams(rightDetails),
          extractProtocolParamLabels(leftDetails),
          extractProtocolParamLabels(rightDetails),
        );

        setLoadedRows(fullRows.length ? fullRows : null);
      } catch (err: any) {
        if (cancelled) return;
        setLoadedRows(null);
        setErrorMessage(err?.message ?? String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadProtocolDetails();

    return () => {
      cancelled = true;
    };
  }, [
    props.open,
    props.row?.key,
    props.leftProjectName,
    props.rightProjectName,
    props.fetchProtocolDetails,
  ]);

  if (!props.open || !props.row) return null;

  const rows = loadedRows ?? fallbackRows;
  const normalizedQuery = normalizeComparableText(query);
  const changedRows = rows.filter((row) => row.changed);
  const filterOptions: Array<{ id: ParamComparisonFilter; label: string; count: number }> = [
    { id: "all", label: "All params", count: rows.length },
    { id: "changed", label: "Different", count: changedRows.length },
    { id: "critical", label: "Critical", count: changedRows.filter((row) => row.severity === "critical").length },
    { id: "important", label: "Important", count: changedRows.filter((row) => row.severity === "important").length },
    { id: "minor", label: "Minor", count: changedRows.filter((row) => row.severity === "minor").length },
  ];

  const filteredRows = rows.filter((row) => {
    const matchesFilter =
      activeFilter === "all"
        ? true
        : activeFilter === "changed"
          ? row.changed
          : row.changed && row.severity === activeFilter;

    if (!matchesFilter) return false;

    if (!normalizedQuery) return true;

    const searchableText = normalizeComparableText(
      `${row.label} ${row.name} ${row.leftValue} ${row.rightValue} ${paramCategoryLabels[row.category]}`,
    );

    return searchableText.includes(normalizedQuery);
  });

  const groupedRows = groupParamComparisonRows(filteredRows);
  const detailsSourceLabel = loadedRows ? "full protocol details" : "project payload";

  return (
    <div className="pointer-events-none fixed left-1/2 top-1/2 z-[160] w-[calc(100vw-2rem)] max-w-6xl -translate-x-1/2 -translate-y-1/2">
      <div
        className="pointer-events-auto flex h-[88vh] max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-700 bg-slate-800 px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold tracking-tight text-white">
              Compare protocol parameters
            </h3>
            <p className="mt-1 text-sm text-slate-300">
              {props.row.className} · <span className="font-semibold text-white">{rows.length}</span> parameters · <span className="font-semibold text-white">{changedRows.length}</span> different values · source: {detailsSourceLabel}
            </p>
          </div>

          <button
            type="button"
            onClick={props.onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-600 bg-slate-700 text-slate-200 transition hover:bg-slate-600 hover:text-white"
            aria-label="Close parameter comparison"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 px-5 py-4 dark:bg-slate-900">
          <div className="grid gap-3 lg:grid-cols-2">
            <ProtocolParamsCard label={`Left · ${props.leftTitle}`} protocol={props.row.leftProtocol} />
            <ProtocolParamsCard label={`Right · ${props.rightTitle}`} protocol={props.row.rightProtocol} />
          </div>

          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-slate-950 lg:flex-row lg:items-center lg:justify-between">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search parameter labels or values..."
              className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-900 outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/10 dark:border-gray-700 dark:bg-slate-900 dark:text-white"
            />

            <div className="flex flex-wrap gap-1.5">
              {filterOptions.map((option) => (
                <ParamFilterButton
                  key={option.id}
                  active={activeFilter === option.id}
                  label={option.label}
                  count={option.count}
                  onClick={() => setActiveFilter(option.id)}
                />
              ))}
            </div>
          </div>

          {loading ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-600 dark:border-gray-700 dark:bg-slate-950 dark:text-gray-300">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Loading full protocol details...
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              Could not load full protocol details. Showing project payload values instead. {errorMessage}
            </div>
          ) : null}

          {!filteredRows.length ? (
            <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500 dark:border-gray-700 dark:bg-slate-950 dark:text-gray-400">
              No parameters match the current filters.
            </div>
          ) : (
            <div className="mt-3 max-h-[58vh] overflow-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-slate-950">
              <table className="w-full min-w-[1100px] table-fixed text-left text-xs">
                <thead className="sticky top-0 z-20 bg-slate-200 uppercase tracking-wide text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300">
                  <tr>
                    <th className="w-[18%] px-3 py-2">Category</th>
                    <th className="w-[24%] px-3 py-2">Parameter label</th>
                    <th className="w-[25%] px-3 py-2">Left value</th>
                    <th className="w-[25%] px-3 py-2">Right value</th>
                    <th className="w-[8%] px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-slate-950">
                  {groupedRows.flatMap((group) => [
                    <tr key={`${group.category}:heading`}>
                      <td colSpan={5} className="sticky top-[33px] z-10 bg-slate-100 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {paramCategoryLabels[group.category]}
                      </td>
                    </tr>,
                    ...group.rows.map((row) => (
                      <tr key={`${group.category}:${row.name}`} className={row.changed ? "" : "opacity-70"}>
                        <td className="break-words px-3 py-2 text-gray-600 dark:text-gray-300">{paramCategoryLabels[row.category]}</td>
                        <td className="break-words px-3 py-2 font-semibold text-gray-900 dark:text-gray-100" title={row.name}>{row.label}</td>
                        <td className={classNames("break-words px-3 py-2 text-gray-700 dark:text-gray-300", row.changed && "bg-amber-50/60 dark:bg-amber-950/10")}>
                          {row.leftValue || "—"}
                        </td>
                        <td className={classNames("break-words px-3 py-2 text-gray-700 dark:text-gray-300", row.changed && "bg-amber-50/60 dark:bg-amber-950/10")}>
                          {row.rightValue || "—"}
                        </td>
                        <td className="px-3 py-2">
                          {row.changed ? (
                            <SeverityBadge severity={row.severity} />
                          ) : (
                            <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-semibold text-gray-500 dark:border-gray-700 dark:bg-slate-900 dark:text-gray-400">
                              same
                            </span>
                          )}
                        </td>
                      </tr>
                    )),
                  ])}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getFilterCounts(rows: ProtocolComparisonRow[]): Record<ComparisonFilter, number> {
  return {
    all: rows.length,
    changed: rows.filter((row) => row.matchType === "changed").length,
    "param-diff": rows.filter((row) => row.paramDiffRows.length > 0).length,
    "critical-param": rows.filter(hasCriticalParamDiff).length,
    "only-left": rows.filter((row) => row.matchType === "only-left").length,
    "only-right": rows.filter((row) => row.matchType === "only-right").length,
    shared: rows.filter((row) => row.matchType === "shared").length,
    weak: rows.filter((row) => row.matchQuality === "weak").length,
  };
}

function filterProtocolRows(rows: ProtocolComparisonRow[], filter: ComparisonFilter): ProtocolComparisonRow[] {
  if (filter === "all") return rows;
  if (filter === "param-diff") return rows.filter((row) => row.paramDiffRows.length > 0);
  if (filter === "critical-param") return rows.filter(hasCriticalParamDiff);
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
          ? "border-slate-700 bg-slate-800 text-white shadow-sm shadow-slate-500/20"
          : "border-gray-200 bg-white text-gray-700 hover:border-slate-300 hover:bg-slate-50 dark:border-gray-700 dark:bg-slate-950 dark:text-gray-200 dark:hover:border-slate-600 dark:hover:bg-slate-800",
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
  onCompareParams: (row: ProtocolComparisonRow) => void;
}) {
  const [activeFilter, setActiveFilter] = useState<ComparisonFilter>("all");

  const filterCounts = useMemo(() => getFilterCounts(props.rows), [props.rows]);
  const filteredRows = useMemo(() => filterProtocolRows(props.rows, activeFilter), [props.rows, activeFilter]);

  if (!props.rows.length) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No comparable protocols found.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <FilterButton active={activeFilter === "all"} label="All" count={filterCounts.all} onClick={() => setActiveFilter("all")} />
        <FilterButton active={activeFilter === "changed"} label="Changed" count={filterCounts.changed} onClick={() => setActiveFilter("changed")} />
        <FilterButton active={activeFilter === "param-diff"} label="Param diff" count={filterCounts["param-diff"]} onClick={() => setActiveFilter("param-diff")} />
        <FilterButton active={activeFilter === "critical-param"} label="Critical params" count={filterCounts["critical-param"]} onClick={() => setActiveFilter("critical-param")} />
        <FilterButton active={activeFilter === "only-left"} label="Only left" count={filterCounts["only-left"]} onClick={() => setActiveFilter("only-left")} />
        <FilterButton active={activeFilter === "only-right"} label="Only right" count={filterCounts["only-right"]} onClick={() => setActiveFilter("only-right")} />
        <FilterButton active={activeFilter === "shared"} label="Shared" count={filterCounts.shared} onClick={() => setActiveFilter("shared")} />
        <FilterButton active={activeFilter === "weak"} label="Weak match" count={filterCounts.weak} onClick={() => setActiveFilter("weak")} />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="max-h-[62vh] overflow-auto">
          <table className="w-full min-w-[1120px] table-fixed text-left text-sm">
            <thead className="sticky top-0 z-20 bg-gray-100 text-xs uppercase tracking-wide text-gray-500 shadow-sm dark:bg-slate-900 dark:text-gray-400">
              <tr>
                <th className="w-[18%] px-3 py-2">Protocol class</th>
                <th className="w-[25%] px-3 py-2"><span className="block truncate" title={props.leftTitle}>{props.leftTitle}</span></th>
                <th className="w-[25%] px-3 py-2"><span className="block truncate" title={props.rightTitle}>{props.rightTitle}</span></th>
                <th className="w-[12%] px-3 py-2 text-right">Params</th>
                <th className="w-[9%] px-3 py-2">Match</th>
                <th className="w-[11%] px-3 py-2">Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-slate-950">
              {filteredRows.map((row) => {
                const canCompareParams = Boolean(row.leftProtocol || row.rightProtocol);
                const totalParamCount = new Set([
                  ...Object.keys(row.leftProtocol?.params ?? {}),
                  ...Object.keys(row.rightProtocol?.params ?? {}),
                ]).size;
                const criticalRows = row.paramDiffRows.filter((paramRow) => paramRow.severity === "critical").length;
                const paramLabel = totalParamCount
                  ? `Compare params (${totalParamCount}${row.paramDiffRows.length ? ` · ${row.paramDiffRows.length} diff` : ""}${criticalRows ? ` · ${criticalRows} critical` : ""})`
                  : "Compare params";

                return (
                  <tr key={row.key}>
                    <td className="px-3 py-3 align-top">
                      <div className="truncate font-semibold text-gray-900 dark:text-gray-100" title={row.className}>{row.className}</div>
                    </td>
                    <td className="px-3 py-3 align-top"><ProtocolCell protocol={row.leftProtocol} /></td>
                    <td className="px-3 py-3 align-top"><ProtocolCell protocol={row.rightProtocol} /></td>
                    <td className="px-3 py-3 text-right align-top">
                      <button
                        type="button"
                        onClick={() => props.onCompareParams(row)}
                        disabled={!canCompareParams}
                        className={classNames(
                          "max-w-full rounded-lg border px-2 py-1 text-xs font-semibold transition",
                          canCompareParams
                            ? criticalRows
                              ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200 dark:hover:bg-red-950/50"
                              : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-slate-900 dark:text-gray-200 dark:hover:bg-slate-800"
                            : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-700 dark:bg-slate-800 dark:text-gray-500",
                        )}
                        title="Open parameter comparison"
                      >
                        <span className="block truncate">{paramLabel}</span>
                      </button>
                    </td>
                    <td className="px-3 py-3 align-top"><MatchBadge matchType={row.matchType} /></td>
                    <td className="whitespace-nowrap px-3 py-3 align-top"><ConfidenceBadge score={row.matchScore} quality={row.matchQuality} /></td>
                  </tr>
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
  const [paramDialogRow, setParamDialogRow] = useState<ProtocolComparisonRow | null>(null);

  const orderedTabs = useMemo(() => tabs.filter((tab) => tab.projectName), [tabs]);
  const tabsSignature = useMemo(
    () => orderedTabs.map((tab) => `${tab.id}:${tab.projectName}:${tab.title}`).join("|"),
    [orderedTabs],
  );
  const leftTab = orderedTabs.find((tab) => tab.projectName === leftProjectName) ?? orderedTabs[0];
  const rightTab = orderedTabs.find((tab) => tab.projectName === rightProjectName) ?? orderedTabs[1] ?? orderedTabs[0];
  const leftProjectKey = leftTab?.projectName ?? "";
  const rightProjectKey = rightTab?.projectName ?? "";
  const canCompare = Boolean(leftTab && rightTab && leftProjectKey !== rightProjectKey);

  useEffect(() => {
    if (!open) return;
    const first = orderedTabs[0]?.projectName ?? "";
    const second = orderedTabs[1]?.projectName ?? "";

    setLeftProjectName((current) => current || first);
    setRightProjectName((current) => current || second || first);
  }, [open, tabsSignature]);

  useEffect(() => {
    if (!open) setParamDialogRow(null);
  }, [open]);

  useEffect(() => {
    setParamDialogRow(null);
  }, [leftProjectName, rightProjectName]);

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
        setErrorMessage(err?.message ?? String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadComparison();

    return () => {
      cancelled = true;
    };
  }, [open, canCompare, leftProjectKey, rightProjectKey, fetchProject]);

  if (!open) return null;

  return (
    <>
      <div className="pointer-events-none fixed left-1/2 top-1/2 z-[120] w-[calc(100vw-2rem)] max-w-7xl -translate-x-1/2 -translate-y-1/2">
        <div className="pointer-events-auto flex h-[90vh] max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-slate-300 bg-gray-50 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-700 bg-slate-800 px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-lg font-bold tracking-tight text-white">Compare projects</h2>
              <p className="mt-1 text-sm text-slate-300">
                Smart workflow comparison focused on protocol and parameter differences.
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {comparison ? <ReportActions comparison={comparison} /> : null}
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-600 bg-slate-700 text-slate-200 transition hover:bg-slate-600 hover:text-white"
                aria-label="Close comparison"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
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
            ) : errorMessage ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                Could not compare projects: {errorMessage}
              </div>
            ) : comparison ? (
              <div className="space-y-4">
                {loading ? (
                  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Refreshing project comparison...
                  </div>
                ) : null}

                <CompactComparisonSummary comparison={comparison} />

                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-slate-950">
                  <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-gray-950 dark:text-white">Protocol-level workflow diff</h3>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Review matched protocols and open Compare params for the full parameter table.
                      </p>
                    </div>
                  </div>
                  <ProtocolDiffTable
                    rows={comparison.protocolRows}
                    leftTitle={comparison.left.title}
                    rightTitle={comparison.right.title}
                    onCompareParams={(row) => setParamDialogRow(row)}
                  />
                </div>

                <AdvancedComparisonDetails comparison={comparison} />
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-700 dark:border-gray-700 dark:bg-slate-950 dark:text-gray-200">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Loading project comparison...
              </div>
            )}
          </div>
        </div>
      </div>

      <ProtocolParamsComparisonDialog
        open={Boolean(paramDialogRow)}
        row={paramDialogRow}
        leftTitle={comparison?.left.title ?? leftTab?.title ?? "Left project"}
        rightTitle={comparison?.right.title ?? rightTab?.title ?? "Right project"}
        leftProjectName={leftProjectKey}
        rightProjectName={rightProjectKey}
        fetchProtocolDetails={fetchProtocolDetails}
        onClose={() => setParamDialogRow(null)}
      />
    </>
  );
}