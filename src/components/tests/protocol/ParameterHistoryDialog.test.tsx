import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ParameterHistoryDialog from "@/components/protocol/ParameterHistoryDialog";
import type { ProtocolLaunch } from "@/services/ProjectService";

const launches: ProtocolLaunch[] = [
  { id: 3, mode: "restart", launchedAt: "2026-10-19T12:00:00Z", user: { id: 2, name: "Ana López" }, params: { resolution: 4, astigmatism: 1000, threads: 8 } },
  { id: 2, mode: "continue", launchedAt: "2026-10-19T10:00:00Z", user: { id: 1, name: "Bo" }, params: { resolution: 5, astigmatism: 1000, threads: 8 } },
  { id: 1, mode: "launch", launchedAt: "2026-10-18T10:00:00Z", user: null, params: { resolution: 5, astigmatism: 1000, threads: 4 } },
];

const details = {
  form: { sections: [{ label: "Criteria", params: [
    { name: "resolution", label: "Max resolution (Å)" },
    { name: "astigmatism", label: "Astigmatism (Å)" },
    { name: "threads", label: "Threads" },
  ] }] },
  values: {},
};

function renderDialog(fetchLaunches = vi.fn().mockResolvedValue(launches)) {
  render(
    <ParameterHistoryDialog open projectName="Workflow_2D" protocolId="12" protocolLabel="ctf consensus"
      fetchLaunches={fetchLaunches} fetchProtocolDetails={vi.fn().mockResolvedValue(details)} onClose={() => undefined} />,
  );
  return fetchLaunches;
}

describe("ParameterHistoryDialog", () => {
  it("shows what changed in each launch since the one before, by label", async () => {
    const fetchLaunches = renderDialog();
    expect(await screen.findByText("by Ana López")).toBeTruthy();
    expect(fetchLaunches).toHaveBeenCalledWith("12");
    expect(await screen.findByText("Max resolution (Å)")).toBeTruthy();
    expect(screen.getByText(/1 parameter changed since/)).toBeTruthy();
    expect(screen.queryByText("Astigmatism (Å)")).toBeNull();

    fireEvent.click(screen.getByLabelText("Show all parameters"));
    expect(screen.getByText("Astigmatism (Å)")).toBeTruthy();
  });

  it("shows every parameter of the first launch kept", async () => {
    renderDialog();
    const list = await screen.findByRole("list", { name: "Launches" });
    const buttons = within(list).getAllByRole("button");
    fireEvent.click(buttons[2]);
    expect(screen.getByText("The first launch kept: every parameter")).toBeTruthy();
    expect(await screen.findByText("Threads")).toBeTruthy();
    expect(screen.getByText("Astigmatism (Å)")).toBeTruthy();
  });

  it("says so when no launch was kept yet", async () => {
    renderDialog(vi.fn().mockResolvedValue([]));
    expect(await screen.findByText(/no launches kept yet/)).toBeTruthy();
  });
});
