/** Read-only browser interpretation of the server's advisory action contracts.
 * Do not add dispatch or URL handling here. Only the backend may authorize a
 * future action; an adapter declaration is never a permission to run it.
 */

type UnknownRecord = Record<string, unknown>;
type StaticAction = { id: string; label: string; control?: string };

export type ViewerActionAdapterStatus = {
  adapterStatus: "missing" | "declared-not-integrated";
  label: string;
  blockers: readonly string[];
};

const CAPABILITIES = new Set([
  "metadata-table", "volume", "particles", "classes", "plot", "image",
  "html-report", "message", "monitor", "external-app", "protocol-action",
]);
const IDENT = /^[A-Za-z][A-Za-z0-9_]{0,127}$/;
const ADAPTER_IDENT = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;

function record(raw: unknown): UnknownRecord | null {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw as UnknownRecord : null;
}

function safeAdapter(raw: unknown): raw is UnknownRecord {
  const data = record(raw);
  return !!data && Object.keys(data).length === 5 &&
    ["id", "kind", "effect", "surface", "status"].every(key => Object.prototype.hasOwnProperty.call(data, key)) &&
    typeof data.id === "string" && ADAPTER_IDENT.test(data.id) &&
    typeof data.kind === "string" && CAPABILITIES.has(data.kind) &&
    (data.effect === "read-only" || data.effect === "derived-read") &&
    (data.surface === "react" || data.surface === "external") &&
    data.status === "declared-not-integrated";
}

/** Verify the shape and attach advisory statuses ONLY to statically visible actions.
 * Malformed top-level contracts are ignored. A malformed action is individually
 * ignored, but duplicate identities invalidate the entire contract.
 */
export function describeProtocolViewerWebActionStatuses(
  raw: unknown, staticActions: readonly StaticAction[],
): ReadonlyMap<string, ViewerActionAdapterStatus> {
  const result = new Map<string, ViewerActionAdapterStatus>();
  const data = record(raw);
  if (!data || data.status !== "advisory-only" || data.source !== "static-ast" ||
      data.renderable !== false || data.executionAllowed !== false || data.readyCount !== 0 ||
      !Array.isArray(data.actions) || data.actions.length > 96 ||
      data.actionCount !== data.actions.length || !Number.isInteger(data.declaredAdapterCount) ||
      (data.declaredAdapterCount as number) < 0 || (data.declaredAdapterCount as number) > data.actions.length) return result;

  const known = new Map(staticActions.map(action => [action.id, action]));
  const seen = new Set<string>();
  let declarations = 0;
  for (const rawAction of data.actions) {
    const entry = record(rawAction);
    if (!entry || typeof entry.id !== "string" || !IDENT.test(entry.id) || seen.has(entry.id)) return new Map();
    seen.add(entry.id);
    if (entry.adapter !== null) declarations += 1;
  }
  if (declarations !== data.declaredAdapterCount) return result;

  for (const rawAction of data.actions) {
    const entry = record(rawAction);
    if (!entry) continue;
    const staticAction = known.get(entry.id as string);
    if (!staticAction || entry.fieldName !== staticAction.id || entry.label !== staticAction.label ||
        (staticAction.control !== undefined && entry.control !== staticAction.control) ||
        entry.intent !== "visualize" || entry.source !== "static-ast" ||
        entry.availability !== "blocked" || entry.renderable !== false ||
        entry.executionAllowed !== false || entry.requiresRuntimeVerification !== true) continue;

    const status = entry.adapterStatus;
    if (status !== "missing" && status !== "declared-not-integrated") continue;
    if (status === "missing" ? entry.adapter !== null : !safeAdapter(entry.adapter)) continue;
    const blockers = status === "missing"
      ? ["action_adapter_missing", "runtime_instance_not_verified", "web_action_not_implemented"]
      : ["action_adapter_not_integrated", "runtime_instance_not_verified", "web_action_not_implemented"];
    const actualBlockers = entry.blockers;
    if (!Array.isArray(actualBlockers) || actualBlockers.length !== blockers.length ||
        !blockers.every((value, index) => actualBlockers[index] === value)) continue;
    const label = status === "missing" ? "Web adapter: missing — blocked"
      : `Web adapter: declared (${(entry.adapter as UnknownRecord).kind}, ${(entry.adapter as UnknownRecord).surface}) — not integrated`;
    result.set(staticAction.id, {adapterStatus: status, label, blockers});
  }
  return result;
}
