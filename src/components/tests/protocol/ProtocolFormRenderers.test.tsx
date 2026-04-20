import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  renderBooleanParamRow,
  renderDefaultParamRow,
  renderEnumParamRow,
  renderPathParamRow,
  renderPointerParamRow,
} from "@/components/protocol/ProtocolFormRenderers";

const mockClearParamValue = vi.fn((prev, key) => ({
  ...prev,
  _clear: key,
}));

const mockSetParamEditableValue = vi.fn((prev, key, value) => ({
  ...prev,
  _editable: { key, value },
}));

const mockSetParamValueAndEditableValue = vi.fn((prev, key, value) => ({
  ...prev,
  _valueAndEditable: { key, value },
}));

const mockCoerceBooleanValue = vi.fn((value: any) => Boolean(value));
const mockCoerceReadOnlyFlag = vi.fn((value: any) => Boolean(value));

const mockNormalizeEnumOptions = vi.fn(
  (_choices: any) => [
    { label: "Fast", value: "fast" },
    { label: "Accurate", value: "accurate" },
  ],
);

const mockNormalizeEnumSelection = vi.fn(
  (value: any, _choices: any, _defaultValue: any) => value,
);

vi.mock("@/utils/protocolform.state", () => ({
  clearParamValue: (prev: any, key: any) => mockClearParamValue(prev, key),
  setParamEditableValue: (prev: any, key: any, value: any) =>
    mockSetParamEditableValue(prev, key, value),
  setParamValueAndEditableValue: (prev: any, key: any, value: any) =>
    mockSetParamValueAndEditableValue(prev, key, value),
}));

vi.mock("@/utils/protocolform.utils", () => ({
  coerceBooleanValue: (value: any) => mockCoerceBooleanValue(value),
  coerceReadOnlyFlag: (value: any) => mockCoerceReadOnlyFlag(value),
  normalizeEnumOptions: (choices: any) => mockNormalizeEnumOptions(choices),
  normalizeEnumSelection: (value: any, choices: any, defaultValue: any) =>
    mockNormalizeEnumSelection(value, choices, defaultValue),
}));

vi.mock("@/components/protocol/ParamRow", () => ({
  default: ({
    label,
    control,
    onClear,
    onOpenFind,
    onBrowsePath,
    hasWizard,
    onOpenWizard,
  }: any) => (
    <div data-testid="param-row">
      <div>{label}</div>
      <div data-testid="param-control">{control}</div>
      {onClear && <button onClick={onClear}>Clear</button>}
      {onOpenFind && <button onClick={onOpenFind}>Find</button>}
      {onBrowsePath && <button onClick={onBrowsePath}>Browse</button>}
      {hasWizard && <button onClick={onOpenWizard}>Wizard</button>}
    </div>
  ),
}));

vi.mock("@/components/protocol/WrapWithDrop", () => ({
  default: ({ control, def, paramKey }: any) => (
    <div
      data-testid="wrap-with-drop"
      data-param-key={paramKey}
      data-param-class={String(def?.paramClass ?? "")}
    >
      {control}
    </div>
  ),
}));

function getCommonProps() {
  return {
    stableKey: "stable-key",
    label: "Parameter label",
    helpText: "Help text",
    rowIndex: 0,
    layoutVariant: "standard" as const,
    isInline: false,
    fieldWidth: 240,
    fieldContainerSx: {},
    advancedSlot: null,
    stateKey: "inputParam",
    protocolDetails: {
      params: {
        inputParam: {
          value: "current-value",
          editableValue: "current-editable",
          pointerClass: "SetOfParticles",
        },
      },
    },
    setProtocolDetails: vi.fn(),
    wizardUi: {
      hasWizard: true,
      onOpenWizard: vi.fn(),
      wizardTooltip: "Open wizard",
    },
  };
}

describe("ProtocolFormRenderers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderPointerParamRow renders input, WrapWithDrop and pointer actions", () => {
    const props = getCommonProps();
    const onOpenFind = vi.fn();

    render(
      renderPointerParamRow({
        ...props,
        def: { readOnly: false, default: "" },
        defResolved: {},
        dragOverKey: null,
        setDragOverKey: vi.fn(),
        onOpenFind,
      }),
    );

    expect(screen.getByTestId("wrap-with-drop")).toBeInTheDocument();
    expect(screen.getByDisplayValue("current-editable")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    expect(onOpenFind).toHaveBeenCalledWith("inputParam");

    fireEvent.click(screen.getByRole("button", { name: "Wizard" }));
    expect(props.wizardUi.onOpenWizard).toHaveBeenCalledTimes(1);
  });

  it("renderPointerParamRow updates state on input change and clears value", () => {
    const prev = { params: {} };
    const setProtocolDetails = vi.fn((updater) => updater(prev));

    const props = {
      ...getCommonProps(),
      setProtocolDetails,
    };

    render(
      renderPointerParamRow({
        ...props,
        def: { readOnly: false, default: "" },
        defResolved: {},
        dragOverKey: null,
        setDragOverKey: vi.fn(),
        onOpenFind: vi.fn(),
      }),
    );

    fireEvent.change(screen.getByDisplayValue("current-editable"), {
      target: { value: "new-pointer" },
    });

    expect(mockSetParamValueAndEditableValue).toHaveBeenCalledWith(
      prev,
      "inputParam",
      "new-pointer",
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(mockClearParamValue).toHaveBeenCalledWith(prev, "inputParam");
  });

  it("renderPathParamRow wraps with drop when pointer is enabled and calls browse/find", () => {
    const props = getCommonProps();
    const onBrowsePath = vi.fn();
    const onOpenFind = vi.fn();

    render(
      renderPathParamRow({
        ...props,
        def: { value: "", pointerClass: "SetOfParticles" },
        dragOverKey: null,
        setDragOverKey: vi.fn(),
        onBrowsePath,
        onOpenFind,
      }),
    );

    expect(screen.getByTestId("wrap-with-drop")).toBeInTheDocument();
    expect(screen.getByDisplayValue("current-editable")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Browse" }));
    expect(onBrowsePath).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    expect(onOpenFind).toHaveBeenCalledWith("inputParam");
  });

  it("renderPathParamRow does not wrap with drop when pointer is not enabled", () => {
    const props = getCommonProps();

    render(
      renderPathParamRow({
        ...props,
        def: { value: "" },
        protocolDetails: {
          params: {
            inputParam: {
              value: "path-value",
              editableValue: "path-value",
            },
          },
        },
        dragOverKey: null,
        setDragOverKey: vi.fn(),
        onBrowsePath: vi.fn(),
        onOpenFind: vi.fn(),
      }),
    );

    expect(screen.queryByTestId("wrap-with-drop")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("path-value")).toBeInTheDocument();
  });

  it("renderEnumParamRow renders radio options and updates editable value", () => {
    const prev = { params: {} };
    const setProtocolDetails = vi.fn((updater) => updater(prev));

    const props = {
      ...getCommonProps(),
      setProtocolDetails,
    };

    render(
      renderEnumParamRow({
        ...props,
        def: {
          display: 0,
          choices: ["fast", "accurate"],
          default: "fast",
        },
        value: "fast",
      })!,
    );

    fireEvent.click(screen.getByLabelText("Accurate"));

    expect(mockSetParamEditableValue).toHaveBeenCalledWith(
      prev,
      "inputParam",
      "accurate",
    );
  });

  it("renderBooleanParamRow renders a switch and updates value", () => {
    const prev = { params: {} };
    const setProtocolDetails = vi.fn((updater) => updater(prev));

    const props = {
      ...getCommonProps(),
      setProtocolDetails,
    };

    render(
      renderBooleanParamRow({
        ...props,
        def: { value: false },
        value: true,
      }),
    );

    const checkbox = screen.getByRole("switch");
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);

    expect(mockSetParamValueAndEditableValue).toHaveBeenCalledWith(
      prev,
      "inputParam",
      false,
    );
  });

  it("renderDefaultParamRow renders a text field and updates editable value", () => {
    const prev = { params: {} };
    const setProtocolDetails = vi.fn((updater) => updater(prev));

    const props = {
      ...getCommonProps(),
      setProtocolDetails,
    };

    render(
      renderDefaultParamRow({
        ...props,
        def: { default: "fallback" },
        value: "initial text",
      }),
    );

    fireEvent.change(screen.getByDisplayValue("initial text"), {
      target: { value: "updated text" },
    });

    expect(mockSetParamEditableValue).toHaveBeenCalledWith(
      prev,
      "inputParam",
      "updated text",
    );
  });
});