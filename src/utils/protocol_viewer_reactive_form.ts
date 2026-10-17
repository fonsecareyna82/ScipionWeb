/**
 * Bounded local-only condition evaluation for trusted-plugin viewer form schemas.
 * Rules are validated as inert data; no JavaScript evaluation, network writes or
 * visualization callbacks are possible here.
 */
import { describeProtocolViewerPreview } from "@/utils/protocol_viewer_preview";
import type { RuntimeViewerField, RuntimeViewerSection } from "@/utils/protocol_viewer_runtime_preview";

export type ViewerConditionRule =
  | {op: "const"; value: string | number | boolean | null}
  | {op: "field"; name: string}
  | {op: "not"; arg: ViewerConditionRule}
  | {op: "and" | "or"; args: ViewerConditionRule[]}
  | {op: "eq" | "ne" | "lt" | "le" | "gt" | "ge" | "is" | "is-not";
      left: ViewerConditionRule; right: ViewerConditionRule};

export type ViewerReactiveEntry = {
  section: string;
  group: string | null;
  field: RuntimeViewerField;
  rule: ViewerConditionRule;
  initiallyDeferred: boolean;
};

const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,127}$/;
const EDITABLE_CONTROLS = new Set(["text", "multiline", "integer", "number", "boolean", "select"]);
const FIELD_KEYS = new Set([
  "name", "label", "control", "help", "default", "choices", "hasCondition",
  "visibility", "visible", "hidden", "hiddenAttributeAvailable", "pending",
  "readOnly", "executionAllowed", "conditionState",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function scalar(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && value.length <= 256);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 160;
}

/** Strict rule whitelist, plus global node/depth budgets (not per branch). */
export function validViewerConditionRule(value: unknown): value is ViewerConditionRule {
  let visited = 0;
  function visit(input: unknown, depth: number): boolean {
    visited += 1;
    if (visited > 40 || depth > 12) return false;
    const node = record(input);
    if (!node) return false;
    const keys = Object.keys(node);
    switch (node.op) {
      case "const":
        return keys.length === 2 && keys.includes("value") && scalar(node.value);
      case "field":
        return keys.length === 2 && typeof node.name === "string" && FIELD_NAME.test(node.name);
      case "not":
        return keys.length === 2 && keys.includes("arg") && visit(node.arg, depth + 1);
      case "and":
      case "or":
        return keys.length === 2 && Array.isArray(node.args) && node.args.length >= 2 &&
          node.args.length <= 16 && node.args.every(child => visit(child, depth + 1));
      case "eq": case "ne": case "lt": case "le": case "gt": case "ge":
      case "is": case "is-not":
        if (keys.length !== 3 || !keys.includes("left") || !keys.includes("right") ||
            !visit(node.left, depth + 1) || !visit(node.right, depth + 1)) return false;
        if (node.op === "is" || node.op === "is-not") {
          const a = record(node.left), b = record(node.right);
          return (a?.op === "const" && a.value === null) ||
            (b?.op === "const" && b.value === null);
        }
        return true;
      default: return false;
    }
  }
  return visit(value, 0);
}

function referenced(rule: ViewerConditionRule, names = new Set<string>()): Set<string> {
  if (rule.op === "field") names.add(rule.name);
  else if (rule.op === "not") referenced(rule.arg, names);
  else if (rule.op === "and" || rule.op === "or") rule.args.forEach(n => referenced(n, names));
  else if ("left" in rule) { referenced(rule.left, names); referenced(rule.right, names); }
  return names;
}

/** null means unknown. Unknown never activates a deferred control. */
export function evaluateViewerCondition(
  source: unknown, values: Readonly<Record<string, unknown>>,
): boolean | null {
  if (!validViewerConditionRule(source)) return null;
  const rule = source;
  const UNKNOWN = Symbol("unknown");
  type Atom = string | number | boolean | null | typeof UNKNOWN;
  function get(node: ViewerConditionRule): Atom {
    switch (node.op) {
      case "const": return node.value;
      case "field": {
        if (!Object.prototype.hasOwnProperty.call(values, node.name)) return UNKNOWN;
        const value = values[node.name];
        return scalar(value) ? value : UNKNOWN;
      }
      case "not": {
        const result = get(node.arg);
        return result === UNKNOWN || typeof result !== "boolean" ? UNKNOWN : !result;
      }
      case "and": {
        let uncertain = false;
        for (const arg of node.args) {
          const result = get(arg);
          if (result === false) return false;
          if (result === UNKNOWN || typeof result !== "boolean") uncertain = true;
        }
        return uncertain ? UNKNOWN : true;
      }
      case "or": {
        let uncertain = false;
        for (const arg of node.args) {
          const result = get(arg);
          if (result === true) return true;
          if (result === UNKNOWN || typeof result !== "boolean") uncertain = true;
        }
        return uncertain ? UNKNOWN : false;
      }
      default: {
        const left = get(node.left), right = get(node.right);
        if (left === UNKNOWN || right === UNKNOWN) return UNKNOWN;
        // Python equality doesn't silently coerce "1" into 1.
        if (nodeIsComparison(node.op)) {
          if (node.op === "eq" || node.op === "is") return left === right;
          if (node.op === "ne" || node.op === "is-not") return left !== right;
          if (typeof left !== typeof right || !["number", "string"].includes(typeof left)) return UNKNOWN;
          if (typeof left === "number" && typeof right === "number") {
            if (node.op === "lt") return left < right;
            if (node.op === "le") return left <= right;
            if (node.op === "gt") return left > right;
            return left >= right;
          }
          if (typeof left === "string" && typeof right === "string") {
            if (node.op === "lt") return left < right;
            if (node.op === "le") return left <= right;
            if (node.op === "gt") return left > right;
            return left >= right;
          }
        }
        return UNKNOWN;
      }
    }
  }
  const evaluated = get(rule);
  return typeof evaluated === "boolean" ? evaluated : null;
}
function nodeIsComparison(op: string): boolean {
  return ["eq", "ne", "lt", "le", "gt", "ge", "is", "is-not"].includes(op);
}

/**
 * Accept the sidecar only when it matches the already verified visible fields,
 * verifies its own deferred fields, and references only other published fields.
 * Do not synthesize an executable schema or trust controls missing from the
 * strict preview serializer.
 */
export function parseViewerReactiveEntries(
  source: unknown, sections: RuntimeViewerSection[],
): ViewerReactiveEntry[] | null {
  if (!Array.isArray(source) || source.length === 0 || source.length > 96) return null;
  const visible = new Map<string, {section: string; group: string | null; field: RuntimeViewerField}>();
  for (const section of sections) {
    for (const field of section.fields) visible.set(field.name, {section: section.label, group: null, field});
    for (const group of section.groups) {
      for (const field of group.fields) visible.set(field.name, {section: section.label, group: group.label, field});
    }
  }
  if (visible.size + source.length > 192) return null;
  const result: ViewerReactiveEntry[] = [];
  const entriesByName = new Map<string, ViewerReactiveEntry>();
  for (const entryValue of source) {
    const entry = record(entryValue), raw = record(entry?.field);
    if (!entry || !raw || Object.keys(entry).length !== 4 ||
        !["section", "group", "field", "rule"].every(key => Object.prototype.hasOwnProperty.call(entry, key)) ||
        !text(entry.section) || !(entry.group === null || text(entry.group)) ||
        !validViewerConditionRule(entry.rule) ||
        Object.keys(raw).some(key => !FIELD_KEYS.has(key)) ||
        typeof raw.name !== "string" || !FIELD_NAME.test(raw.name) ||
        entriesByName.has(raw.name) || raw.readOnly !== true ||
        raw.executionAllowed !== false || raw.hidden !== false ||
        raw.hiddenAttributeAvailable !== true ||
        (raw.visibility === "pending" ? raw.hasCondition !== true : raw.hasCondition !== false) ||
        !["visible", "pending", "conditional-hidden"].includes(String(raw.visibility))) return null;
    const prior = visible.get(raw.name);
    const initiallyDeferred = !prior;
    if (initiallyDeferred) {
      if (raw.visibility !== "conditional-hidden" || raw.visible !== false ||
          raw.pending !== false || raw.conditionState !== "unmet") return null;
    } else {
      if (prior.section !== entry.section || prior.group !== entry.group ||
          prior.field.visibility !== raw.visibility ||
          (raw.visibility !== "visible" && raw.visibility !== "pending") ||
          prior.field.hiddenAttributeAvailable !== true) return null;
      if (raw.visibility === "visible" &&
          (raw.visible !== true || raw.pending !== false || raw.conditionState !== "met")) return null;
      if (raw.visibility === "pending" &&
          (raw.visible !== null || raw.pending !== true || raw.conditionState !== "unresolved")) return null;
    }
    // Reuse the existing static text serializer to sanitize choices/defaults/help,
    // applying exactly the same control and name whitelist as the read-only UI.
    const described = describeProtocolViewerPreview({
      id: "RuntimeViewer", name: "RuntimeViewer",
      formSchema: {status: "static-preview", sections: [{
        label: entry.section, fields: [raw], groups: [],
      }]},
    });
    const safe = described.sections[0]?.fields[0];
    if (!safe || safe.name !== raw.name ||
        (prior && (safe.label !== prior.field.label || safe.control !== prior.field.control ||
          safe.defaultValue !== prior.field.defaultValue ||
          JSON.stringify(safe.choices) !== JSON.stringify(prior.field.choices)))) return null;
    const field: RuntimeViewerField = prior?.field ?? {
      ...safe, visibility: "pending", conditionState: "unresolved",
      hiddenAttributeAvailable: true, readOnly: true,
    };
    // Deferred fields carry an internal designation here, never "visible" in
    // the outward-facing initial preview.
    const candidate: ViewerReactiveEntry = {
      section: entry.section, group: entry.group as string | null,
      field, rule: entry.rule as ViewerConditionRule, initiallyDeferred,
    };
    entriesByName.set(raw.name, candidate);
    result.push(candidate);
  }
  const permitted = new Set([...visible.keys(), ...entriesByName.keys()]);
  if (permitted.size > 96) return null;
  for (const entry of result) {
    const dependencies = referenced(entry.rule);
    if (!dependencies.size || ![...dependencies].every(name => permitted.has(name))) return null;
    // A cycle has no safe first local state: avoid guessing about its behavior.
  }
  const stack = new Set<string>(), done = new Set<string>();
  const acyclic = (name: string): boolean => {
    if (stack.has(name)) return false;
    if (done.has(name)) return true;
    const entry = entriesByName.get(name);
    if (!entry) return true;
    stack.add(name);
    for (const dependency of referenced(entry.rule)) {
      if (!acyclic(dependency)) return false;
    }
    stack.delete(name);
    done.add(name);
    return true;
  };
  if (![...entriesByName.keys()].every(acyclic)) return null;
  return result;
}

/** Typed local values. An absent default stays undefined, not fabricated zero. */
export function initialViewerLocalValues(
  sections: RuntimeViewerSection[], entries: ViewerReactiveEntry[],
): Record<string, unknown> {
  const values: Record<string, unknown> = Object.create(null);
  const fields = sections.flatMap(section => [
    ...section.fields, ...section.groups.flatMap(group => group.fields),
  ]);
  const seen = new Set(fields.map(field => field.name));
  for (const entry of entries) if (!seen.has(entry.field.name)) fields.push(entry.field);
  for (const field of fields) {
    if (field.defaultValue === undefined) continue;
    const value = field.defaultValue;
    if (field.control === "select" || field.control === "integer" || field.control === "number") {
      const numeric = Number(value);
      if (value !== "" && Number.isFinite(numeric)) values[field.name] = numeric;
    } else if (field.control === "boolean") {
      if (value === "true" || value === "True") values[field.name] = true;
      if (value === "false" || value === "False") values[field.name] = false;
    } else values[field.name] = value;
  }
  return values;
}

export function localViewerFieldValue(field: RuntimeViewerField, value: string | boolean): unknown {
  if (field.control === "boolean") return typeof value === "boolean" ? value : undefined;
  if (typeof value !== "string" || value.length > 2048) return undefined;
  if (["select", "integer", "number"].includes(field.control)) {
    if (value.trim() === "") return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return undefined;
    if (["select", "integer"].includes(field.control) && !Number.isSafeInteger(parsed)) return undefined;
    if (field.control === "select" && (!field.choices || parsed < 0 || parsed >= field.choices.length)) return undefined;
    return parsed;
  }
  return EDITABLE_CONTROLS.has(field.control) ? value : undefined;
}
