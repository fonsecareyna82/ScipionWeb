import { describe, expect, it } from "vitest";
import { ambiguousOutputQualifiers, isNegativeQualifier, qualifierFromName } from "@/utils/output-qualifiers";

describe("output qualifiers", () => {
  it.each([
    ["outputMicrographsDiscarded", "SetOfMicrographs", "Discarded"],
    ["outputMicrographs", "SetOfMicrographs", null],
    ["outputMoviesDiscarded", "SetOfMovies", "Discarded"],
    ["outputCTFDiscarded", "SetOfCTF", "Discarded"],
    ["outputSetDiscarded", "SetOfParticles", "Discarded"],
    ["outputVolumeHalf_A", "Volume", "Half A"],
    ["outputTsFnOdd", "SetOfTiltSeries", "Fn Odd"],
    ["outputSetOfbadCTFTomoSeries", "SetOfCTFTomoSeries", "Bad"],
    ["outputSetOfParticlesHalf2", "SetOfParticles", "Half 2"],
    ["outputParticles2", "SetOfParticles", "#2"],
    ["outputSet2", "SetOfParticles", "#2"],
  ])("%s (%s) -> %s", (name, pointerClass, expected) => {
    expect(qualifierFromName(name, pointerClass)).toBe(expected);
  });

  it("knows the outputs that are the unwanted part of a split", () => {
    for (const text of ["Discarded", "Rejected", "Bad", "Excluded", "Failed", "Outliers"]) {
      expect(isNegativeQualifier(text)).toBe(true);
    }
    for (const text of ["Half A", "Odd", "Good", "#2", "Accepted"]) {
      expect(isNegativeQualifier(text)).toBe(false);
    }
  });

  it("labels only the outputs that share their type with another one", () => {
    const qualifiers = ambiguousOutputQualifiers([
      { name: "outputMicrographs", pointerClass: "SetOfMicrographs" },
      { name: "outputMicrographsDiscarded", pointerClass: "SetOfMicrographs" },
      { name: "outputCTF", pointerClass: "SetOfCTF" },
    ]);
    expect([...qualifiers.entries()]).toEqual([["outputMicrographsDiscarded", { text: "Discarded", negative: true }]]);
  });

  it("prefers the plugin's label and falls back to the name when nothing else tells them apart", () => {
    expect(ambiguousOutputQualifiers([
      { name: "outputVolume1", pointerClass: "Volume", label: "half-map 1" },
      { name: "outputVolume2", pointerClass: "Volume", label: "half-map 2" },
    ]).get("outputVolume1")?.text).toBe("half-map 1");
    const opaque = ambiguousOutputQualifiers([
      { name: "outputParticles", pointerClass: "SetOfParticles" },
      { name: "particles", pointerClass: "SetOfParticles" },
    ]);
    expect([...opaque.values()].map((q) => q.text)).toEqual(["outputParticles", "particles"]);
    // Types come from the info when the class is missing.
    expect(ambiguousOutputQualifiers([
      { name: "outputSet", info: "SetOfMicrographs (10 items)" },
      { name: "outputSetDiscarded", info: "SetOfMicrographs (2 items)" },
    ]).get("outputSetDiscarded")?.text).toBe("Discarded");
  });
});
