const SCALAR_OUTPUT_CLASS_NAMES = new Set([
  "Boolean",
  "Float",
  "Integer",
  "Scalar",
  "String",
]);

function getClassNameFromRecord(
  record: Record<string, unknown>,
): string {
  const className =
    record.pointerClass ??
    record.outputClassName ??
    record.className ??
    record._class;

  return typeof className === "string"
    ? className.trim()
    : "";
}

export function getOutputClassName(
  output: unknown,
): string {
  if (!output || typeof output !== "object") {
    return "";
  }

  const record =
    output as Record<string, unknown>;

  const directClassName =
    getClassNameFromRecord(record);

  if (directClassName) {
    return directClassName;
  }

  const entries =
    Object.entries(record);

  if (entries.length !== 1) {
    return "";
  }

  const wrappedValue =
    entries[0][1];

  if (
    !wrappedValue ||
    typeof wrappedValue !== "object"
  ) {
    return "";
  }

  return getClassNameFromRecord(
    wrappedValue as Record<string, unknown>,
  );
}

export function isScalarOutputClass(
  className: unknown,
): boolean {
  return SCALAR_OUTPUT_CLASS_NAMES.has(
    String(className ?? "").trim(),
  );
}

export function isScalarOutput(
  output: unknown,
): boolean {
  return isScalarOutputClass(
    getOutputClassName(output),
  );
}