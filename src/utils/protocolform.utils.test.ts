import { describe, expect, it } from "vitest";
import {
  normalizeEnumOptions,
  normalizeEnumSelection,
  resolveParamClass,
} from "@/utils/protocolform.utils";

// pyworkflow's KeyedEnumParam (backing Domain.findCapabilityProviders-driven
// choice lists, e.g. pwem's ProtImportParticles.importFrom -- see
// scipion-pyworkflow's .ai/capability-providers.md) serializes `choices` as
// [key, label] pairs, unlike plain EnumParam's flat array of label strings.
// Its value is the selected key string directly, not a positional index.

describe("normalizeEnumOptions", () => {
  it("keeps EnumParam's flat string choices with value === label", () => {
    const options = normalizeEnumOptions(["files", "xmipp3", "relion"]);

    expect(options).toEqual([
      { value: "files", label: "files" },
      { value: "xmipp3", label: "xmipp3" },
      { value: "relion", label: "relion" },
    ]);
  });

  it("extracts distinct value/label from KeyedEnumParam's [key, label] pairs", () => {
    const options = normalizeEnumOptions([
      ["files", "Files"],
      ["cryosparc", "cryoSPARC"],
    ]);

    expect(options).toEqual([
      { value: "files", label: "Files" },
      { value: "cryosparc", label: "cryoSPARC" },
    ]);
  });

  it("does not stringify a [key, label] pair into a single 'key,label' option", () => {
    const options = normalizeEnumOptions([["cryosparc", "cryoSPARC"]]);

    expect(options[0].value).not.toContain(",");
    expect(options[0].value).toBe("cryosparc");
  });
});

describe("normalizeEnumSelection with KeyedEnumParam-shaped choices", () => {
  const choices = [
    ["files", "Files"],
    ["cryosparc", "cryoSPARC"],
  ];

  it("resolves the value by exact key match, not by numeric index", () => {
    expect(normalizeEnumSelection("cryosparc", choices, "files")).toBe(
      "cryosparc",
    );
  });

  it("falls back to the first option's key for an empty/unknown value", () => {
    expect(normalizeEnumSelection("", choices, "files")).toBe("files");
    expect(normalizeEnumSelection("not-a-real-key", choices, "files")).toBe(
      "files",
    );
  });

  it("resolves by matching label too, same as EnumParam", () => {
    expect(normalizeEnumSelection("cryoSPARC", choices, "files")).toBe(
      "cryosparc",
    );
  });
});

describe("resolveParamClass", () => {
  it("passes KeyedEnumParam through unchanged, like EnumParam", () => {
    expect(
      resolveParamClass({ paramClass: "KeyedEnumParam" }),
    ).toBe("KeyedEnumParam");
    expect(resolveParamClass({ paramClass: "EnumParam" })).toBe("EnumParam");
  });
});
