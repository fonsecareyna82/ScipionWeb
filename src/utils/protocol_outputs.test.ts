import {
  describe,
  expect,
  it,
} from "vitest";

import {
  mergeProtocolOutputsPreservingOrder,
} from "@/utils/protocol_outputs";

describe(
  "protocol outputs",
  () => {
    it(
      "preserves the current output order when fresh details arrive in a different order",
      () => {
        const currentOutputs = [
          {
            name: "outputParticles",
            info: "Old particles",
            persisted: true,
          },
          {
            name: "boxsize",
            info: "128",
            persisted: true,
          },
          {
            name: "threshold",
            info: "0.5",
            persisted: true,
          },
        ];

        const freshOutputs = [
          {
            outputName: "boxsize",
            info: "256",
            pointerClass: "Integer",
          },
          {
            outputName: "threshold",
            info: "0.75",
            pointerClass: "Float",
          },
          {
            outputName: "outputParticles",
            info: "Particles (372 items)",
            pointerClass: "SetOfParticles",
          },
        ];

        const result =
          mergeProtocolOutputsPreservingOrder(
            currentOutputs,
            freshOutputs,
          ) as Array<Record<string, unknown>>;

        expect(
          result.map(
            (output) =>
              output.name ??
              output.outputName,
          ),
        ).toEqual([
          "outputParticles",
          "boxsize",
          "threshold",
        ]);

        expect(result[0]).toMatchObject({
          name: "outputParticles",
          outputName: "outputParticles",
          info: "Particles (372 items)",
          pointerClass: "SetOfParticles",
          persisted: true,
        });

        expect(result[1]).toMatchObject({
          name: "boxsize",
          outputName: "boxsize",
          info: "256",
          pointerClass: "Integer",
          persisted: true,
        });

        expect(result[2]).toMatchObject({
          name: "threshold",
          outputName: "threshold",
          info: "0.75",
          pointerClass: "Float",
          persisted: true,
        });
      },
    );

    it(
      "removes missing outputs and appends new outputs at the end",
      () => {
        const currentOutputs = [
          {
            name: "outputA",
            info: "A old",
          },
          {
            name: "outputB",
            info: "B old",
          },
          {
            name: "outputC",
            info: "C old",
          },
        ];

        const freshOutputs = [
          {
            outputName: "outputC",
            info: "C fresh",
          },
          {
            outputName: "outputA",
            info: "A fresh",
          },
          {
            outputName: "outputD",
            info: "D new",
          },
        ];

        const result =
          mergeProtocolOutputsPreservingOrder(
            currentOutputs,
            freshOutputs,
          ) as Array<Record<string, unknown>>;

        expect(
          result.map(
            (output) =>
              output.name ??
              output.outputName,
          ),
        ).toEqual([
          "outputA",
          "outputC",
          "outputD",
        ]);

        expect(
          result.map(
            (output) => output.info,
          ),
        ).toEqual([
          "A fresh",
          "C fresh",
          "D new",
        ]);
      },
    );

    it(
      "uses the fresh order when there is no previous output order",
      () => {
        const freshOutputs = [
          {
            outputName: "outputC",
          },
          {
            outputName: "outputA",
          },
          {
            outputName: "outputB",
          },
        ];

        const result =
          mergeProtocolOutputsPreservingOrder(
            [],
            freshOutputs,
          ) as Array<Record<string, unknown>>;

        expect(
          result.map(
            (output) =>
              output.outputName,
          ),
        ).toEqual([
          "outputC",
          "outputA",
          "outputB",
        ]);
      },
    );
  },
);