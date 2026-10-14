import {
  describe,
  expect,
  it,
} from "vitest";

import {
  matchesPointerClassHierarchy,
} from "@/utils/protocolform.utils";
import * as pointerCompatibilityModule from "@/utils/protocolform.utils";


describe(
  "matchesPointerClassHierarchy",
  () => {
    it(
      "accepts subclasses through the output class hierarchy",
      () => {
        const output = {
          pointerClass:
            "SetOfMicrographs",

          pointerClassHierarchy: [
            "SetOfMicrographs",
            "SetOfMicrographsBase",
            "SetOfImages",
            "EMSet",
          ],
        };

        expect(
          matchesPointerClassHierarchy(
            "SetOfImages",
            output,
          ),
        ).toBe(true);
      },
    );

    it(
      "rejects sibling classes that do not inherit from the expected class",
      () => {
        const output = {
          pointerClass:
            "SetOfMovies",

          pointerClassHierarchy: [
            "SetOfMovies",
            "SetOfMicrographsBase",
            "SetOfImages",
            "EMSet",
          ],
        };

        expect(
          matchesPointerClassHierarchy(
            "SetOfMicrographs",
            output,
          ),
        ).toBe(false);
      },
    );

    it(
      "preserves exact class matching when hierarchy metadata is missing",
      () => {
        expect(
          matchesPointerClassHierarchy(
            "SetOfParticles",
            {
              pointerClass:
                "SetOfParticles",
            },
          ),
        ).toBe(true);

        expect(
          matchesPointerClassHierarchy(
            "SetOfImages",
            {
              pointerClass:
                "SetOfParticles",
            },
          ),
        ).toBe(false);
      },
    );

    it(
      "supports multiple accepted pointer classes",
      () => {
        const output = {
          pointerClass:
            "SetOfParticles",

          pointerClassHierarchy: [
            "SetOfParticles",
            "SetOfImages",
            "EMSet",
          ],
        };

        expect(
          matchesPointerClassHierarchy(
            [
              "SetOfCoordinates",
              "SetOfImages",
            ],
            output,
          ),
        ).toBe(true);
      },
    );
  },
);


// RED 47: A pointer can select a compatible output directly, or expand a
// compatible *set of items*. These are distinct operations. The classifier
// will be introduced by GREEN 48; access it as optional so this RED suite
// reports assertion failures rather than a missing-export compile error.
const classifyPointerOutput = (expected: unknown, output: unknown) => {
  const classifier = (
    pointerCompatibilityModule as {
      getPointerOutputCompatibility?: (
        expected: unknown,
        output: unknown,
      ) => "direct" | "expandable" | "incompatible";
    }
  ).getPointerOutputCompatibility;

  return classifier?.(expected, output);
};

describe("getPointerOutputCompatibility (RED 47)", () => {
  const volumeSet = {
    pointerClass: "SetOfVolumes",
    pointerClassHierarchy: ["SetOfVolumes", "EMSet", "Set", "EMObject", "Object"],
    itemClassName: "Volume",
    itemClassHierarchy: ["Volume", "EMObject", "Object"],
  };

  it("selects a Volume output directly, without using item metadata", () => {
    expect(
      classifyPointerOutput("Volume", {
        pointerClass: "Volume",
        pointerClassHierarchy: ["Volume", "EMObject", "Object"],
      }),
    ).toBe("direct");
  });

  it("exposes a SetOfVolumes as expandable, never directly selectable, for Volume", () => {
    expect(classifyPointerOutput("Volume", volumeSet)).toBe("expandable");
  });

  it("matches descendants of an expected item class without hardcoded set names", () => {
    const particleSet = {
      pointerClass: "SetOfParticles",
      pointerClassHierarchy: ["SetOfParticles", "SetOfImages", "EMSet", "Set"],
      itemClassName: "Particle",
      itemClassHierarchy: ["Particle", "Image", "EMObject", "Object"],
    };

    expect(classifyPointerOutput("Image", particleSet)).toBe("expandable");
  });

  it("rejects unrelated sets, missing item metadata, and spurious non-set item metadata", () => {
    const particleSet = {
      pointerClass: "SetOfParticles",
      pointerClassHierarchy: ["SetOfParticles", "EMSet", "Set"],
      itemClassName: "Particle",
      itemClassHierarchy: ["Particle", "Image", "EMObject"],
    };

    expect(classifyPointerOutput("Volume", particleSet)).toBe("incompatible");
    expect(
      classifyPointerOutput("Volume", {
        pointerClass: "SetOfVolumes",
        pointerClassHierarchy: ["SetOfVolumes", "EMSet"],
      }),
    ).toBe("incompatible");
    expect(
      classifyPointerOutput("Volume", {
        pointerClass: "Micrograph",
        pointerClassHierarchy: ["Micrograph", "Image"],
        itemClassName: "Volume",
        itemClassHierarchy: ["Volume", "EMObject"],
      }),
    ).toBe("incompatible");
  });

  it("prefers directly selectable outputs when any accepted class matches the output", () => {
    expect(
      classifyPointerOutput(["Volume", "SetOfVolumes"], volumeSet),
    ).toBe("direct");
  });

  it("preserves the existing strict output-only class-hierarchy matcher", () => {
    expect(matchesPointerClassHierarchy("Volume", volumeSet)).toBe(false);
    expect(matchesPointerClassHierarchy("SetOfVolumes", volumeSet)).toBe(true);
  });
});
