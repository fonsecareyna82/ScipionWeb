import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExecuteModeButton from "@/components/protocol/ExecuteModeButton";

const executeModeMap = {
  launch: {
    label: "Launch",
    help: "Launch protocol",
  },
  restart: {
    label: "Restart",
    help: "Restart protocol",
  },
  schedule: {
    label: "Schedule",
    help: "Schedule protocol",
  },
};

type RenderOverrides = Partial<React.ComponentProps<typeof ExecuteModeButton>>;

function renderComponent(overrides: RenderOverrides = {}) {
  const onSelectedModeChange = vi.fn();
  const onExecute = vi.fn();

  render(
    <ExecuteModeButton
      executeModeMap={executeModeMap}
      selectedMode="launch"
      onSelectedModeChange={onSelectedModeChange}
      onExecute={onExecute}
      disabled={false}
      loading={false}
      {...overrides}
    />,
  );

  return { onSelectedModeChange, onExecute };
}

describe("ExecuteModeButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the selected mode label", () => {
    renderComponent();

    expect(screen.getByRole("button", { name: "Launch" })).toBeInTheDocument();
  });

  it("falls back to the first available mode when selectedMode is invalid", () => {
    const { onExecute } = renderComponent({
      selectedMode: "non-existent",
    });

    const mainButton = screen.getByRole("button", { name: "Launch" });
    expect(mainButton).toBeInTheDocument();

    fireEvent.click(mainButton);

    expect(onExecute).toHaveBeenCalledWith("launch");
  });

  it("falls back to launch and disables the buttons when there are no modes", () => {
    const { onExecute } = renderComponent({
      executeModeMap: {},
      selectedMode: null,
    });

    const mainButton = screen.getByRole("button", { name: "launch" });
    expect(mainButton).toBeDisabled();

    fireEvent.click(mainButton);
    expect(onExecute).not.toHaveBeenCalled();

    const buttons = screen.getAllByRole("button");
    expect(buttons[1]).toBeDisabled();
  });

  it("executes the selected mode when clicking the main button", () => {
    const { onExecute } = renderComponent({
      selectedMode: "restart",
    });

    fireEvent.click(screen.getByRole("button", { name: "Restart" }));

    expect(onExecute).toHaveBeenCalledWith("restart");
  });

  it("opens the menu and selecting a mode changes it and executes it", () => {
    const { onSelectedModeChange, onExecute } = renderComponent();

    const buttons = screen.getAllByRole("button");
    const toggleButton = buttons[1];

    fireEvent.click(toggleButton);

    const restartItem = screen.getByRole("menuitem", { name: /Restart/i });
    fireEvent.click(restartItem);

    expect(onSelectedModeChange).toHaveBeenCalledWith("restart");
    expect(onExecute).toHaveBeenCalledWith("restart");
  });

  it("does not execute or open the menu when disabled", () => {
    const { onExecute } = renderComponent({
      disabled: true,
    });

    const buttons = screen.getAllByRole("button");
    const mainButton = buttons[0];
    const toggleButton = buttons[1];

    expect(mainButton).toBeDisabled();
    expect(toggleButton).toBeDisabled();

    fireEvent.click(mainButton);
    fireEvent.click(toggleButton);

    expect(onExecute).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("shows a spinner and disables interactions when loading", () => {
    const { onExecute } = renderComponent({
      loading: true,
    });

    const buttons = screen.getAllByRole("button");
    const mainButton = buttons[0];
    const toggleButton = buttons[1];

    expect(mainButton).toBeDisabled();
    expect(toggleButton).toBeDisabled();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();

    fireEvent.click(mainButton);
    fireEvent.click(toggleButton);

    expect(onExecute).not.toHaveBeenCalled();
  });

  it("uses the raw mode key as label when a mode has no custom label", () => {
    const { onExecute } = renderComponent({
      executeModeMap: {
        customMode: {
          help: "Custom help",
        },
      },
      selectedMode: "customMode",
    });

    const mainButton = screen.getByRole("button", { name: "customMode" });
    expect(mainButton).toBeInTheDocument();

    fireEvent.click(mainButton);
    expect(onExecute).toHaveBeenCalledWith("customMode");
  });
});