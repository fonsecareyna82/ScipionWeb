export type UnwrappedParam = {
  paramName: string;
  paramDef: any;
};

export type EnumOption = {
  value: string;
  label: string;
};

export function getParamClass(defLike: any): string {
  return String(defLike?.paramClass ?? defLike?._class ?? "");
}

export function isNonEmptyString(v: any): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

export function hasPointerClass(def: any): boolean {
  return isNonEmptyString(def?.pointerClass) || isNonEmptyString(def?.pointerClassName);
}

export function hasMinMax(defLike: any): boolean {
  if (!defLike || typeof defLike !== "object") return false;
  return "min" in defLike || "max" in defLike;
}

export function resolveParamClass(defLike: any): string {
  const rawCls = getParamClass(defLike);

  if (rawCls === "PointerParam" || rawCls === "MultiPointerParam") return rawCls;
  if (rawCls === "PathParam") return "PathParam";

  const pointerLike = hasPointerClass(defLike);

  if (pointerLike) {
    if (hasMinMax(defLike)) return "MultiPointerParam";
    return "PointerParam";
  }

  return rawCls;
}

export function withResolvedParamClass(defLike: any): any {
  const rawCls = getParamClass(defLike);
  const resolved = resolveParamClass(defLike);

  if (!resolved || resolved === rawCls) return defLike;
  return { ...defLike, paramClass: resolved };
}

export function unwrapParamDef(paramLike: any): UnwrappedParam {
  if (!paramLike || typeof paramLike !== "object") {
    return { paramName: "", paramDef: paramLike };
  }

  if (typeof (paramLike as any).name === "string") {
    return { paramName: String((paramLike as any).name ?? ""), paramDef: paramLike };
  }

  const entries = Object.entries(paramLike);
  if (entries.length === 1) {
    const [maybeName, payload] = entries[0] as [string, any];

    if (
      payload &&
      typeof payload === "object" &&
      ("paramClass" in payload || "_class" in payload)
    ) {
      return { paramName: String(maybeName), paramDef: payload };
    }

    return { paramName: String(maybeName), paramDef: paramLike };
  }

  return { paramName: String((paramLike as any).name ?? ""), paramDef: paramLike };
}

export function unwrapObjValue(raw: any) {
  if (raw && typeof raw === "object" && "value" in raw) {
    return (raw as any).value;
  }
  return raw;
}

export function parseFromJSONValue(maybeJson: any) {
  try {
    if (maybeJson && typeof maybeJson === "object" && "value" in maybeJson) {
      return (maybeJson as any).value;
    }

    if (typeof maybeJson === "string") {
      const obj = JSON.parse(maybeJson);
      if (obj && typeof obj === "object" && "value" in obj) {
        return (obj as any).value;
      }
    }
  } catch {
    // noOp
  }

  return maybeJson;
}

export function coerceBooleanValue(raw: any): boolean {
  const v = unwrapObjValue(raw);

  if (v === true || v === 1 || v === "1") return true;
  if (v === false || v === 0 || v === "0") return false;

  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }

  return false;
}

export function coerceReadOnlyFlag(raw: any): boolean {
  if (raw === true || raw === 1 || raw === "1") return true;
  if (raw === false || raw === 0 || raw === "0") return false;

  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }

  return false;
}

export function coerceCollapsedFlag(raw: any): boolean {
  return coerceReadOnlyFlag(raw);
}

export function getParamNameFromStateKey(stateKey: string): string {
  const firstUnderscore = stateKey.indexOf("_");
  return firstUnderscore >= 0 ? stateKey.slice(firstUnderscore + 1) : stateKey;
}

export function hasOwn(obj: any, key: string) {
  return obj != null && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, key);
}

export function getInitialRawForParam(paramName: string, def: any, valuesMap: any) {
  if (hasOwn(valuesMap, paramName)) return valuesMap[paramName];
  return def?.value ?? def?.default ?? "";
}

export function normalizePointerToken(raw: any): string {
  const v = parseFromJSONValue(raw);

  if (v === null || v === undefined) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);

  if (v && typeof v === "object") {
    if ("value" in v) return String((v as any).value ?? "");
    if ("object" in v) return String((v as any).object ?? "");
  }

  return "";
}

export function normalizeEnumOptions(choicesRaw: any): EnumOption[] {
  if (Array.isArray(choicesRaw)) {
    return choicesRaw.map((c) => {
      const s = String(c ?? "");
      return { value: s, label: s };
    });
  }

  if (choicesRaw && typeof choicesRaw === "object") {
    return Object.entries(choicesRaw as Record<string, any>).map(([k, v]) => ({
      value: String(k ?? ""),
      label: String(v ?? ""),
    }));
  }

  return [];
}

export function normalizeEnumSelection(raw: any, choicesRaw: any, fallbackRaw: any): string {
  const options = normalizeEnumOptions(choicesRaw);
  if (options.length === 0) return String(parseFromJSONValue(raw) ?? fallbackRaw ?? "");

  const pickByIndex = (idx: number) => options[idx]?.value ?? options[0].value;

  const resolveString = (s: string): string => {
    const trimmed = s.trim();
    if (!trimmed) return options[0].value;

    if (options.some((o) => o.value === trimmed)) return trimmed;

    const byLabel = options.find((o) => o.label === trimmed);
    if (byLabel) return byLabel.value;

    if (/^\d+$/.test(trimmed)) return pickByIndex(Number(trimmed));

    return options[0].value;
  };

  const v = parseFromJSONValue(raw);

  if (typeof v === "number" && Number.isFinite(v)) return pickByIndex(v);
  if (typeof v === "string") return resolveString(v);

  const fb = parseFromJSONValue(fallbackRaw);
  if (typeof fb === "number" && Number.isFinite(fb)) return pickByIndex(fb);
  if (typeof fb === "string") return resolveString(fb);

  return options[0].value;
}

export function normalizeMultiPointerValue(raw: any) {
  const parsed = parseFromJSONValue(raw);

  const tryParseJsonArray = (text: string) => {
    const t = text.trim();
    if (!t) return null;

    try {
      const v = JSON.parse(t);
      return Array.isArray(v) ? v : null;
    } catch {
      try {
        const normalized = t
          .replace(/'/g, '"')
          .replace(/\bNone\b/g, "null")
          .replace(/\bTrue\b/g, "true")
          .replace(/\bFalse\b/g, "false");
        const v2 = JSON.parse(normalized);
        return Array.isArray(v2) ? v2 : null;
      } catch {
        return null;
      }
    }
  };

  const asArray =
    Array.isArray(parsed)
      ? parsed
      : typeof parsed === "string"
        ? tryParseJsonArray(parsed) ?? []
        : [];

  return asArray.map((item: any) => {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      const token = String(item);
      return { object: token, value: token, info: "", pointerClass: "", parentId: null };
    }

    const objectToken = item?.object ?? item?.value ?? item?._objValue ?? item?._objId ?? "";
    const objectStr = String(objectToken ?? "");

    return {
      object: objectStr,
      value: objectStr,
      info: String(item?.info ?? ""),
      pointerClass: String(item?.pointerClass ?? item?._class ?? ""),
      parentId: item?.parentId ?? null,
    };
  });
}