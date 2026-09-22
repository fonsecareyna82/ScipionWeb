import {
  describe,
  expect,
  it,
} from "vitest";

import {
  matchesPointerClassHierarchy,
} from "@/utils/protocolform.utils";


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