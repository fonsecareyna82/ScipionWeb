import { describe, expect, it } from "vitest";
import { setMultiPointerSelection, setPointerSelection, setScalarPointerSelection } from "@/utils/protocolform.state";

const key = "0_inputParticles";
const class3D = { value: "58.outputClasses.1", pointerClass: "Class3D", parentId: "58", scipionItemId: 1, selectionKind: "set-item" };
const class2D = { value: "59.outputClasses.42", pointerClass: "Class2D", parentId: "59", scipionItemId: 42, selectionKind: "set-item" };

function withParam(param: Record<string, unknown>) {
  return { params: { [key]: { paramClass: "PointerParam", ...param } } };
}

describe("RED 78: selecting an object must not redefine a PointerParam's accepted class", () => {
  it("retains SetOfParticles when the selected member is Class3D", () => {
    const next = setPointerSelection(withParam({ pointerClass: "SetOfParticles" }), key, class3D);
    expect(next.params![key].pointerClass).toBe("SetOfParticles");
  });

  it("retains all declared alternatives instead of replacing them with the selected subtype", () => {
    const next = setPointerSelection(withParam({ pointerClass: "SetOfParticles,SetOfVolumes" }), key, class3D);
    expect(next.params![key].pointerClass).toBe("SetOfParticles,SetOfVolumes");
  });

  it("does not invent a new restriction for a pointer without a declared pointerClass", () => {
    const next = setPointerSelection(withParam({ label: "Unrestricted input" }), key, class3D);
    expect(next.params![key]).not.toHaveProperty("pointerClass");
  });

  it("preserves an alternative accepted-class field without adding the chosen member as another accepted type", () => {
    const next = setPointerSelection(withParam({ accept: "SetOfParticles" }), key, class3D);
    expect(next.params![key].accept).toBe("SetOfParticles");
    expect(next.params![key]).not.toHaveProperty("pointerClass");
  });

  it("continues to offer the original type after multiple replacements", () => {
    const initial = withParam({ pointerClass: "SetOfParticles", editableValue: "" });
    const after3D = setPointerSelection(initial, key, class3D);
    const after2D = setPointerSelection(after3D, key, class2D);
    expect(after3D.params![key].pointerClass).toBe("SetOfParticles");
    expect(after2D.params![key].pointerClass).toBe("SetOfParticles");
    expect(after2D.params![key].value).toBe(class2D.value);
  });

  it("baseline: forwards the native item reference without reconstructing it", () => {
    const next = setPointerSelection(withParam({ pointerClass: "SetOfParticles" }), key, class3D);
    expect(next.params![key].value).toBe("58.outputClasses.1");
    expect(next.params![key].editableValue).toBe("58.outputClasses.1");
    expect(next.params![key].parentId).toBe("58");
  });

  it("baseline: scalar pointer mode already preserves the parameter's accepted class", () => {
    const next = setScalarPointerSelection(withParam({ pointerClass: "SetOfParticles" }), key, class3D);
    expect(next.params![key].pointerClass).toBe("SetOfParticles");
    expect(next.params![key].pointerMode).toBe(true);
  });

  it("baseline: multi-pointer selection keeps its declared class and native values", () => {
    const next = setMultiPointerSelection(withParam({ paramClass: "MultiPointerParam", pointerClass: "SetOfParticles" }), key, [class3D, class2D]);
    expect(next.params![key].pointerClass).toBe("SetOfParticles");
    expect(next.params![key].editableValue.map((item: { value: string }) => item.value)).toEqual([class3D.value, class2D.value]);
  });
});
