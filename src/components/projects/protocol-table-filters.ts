import type { ExtraTableColumnType } from "@/types/extraTableColumns";

export type ProtocolTableFilterOperator =
  | "contains"
  | "equals"
  | "notEquals"
  | "greaterThan"
  | "greaterOrEqual"
  | "lessThan"
  | "lessOrEqual"
  | "between"
  | "before"
  | "after"
  | "isTrue"
  | "isFalse"
  | "isEmpty"
  | "isNotEmpty";

export type ProtocolTableColumnFilter = {
  operator: ProtocolTableFilterOperator;
  value?: string;
  valueTo?: string;
};

export type ProtocolTableColumnFilters = Record<string, ProtocolTableColumnFilter>;

export type ProtocolTableFilterOperatorOption = {
  value: ProtocolTableFilterOperator;
  label: string;
};

const FILTER_OPERATORS: Record<ExtraTableColumnType, ProtocolTableFilterOperatorOption[]> = {
  text: [
    { value: "contains", label: "Contains" },
    { value: "equals", label: "Equals" },
    { value: "notEquals", label: "Does not equal" },
    { value: "isEmpty", label: "Is empty" },
    { value: "isNotEmpty", label: "Is not empty" },
  ],
  number: [
    { value: "equals", label: "Equals" },
    { value: "greaterThan", label: "Greater than" },
    { value: "greaterOrEqual", label: "Greater than or equal" },
    { value: "lessThan", label: "Less than" },
    { value: "lessOrEqual", label: "Less than or equal" },
    { value: "between", label: "Between" },
    { value: "isEmpty", label: "Is empty" },
    { value: "isNotEmpty", label: "Is not empty" },
  ],
  datetime: [
    { value: "after", label: "After" },
    { value: "before", label: "Before" },
    { value: "between", label: "Between" },
    { value: "isEmpty", label: "Is empty" },
    { value: "isNotEmpty", label: "Is not empty" },
  ],
  duration: [
    { value: "greaterThan", label: "Greater than" },
    { value: "greaterOrEqual", label: "Greater than or equal" },
    { value: "lessThan", label: "Less than" },
    { value: "lessOrEqual", label: "Less than or equal" },
    { value: "between", label: "Between" },
    { value: "isEmpty", label: "Is empty" },
    { value: "isNotEmpty", label: "Is not empty" },
  ],
  bytes: [
    { value: "greaterThan", label: "Greater than" },
    { value: "greaterOrEqual", label: "Greater than or equal" },
    { value: "lessThan", label: "Less than" },
    { value: "lessOrEqual", label: "Less than or equal" },
    { value: "between", label: "Between" },
    { value: "isEmpty", label: "Is empty" },
    { value: "isNotEmpty", label: "Is not empty" },
  ],
  boolean: [
    { value: "isTrue", label: "Is true" },
    { value: "isFalse", label: "Is false" },
    { value: "isEmpty", label: "Is empty" },
    { value: "isNotEmpty", label: "Is not empty" },
  ],
};

const VALID_FILTER_OPERATORS = new Set<ProtocolTableFilterOperator>([
  "contains",
  "equals",
  "notEquals",
  "greaterThan",
  "greaterOrEqual",
  "lessThan",
  "lessOrEqual",
  "between",
  "before",
  "after",
  "isTrue",
  "isFalse",
  "isEmpty",
  "isNotEmpty",
]);

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

function parseNumberValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const text = String(value ?? "").trim();
  if (!text) return null;

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseByteValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const text = String(value ?? "").trim();
  if (!text) return null;

  const match = /^(-?\d+(?:\.\d+)?)\s*(b|kb|kib|mb|mib|gb|gib|tb|tib|pb|pib)?$/i.exec(text);
  if (!match) return null;

  const numberValue = Number(match[1]);
  if (!Number.isFinite(numberValue)) return null;

  const unit = String(match[2] ?? "b").toLowerCase();
  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1024,
    kib: 1024,
    mb: 1024 ** 2,
    mib: 1024 ** 2,
    gb: 1024 ** 3,
    gib: 1024 ** 3,
    tb: 1024 ** 4,
    tib: 1024 ** 4,
    pb: 1024 ** 5,
    pib: 1024 ** 5,
  };

  return numberValue * multipliers[unit];
}

function parseDurationValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;

  if (/^-?\d+(?:\.\d+)?$/.test(text)) {
    const seconds = Number(text);
    return Number.isFinite(seconds) ? seconds : null;
  }

  const tokenPattern = /(-?\d+(?:\.\d+)?)\s*(d|h|m|s)/gi;
  const multipliers: Record<string, number> = { d: 86400, h: 3600, m: 60, s: 1 };

  let totalSeconds = 0;
  let matched = false;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(text)) !== null) {
    if (text.slice(lastIndex, match.index).trim()) return null;

    const numberValue = Number(match[1]);
    if (!Number.isFinite(numberValue)) return null;

    totalSeconds += numberValue * multipliers[match[2].toLowerCase()];
    lastIndex = tokenPattern.lastIndex;
    matched = true;
  }

  if (!matched || text.slice(lastIndex).trim()) return null;

  return totalSeconds;
}

function parseDateValue(value: unknown): number | null {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }

  const date = new Date(String(value ?? ""));
  const time = date.getTime();

  return Number.isFinite(time) ? time : null;
}

function parseComparableValue(type: ExtraTableColumnType, value: unknown): number | null {
  if (type === "number") return parseNumberValue(value);
  if (type === "bytes") return parseByteValue(value);
  if (type === "duration") return parseDurationValue(value);
  if (type === "datetime") return parseDateValue(value);

  return null;
}

function parseBooleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;

  const normalized = String(value ?? "").trim().toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;

  return null;
}

function getOperatorDescription(operator: ProtocolTableFilterOperator): string {
  if (operator === "contains") return "contains";
  if (operator === "equals") return "=";
  if (operator === "notEquals") return "≠";
  if (operator === "greaterThan") return ">";
  if (operator === "greaterOrEqual") return "≥";
  if (operator === "lessThan") return "<";
  if (operator === "lessOrEqual") return "≤";
  if (operator === "between") return "between";
  if (operator === "before") return "before";
  if (operator === "after") return "after";
  if (operator === "isTrue") return "is true";
  if (operator === "isFalse") return "is false";
  if (operator === "isEmpty") return "is empty";
  if (operator === "isNotEmpty") return "is not empty";

  return operator;
}

function formatCriterion(type: ExtraTableColumnType, value: string | undefined): string {
  const text = String(value ?? "").trim();

  if (type === "datetime") return text.replace("T", " ");
  if (type === "text") return `"${text}"`;

  return text;
}

export function getProtocolTableFilterOperators(type: ExtraTableColumnType): ProtocolTableFilterOperatorOption[] {
  return FILTER_OPERATORS[type];
}

export function getDefaultProtocolTableFilterOperator(type: ExtraTableColumnType): ProtocolTableFilterOperator {
  return FILTER_OPERATORS[type][0].value;
}

export function protocolTableFilterNeedsValue(operator: ProtocolTableFilterOperator): boolean {
  return !["isTrue", "isFalse", "isEmpty", "isNotEmpty"].includes(operator);
}

export function protocolTableFilterNeedsSecondValue(operator: ProtocolTableFilterOperator): boolean {
  return operator === "between";
}

export function isProtocolTableFilterValid(type: ExtraTableColumnType, filter: ProtocolTableColumnFilter): boolean {
  const operators = FILTER_OPERATORS[type];

  if (!operators.some((option) => option.value === filter.operator)) return false;
  if (!protocolTableFilterNeedsValue(filter.operator)) return true;

  if (type === "text") {
    if (!String(filter.value ?? "").trim()) return false;
  } else if (parseComparableValue(type, filter.value) === null) {
    return false;
  }

  if (protocolTableFilterNeedsSecondValue(filter.operator)) {
    if (type === "text") return Boolean(String(filter.valueTo ?? "").trim());
    return parseComparableValue(type, filter.valueTo) !== null;
  }

  return true;
}

export function matchesProtocolTableFilter(rawValue: unknown, type: ExtraTableColumnType, filter: ProtocolTableColumnFilter): boolean {
  const empty = isEmptyValue(rawValue);

  if (filter.operator === "isEmpty") return empty;
  if (filter.operator === "isNotEmpty") return !empty;
  if (empty) return false;

  if (!isProtocolTableFilterValid(type, filter)) return true;

  if (type === "boolean") {
    const booleanValue = parseBooleanValue(rawValue);

    if (filter.operator === "isTrue") return booleanValue === true;
    if (filter.operator === "isFalse") return booleanValue === false;

    return true;
  }

  if (type === "text") {
    const actual = String(rawValue).trim().toLowerCase();
    const expected = String(filter.value ?? "").trim().toLowerCase();

    if (filter.operator === "contains") return actual.includes(expected);
    if (filter.operator === "equals") return actual === expected;
    if (filter.operator === "notEquals") return actual !== expected;

    return true;
  }

  const actual = parseComparableValue(type, rawValue);
  const expected = parseComparableValue(type, filter.value);

  if (actual === null || expected === null) return false;

  if (filter.operator === "equals") return actual === expected;
  if (filter.operator === "greaterThan") return actual > expected;
  if (filter.operator === "greaterOrEqual") return actual >= expected;
  if (filter.operator === "lessThan") return actual < expected;
  if (filter.operator === "lessOrEqual") return actual <= expected;
  if (filter.operator === "before") return actual < expected;
  if (filter.operator === "after") return actual > expected;

  if (filter.operator === "between") {
    const expectedTo = parseComparableValue(type, filter.valueTo);
    if (expectedTo === null) return true;

    const lower = Math.min(expected, expectedTo);
    const upper = Math.max(expected, expectedTo);

    return actual >= lower && actual <= upper;
  }

  return true;
}

export function describeProtocolTableFilter(label: string, type: ExtraTableColumnType, filter: ProtocolTableColumnFilter): string {
  const operator = getOperatorDescription(filter.operator);

  if (!protocolTableFilterNeedsValue(filter.operator)) return `${label} ${operator}`;

  const value = formatCriterion(type, filter.value);

  if (protocolTableFilterNeedsSecondValue(filter.operator)) {
    const valueTo = formatCriterion(type, filter.valueTo);
    return `${label} ${operator} ${value} and ${valueTo}`;
  }

  return `${label} ${operator} ${value}`;
}

export function normalizeStoredProtocolTableFilters(raw: unknown): ProtocolTableColumnFilters {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const result: ProtocolTableColumnFilters = {};

  for (const [columnId, rawFilter] of Object.entries(raw)) {
    if (!rawFilter || typeof rawFilter !== "object" || Array.isArray(rawFilter)) continue;

    const candidate = rawFilter as Record<string, unknown>;
    const operator = String(candidate.operator ?? "") as ProtocolTableFilterOperator;

    if (!VALID_FILTER_OPERATORS.has(operator)) continue;

    result[columnId] = {
      operator,
      ...(candidate.value !== undefined && candidate.value !== null ? { value: String(candidate.value) } : {}),
      ...(candidate.valueTo !== undefined && candidate.valueTo !== null ? { valueTo: String(candidate.valueTo) } : {}),
    };
  }

  return result;
}