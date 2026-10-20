// Shared helpers for protocol tags: ids, colours, validation and filtering.
import type { ProtocolTag } from "@/components/tags/tagTypes";

/** Assignments of one project: protocol id -> tag ids. */
export type ProtocolTagAssignments = Record<string, string[]>;

export type TagFilterMode = "any" | "all";

// Same limits as the server, so most mistakes are caught before a request.
export const TAG_TITLE_MAX_LENGTH = 80;
export const TAG_DESCRIPTION_MAX_LENGTH = 1000;

export const DEFAULT_TAG_COLOR = "#3b82f6";

// Mid-tone colours: each one is visible on the light and the dark panel.
export const TAG_COLOR_PRESETS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#64748b",
] as const;

const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * Tag ids from any payload shape: an id, a list of ids, or objects with an
 * `id` / `tagId`. Trimmed, without empties and duplicates, order kept.
 */
export function normalizeTagIds(raw: unknown): string[] {
  if (raw == null || raw === "") return [];
  const values = Array.isArray(raw) ? raw : [raw];
  const out: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    let id = "";
    if (typeof value === "string" || typeof value === "number") {
      id = String(value);
    } else if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const candidate = obj.id ?? obj.tagId;
      if (typeof candidate === "string" || typeof candidate === "number") id = String(candidate);
    }
    id = id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  return out;
}

/** Whether two id lists hold the same ids, in any order. */
export function sameTagIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/**
 * The tag ids of a protocol. An entry in the map wins even when it is empty
 * (the protocol has no tags); the fallback is only for protocols the map
 * does not know.
 */
export function resolveAssignedTagIds(
  assignments: ProtocolTagAssignments | undefined,
  protocolId: string,
  fallback?: unknown,
): string[] {
  if (assignments && Object.prototype.hasOwnProperty.call(assignments, protocolId)) {
    return assignments[protocolId] ?? [];
  }
  return normalizeTagIds(fallback);
}

/** Assignments from the graph payload: `protocols[id].tags`, for every protocol. */
export function assignmentsFromProtocols(protocols: unknown): ProtocolTagAssignments {
  const out: ProtocolTagAssignments = {};
  if (!protocols || typeof protocols !== "object") return out;

  for (const [protocolId, protocol] of Object.entries(protocols as Record<string, any>)) {
    if (protocolId === "PROJECT") continue;
    out[String(protocolId)] = normalizeTagIds(protocol?.tags);
  }
  return out;
}

export function matchesTagFilter(
  assignedTagIds: readonly string[],
  filterTagIds: readonly string[],
  mode: TagFilterMode,
): boolean {
  if (filterTagIds.length === 0) return true;
  const assigned = new Set(assignedTagIds);
  return mode === "all"
    ? filterTagIds.every((id) => assigned.has(id))
    : filterTagIds.some((id) => assigned.has(id));
}

/**
 * The ids that are still tags of the project (same array when all are). An
 * empty list drops them all: a filter on a deleted tag would match nothing.
 */
export function keepKnownTagIds(ids: string[], known: ReadonlyMap<string, unknown>): string[] {
  const next = ids.filter((id) => known.has(id));
  return next.length === ids.length ? ids : next;
}

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR_RE.test(value.trim());
}

export function normalizeTagColor(raw: unknown, fallback = "#9ca3af"): string {
  const value = String(raw ?? "").trim();
  return isHexColor(value) ? value : fallback;
}

/** `#rrggbb` for a native colour input, which accepts nothing else. */
export function toColorInputValue(color: string): string {
  const match = HEX_COLOR_RE.exec(String(color ?? "").trim());
  if (!match) return DEFAULT_TAG_COLOR;
  const raw = match[1];
  if (raw.length === 3 || raw.length === 4) {
    return `#${raw.slice(0, 3).split("").map((c) => c + c).join("")}`.toLowerCase();
  }
  return `#${raw.slice(0, 6)}`.toLowerCase();
}

function channelLuminance(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const DARK_TEXT = "#111827";
const LIGHT_TEXT = "#f9fafb";

/**
 * Dark or light text, whichever contrasts more with the tag colour (WCAG
 * relative luminance). Unknown colours get dark text.
 */
export function getReadableTextColor(color: string): string {
  if (!isHexColor(color)) return DARK_TEXT;
  const full = toColorInputValue(color);

  const r = Number.parseInt(full.slice(1, 3), 16);
  const g = Number.parseInt(full.slice(3, 5), 16);
  const b = Number.parseInt(full.slice(5, 7), 16);
  const luminance = 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);

  // Contrast against #111827 (L ~ 0.012) and #f9fafb (L ~ 0.955).
  const contrastWithDark = (luminance + 0.05) / (0.012 + 0.05);
  const contrastWithLight = (0.955 + 0.05) / (luminance + 0.05);
  return contrastWithDark >= contrastWithLight ? DARK_TEXT : LIGHT_TEXT;
}

export function normalizeTag(raw: any): ProtocolTag | null {
  const id = String(raw?.id ?? "").trim();
  const title = String(raw?.title ?? "").trim();
  if (!id || !title) return null;

  const description = typeof raw?.description === "string" && raw.description.trim() ? raw.description : undefined;
  return {
    id,
    title,
    description,
    color: isHexColor(raw?.color) ? String(raw.color).trim() : DEFAULT_TAG_COLOR,
  };
}

/** Tags ordered by title, as the server lists them. */
export function sortTags(tags: ProtocolTag[]): ProtocolTag[] {
  return [...tags].sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
}

export function normalizeTagList(raw: unknown): ProtocolTag[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeTag).filter(Boolean) as ProtocolTag[];
}

/** Client-side check of a tag draft; null when it is valid. */
export function validateTagDraft(
  draft: { id?: string; title: string; description?: string; color: string },
  existing: ProtocolTag[],
): string | null {
  const title = draft.title.trim();
  if (!title) return "Title is required.";
  if (title.length > TAG_TITLE_MAX_LENGTH) return `Title must be at most ${TAG_TITLE_MAX_LENGTH} characters.`;
  if ((draft.description ?? "").trim().length > TAG_DESCRIPTION_MAX_LENGTH) {
    return `Description must be at most ${TAG_DESCRIPTION_MAX_LENGTH} characters.`;
  }
  if (!isHexColor(draft.color)) return "Color must be a hex value such as #3b82f6.";

  const key = title.toLowerCase();
  const conflict = existing.some((tag) => tag.id !== draft.id && tag.title.trim().toLowerCase() === key);
  return conflict ? "A tag with the same title already exists." : null;
}

/**
 * The message to show for a failed request. The server sends a readable
 * `detail` (409, 422); validation errors may come as a list of `{ msg }`.
 */
export function apiErrorMessage(error: any, fallback: string): string {
  const detail = error?.data?.detail ?? error?.response?.data?.detail ?? error?.detail;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => (typeof item === "string" ? item : typeof item?.msg === "string" ? item.msg : ""))
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) return parts.join("\n");
  }
  const message = typeof error?.message === "string" ? error.message.trim() : "";
  return message && !message.includes("[object Object]") ? message : fallback;
}
