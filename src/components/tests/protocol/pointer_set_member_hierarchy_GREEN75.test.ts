import { describe, expect, it } from "vitest";
import { getPointerOutputCompatibility } from "@/utils/protocolform.utils";

const parentOutput = {
  parentId: 58,
  key: "outputClasses",
  pointerClass: "SetOfClasses2D",
  pointerClassHierarchy: ["SetOfClasses2D", "SetOfClasses", "EMSet"],
  itemClassName: "Class2D",
  itemClassHierarchy: ["Class2D", "SetOfParticles", "SetOfImages", "EMSet"],
};
const member = {
  parentId: "58",
  protocolId: "58",
  key: "outputClasses",
  selectionKind: "set-item",
  itemClassName: "Class2D",
  pointerClass: "Class2D",
  scipionItemId: 1,
  enabled: true,
  selectable: true,
  value: "58.outputClasses.1",
};

describe("GREEN 75: borrow item ancestry only from the matching output", () => {
  it("accepts inherited SetOfParticles for an identified Class2D member", () => {
    expect(getPointerOutputCompatibility("SetOfParticles", member, parentOutput)).toBe("direct");
  });

  it("does not borrow ancestry from another Scipion protocol", () => {
    expect(getPointerOutputCompatibility("SetOfParticles", member, { ...parentOutput, parentId: 26 })).toBe("incompatible");
  });

  it("does not borrow ancestry from another named output", () => {
    expect(getPointerOutputCompatibility("SetOfParticles", member, { ...parentOutput, key: "otherClasses" })).toBe("incompatible");
  });

  it("does not borrow ancestry when member class tokens disagree", () => {
    expect(getPointerOutputCompatibility("SetOfParticles", { ...member, pointerClass: "Particle" }, parentOutput)).toBe("incompatible");
  });

  it("does not borrow ancestry if the producer hierarchy does not declare the item class", () => {
    expect(getPointerOutputCompatibility("SetOfParticles", member, { ...parentOutput, itemClassHierarchy: ["SetOfParticles"] })).toBe("incompatible");
  });

  it("does not change direct selection of an ordinary SetOfParticles output", () => {
    expect(getPointerOutputCompatibility("SetOfParticles", { pointerClass: "SetOfParticles" })).toBe("direct");
  });
});
