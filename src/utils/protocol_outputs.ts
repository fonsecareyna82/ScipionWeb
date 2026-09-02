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

function getOutputName(
  output: unknown,
): string {
  if (!output || typeof output !== "object") {
    return "";
  }

  const record =
    output as Record<string, unknown>;

  const directName =
    record.outputName ??
    record.name ??
    record._key;

  if (
    typeof directName === "string" &&
    directName.trim()
  ) {
    return directName.trim();
  }

  const entries =
    Object.entries(record);

  if (entries.length === 1) {
    const [
      wrappedName,
      wrappedValue,
    ] = entries[0];

    if (
      wrappedValue &&
      typeof wrappedValue === "object"
    ) {
      return String(
        wrappedName ?? ""
      ).trim();
    }
  }

  return "";
}

function mergeOutputData(
  currentOutput: unknown,
  freshOutput: unknown,
): unknown {
  if (
    currentOutput &&
    freshOutput &&
    typeof currentOutput === "object" &&
    typeof freshOutput === "object" &&
    !Array.isArray(currentOutput) &&
    !Array.isArray(freshOutput)
  ) {
    return {
      ...(currentOutput as Record<string, unknown>),
      ...(freshOutput as Record<string, unknown>),
    };
  }

  return freshOutput;
}

export function mergeProtocolOutputsPreservingOrder(
  currentOutputs: unknown,
  freshOutputs: unknown,
): unknown[] {
  const current =
    Array.isArray(currentOutputs)
      ? currentOutputs
      : [];

  const fresh =
    Array.isArray(freshOutputs)
      ? freshOutputs
      : [];

  if (fresh.length === 0) {
    return [];
  }

  if (current.length === 0) {
    return [...fresh];
  }

  const freshByName =
    new Map<string, unknown>();

  for (const freshOutput of fresh) {
    const outputName =
      getOutputName(freshOutput);

    if (
      outputName &&
      !freshByName.has(outputName)
    ) {
      freshByName.set(
        outputName,
        freshOutput,
      );
    }
  }

  const merged: unknown[] = [];

  for (const currentOutput of current) {
    const outputName =
      getOutputName(currentOutput);

    if (!outputName) {
      continue;
    }

    const freshOutput =
      freshByName.get(outputName);

    if (freshOutput === undefined) {
      continue;
    }

    merged.push(
      mergeOutputData(
        currentOutput,
        freshOutput,
      ),
    );

    freshByName.delete(outputName);
  }

  for (const freshOutput of fresh) {
    const outputName =
      getOutputName(freshOutput);

    if (!outputName) {
      merged.push(freshOutput);
      continue;
    }

    if (!freshByName.has(outputName)) {
      continue;
    }

    merged.push(
      freshByName.get(outputName),
    );

    freshByName.delete(outputName);
  }

  return merged;
}