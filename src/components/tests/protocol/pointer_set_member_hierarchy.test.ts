import { describe, expect, it } from "vitest";
import { getPointerOutputCompatibility } from "@/utils/protocolform.utils";

// The producer knows the actual Class2D inheritance; the paged member
// intentionally has no hierarchy of its own (the live API response shape).
const parentOutput = {
  outputName: "outputClasses",
  paramClass: "PointerParam",
  pointerClass: "SetOfClasses2D",
  pointerClassHierarchy: ["SetOfClasses2D", "SetOfClasses", "EMSet", "Set", "EMObject", "Object"],
  itemClassName: "Class2D",
  itemClassHierarchy: ["Class2D", "SetOfParticles", "SetOfImages", "EMSet", "Set", "EMObject", "Object"],
  parentId: 58,
  key: "outputClasses",
  value: "58.outputClasses",
};

const class2DMember = {
  scipionItemId: 1,
  name: "outputSet",
  enabled: true,
  selectable: true,
  itemClassName: "Class2D",
  pointerClass: "Class2D",
  value: "58.outputClasses.1",
  selectionKind: "set-item",
  parentId: "58",
  protocolId: "58",
  key: "outputClasses",
};

// The third argument is the proposed optional parent context. With GREEN 73
// the helper ignores it, exposing the loss of inherited item compatibility.
const compatibility = getPointerOutputCompatibility as (...args: any[]) => string;

describe("RED 74: persisted Class2D members satisfy SetOfParticles by inheritance", () => {
  it("keeps the parent SetOfClasses2D expandable, not directly selectable as SetOfParticles (baseline)", () => {
    expect(compatibility("SetOfParticles", parentOutput)).toBe("expandable");
  });

  it("does not pretend that a bare Class2D token inherits SetOfParticles (baseline)", () => {
    expect(compatibility("SetOfParticles", class2DMember)).toBe("incompatible");
  });

  it("recognizes a Class2D member as SetOfParticles using its matching parent item hierarchy", () => {
    expect(compatibility("SetOfParticles", class2DMember, parentOutput)).toBe("direct");
  });

  it("recognizes the same member as SetOfImages using the generic ancestor chain", () => {
    expect(compatibility("SetOfImages", class2DMember, parentOutput)).toBe("direct");
  });

  it("uses the parent's hierarchy for a member with itemClassName but no pointerClassHierarchy", () => {
    const member = { ...class2DMember, pointerClass: undefined };
    expect(compatibility("SetOfParticles", member, parentOutput)).toBe("direct");
  });

  it("does not lend Class2D ancestry to an unrelated member class (baseline)", () => {
    const member = { ...class2DMember, pointerClass: "Particle", itemClassName: "Particle", scipionItemId: 2, value: "58.outputClasses.2" };
    expect(compatibility("SetOfParticles", member, parentOutput)).toBe("incompatible");
  });

  it("does not mark a parent as direct merely because its items inherit SetOfParticles (baseline)", () => {
    expect(compatibility("SetOfParticles", { ...parentOutput, itemClassHierarchy: ["Class2D", "SetOfParticles"] })).not.toBe("direct");
  });
});
