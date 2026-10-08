import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProtocolLogsPanel from "@/components/protocol/ProtocolLogsPanel";

const channels = [{ id: "stdout", label: "Output" }];

function renderGlobalSearch() {
  const onSearchAll = vi.fn().mockResolvedValue({
    matches: [
      { offset: 25, text: "ERROR at the beginning" },
      { offset: 990000, text: "ERROR near the end" },
    ],
    complete: true,
  });
  const onNavigateToOffset = vi.fn().mockResolvedValue(undefined);
  render(
    <ProtocolLogsPanel
      sortedLogChannels={channels}
      activeLogChannelId="stdout"
      setActiveLogChannelId={vi.fn()}
      activeLogText={"only the newest lines\nno matching text here"}
      logsError={null}
      logsContainerRef={{ current: null }}
      updateStickToBottom={vi.fn()}
      onSearchAll={onSearchAll}
      onNavigateToOffset={onNavigateToOffset}
    />,
  );
  return { onSearchAll, onNavigateToOffset };
}

describe("ProtocolLogsPanel global log search", () => {
  it("queries the server even when the visible window has no matches", async () => {
    const { onSearchAll } = renderGlobalSearch();
    const input = screen.getByRole("textbox", { name: /search logs/i });
    fireEvent.change(input, { target: { value: "ERROR" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onSearchAll).toHaveBeenCalledWith("stdout", "ERROR"));
    await waitFor(() => expect(screen.getByText("1 of 2")).toBeInTheDocument());
  });

  it("navigates to byte offsets outside the loaded log window", async () => {
    const { onNavigateToOffset } = renderGlobalSearch();
    const input = screen.getByRole("textbox", { name: /search logs/i });
    fireEvent.change(input, { target: { value: "ERROR" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("1 of 2")).toBeInTheDocument());
    await waitFor(() => expect(onNavigateToOffset).toHaveBeenCalledWith(25));
    fireEvent.click(screen.getByRole("button", { name: /next log match/i }));
    await waitFor(() => expect(onNavigateToOffset).toHaveBeenCalledWith(990000));
  });
});
