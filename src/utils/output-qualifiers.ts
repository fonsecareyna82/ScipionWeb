// What tells apart outputs of the same type of a protocol (e.g. the good and the
// discarded micrographs): a short qualifier read from the output's name, shown
// only when two or more outputs of the protocol would otherwise look the same.

export type QualifiableOutput = {
  name?: string | null;
  pointerClass?: string | null;
  info?: string | null;
  /** A label the plugin gave the object (setObjLabel), preferred to the name. */
  label?: string | null;
};

export type OutputQualifier = {
  text: string;
  /** Discarded, rejected, bad...: shown dimmed, so the good output stands out. */
  negative: boolean;
};

// Words that make an output the "not wanted" part of a split.
const NEGATIVE_WORDS = /\b(discard(?:ed|s)?|reject(?:ed|s)?|bad|excluded?|fail(?:ed|ures?)?|outliers?|invalid|removed|unselected|wrong|junk|bin)\b/i;

// Short forms plugins use for their types in output names.
const ABBREVIATIONS: Record<string, string[]> = {
  TiltSeries: ["Ts", "TS"],
  TiltSeriesM: ["Ts", "TS"],
  Coordinates: ["Coords", "Coord"],
  Coordinates3D: ["Coordinates", "Coords", "Coord"],
  Volumes: ["Vols", "Vol", "Volume"],
  Volume: ["Vol"],
  Particles: ["Parts", "Particle"],
  Micrographs: ["Mics", "Micrograph", "Mic"],
  Movies: ["Movie"],
  Tomograms: ["Tomos", "Tomogram", "Tomo"],
  Classes2D: ["Classes"],
  Classes3D: ["Classes"],
  CTFTomoSeries: ["CTFTomo", "CtfTomo"],
};

function typeNouns(pointerClass: string | null | undefined): string[] {
  const core = String(pointerClass ?? "").replace(/^SetOf/, "").trim();
  if (!core) return [];
  const nouns = new Set<string>([core, ...(ABBREVIATIONS[core] ?? [])]);
  if (core.endsWith("s")) nouns.add(core.slice(0, -1));
  else nouns.add(`${core}s`);
  // Longest first: "Micrographs" before "Mic".
  return [...nouns].sort((a, b) => b.length - a.length);
}

function words(text: string): string {
  return text
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/** The qualifier in an output's name ("outputMicrographsDiscarded" -> "Discarded"); null for the main one. */
export function qualifierFromName(name: string | null | undefined, pointerClass?: string | null): string | null {
  let rest = String(name ?? "").trim().replace(/^output/i, "");
  rest = rest.replace(/^SetOf/, "").replace(/^Set(?=[A-Z0-9_]|$)/, "");
  for (const noun of typeNouns(pointerClass)) {
    if (rest.toLowerCase().startsWith(noun.toLowerCase())) {
      rest = rest.slice(noun.length);
      break;
    }
    // The type in the middle: "outputSetOfbadCTFTomoSeries".
    const at = rest.toLowerCase().indexOf(noun.toLowerCase());
    if (at > 0) {
      rest = rest.slice(0, at) + rest.slice(at + noun.length);
      break;
    }
  }
  const text = words(rest.replace(/^[_\s]+|[_\s]+$/g, ""));
  if (!text) return null;
  if (/^\d+$/.test(text)) return `#${text}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function isNegativeQualifier(text: string | null | undefined): boolean {
  return !!text && NEGATIVE_WORDS.test(text);
}

function typeKey(output: QualifiableOutput): string {
  const pointerClass = String(output.pointerClass ?? "").trim();
  if (pointerClass) return pointerClass;
  // Without a class, the type is how the info starts ("SetOfMicrographs (...)").
  return String(output.info ?? "").trim().split(/[\s(]/)[0] ?? "";
}

/**
 * The qualifiers of the outputs of one protocol that share their type with
 * another of its outputs (by output name). Outputs of a type of their own get
 * none: the node stays as it is when nothing is ambiguous.
 */
export function ambiguousOutputQualifiers(outputs: QualifiableOutput[]): Map<string, OutputQualifier> {
  const byType = new Map<string, QualifiableOutput[]>();
  for (const output of outputs) {
    const key = typeKey(output);
    if (!key || !output.name) continue;
    byType.set(key, [...(byType.get(key) ?? []), output]);
  }
  const qualifiers = new Map<string, OutputQualifier>();
  for (const group of byType.values()) {
    if (group.length < 2) continue;
    const texts = group.map((output) => {
      const label = String(output.label ?? "").trim();
      return label || qualifierFromName(output.name, output.pointerClass);
    });
    // Names that say nothing apart (or the same): their own name tells them apart.
    const unnamed = texts.filter((text) => !text).length;
    group.forEach((output, index) => {
      let text = texts[index];
      const repeated = text !== null && texts.filter((other) => other === text).length > 1;
      if ((!text && unnamed > 1) || repeated) text = String(output.name);
      if (!text) return; // The main output of the group: no label.
      qualifiers.set(String(output.name), { text, negative: isNegativeQualifier(text) });
    });
  }
  return qualifiers;
}
