import {
  describe,
  expect,
  it,
} from "vitest";

import {
  evaluateScipionCondition,
} from "@/utils/protocolform.conditions";

function resolver(
  values: Record<string, any>,
) {
  return (name: string) => ({
    found: Object.prototype
      .hasOwnProperty.call(
        values,
        name,
      ),
    value: values[name],
  });
}

describe(
  "Scipion protocol conditions",
  () => {
    it(
      "supports boolean literals",
      () => {
        expect(
          evaluateScipionCondition(
            "True",
            resolver({}),
          ),
        ).toBe(true);

        expect(
          evaluateScipionCondition(
            "False",
            resolver({}),
          ),
        ).toBe(false);
      },
    );

    it(
      "supports boolean parameters and not",
      () => {
        expect(
          evaluateScipionCondition(
            "dataStreaming",
            resolver({
              dataStreaming: true,
            }),
          ),
        ).toBe(true);

        expect(
          evaluateScipionCondition(
            "not dataStreaming",
            resolver({
              dataStreaming: false,
            }),
          ),
        ).toBe(true);
      },
    );

    it(
      "uses Python boolean numeric equality",
      () => {
        expect(
          evaluateScipionCondition(
            "boolExtractPartBx==1",
            resolver({
              boolExtractPartBx: true,
            }),
          ),
        ).toBe(true);

        expect(
          evaluateScipionCondition(
            "boolExtractPartBx==0",
            resolver({
              boolExtractPartBx: false,
            }),
          ),
        ).toBe(true);
      },
    );

    it(
      "preserves parenthesized precedence",
      () => {
        expect(
          evaluateScipionCondition(
            "not (chooseAtRandom or selectIds)",
            resolver({
              chooseAtRandom: false,
              selectIds: true,
            }),
          ),
        ).toBe(false);

        expect(
          evaluateScipionCondition(
            "not (chooseAtRandom or selectIds)",
            resolver({
              chooseAtRandom: false,
              selectIds: false,
            }),
          ),
        ).toBe(true);
      },
    );

    it(
      "supports grouped and-or expressions",
      () => {
        expect(
          evaluateScipionCondition(
            "(protein or nucleotide) and structure",
            resolver({
              protein: true,
              nucleotide: false,
              structure: false,
            }),
          ),
        ).toBe(false);

        expect(
          evaluateScipionCondition(
            "(protein or nucleotide) and structure",
            resolver({
              protein: false,
              nucleotide: true,
              structure: true,
            }),
          ),
        ).toBe(true);
      },
    );

    it(
      "supports is None and is not None",
      () => {
        expect(
          evaluateScipionCondition(
            "inputCoordinates is None",
            resolver({
              inputCoordinates: null,
            }),
          ),
        ).toBe(true);

        expect(
          evaluateScipionCondition(
            "inputCoordinates is not None",
            resolver({
              inputCoordinates:
                "421.outputCoordinates",
            }),
          ),
        ).toBe(true);

        expect(
          evaluateScipionCondition(
            "inputCoordinates is not None",
            resolver({
              inputCoordinates: null,
            }),
          ),
        ).toBe(false);
      },
    );

    it(
      "supports protocol constants",
      () => {
        expect(
          evaluateScipionCondition(
            "importFrom == IMPORT_FROM_FILES",
            resolver({
              importFrom: 0,
            }),
            {
              IMPORT_FROM_FILES: 0,
            },
          ),
        ).toBe(true);

        expect(
          evaluateScipionCondition(
            "importFrom != IMPORT_FROM_FILES",
            resolver({
              importFrom: 1,
            }),
            {
              IMPORT_FROM_FILES: 0,
            },
          ),
        ).toBe(true);
      },
    );

    it(
      "supports numeric comparisons",
      () => {
        expect(
          evaluateScipionCondition(
            "exportSymmetryGrp<=3",
            resolver({
              exportSymmetryGrp: 2,
            }),
          ),
        ).toBe(true);
      },
    );

    it(
      "fails closed for unknown identifiers",
      () => {
        expect(
          evaluateScipionCondition(
            "unknownParameter == 1",
            resolver({}),
          ),
        ).toBe(false);
      },
    );
  },
);