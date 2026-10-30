import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const service = { fetchProtocolActivity: vi.fn() };
vi.mock("@/ProjectServiceContext", () => ({ useProjectService: () => service }));
const toastMocks = vi.hoisted(() => ({ custom: vi.fn(), dismiss: vi.fn(), error: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: toastMocks }));

import ProtocolActivityBell, { eventLink, protocolLink } from "@/components/header/ProtocolActivityBell";

const ended = {
  projectId: 7, projectName: "Workflow_2D", protocolId: "4", protocolClassName: "XmippProtCTFConsensus",
  label: "ctf consensus", status: "failed", endedAt: "2026-10-19T12:00:00+00:00",
};

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname + location.search}</div>;
}

function renderBell() {
  return render(
    <MemoryRouter initialEntries={["/projects"]}>
      <ProtocolActivityBell />
      <Routes><Route path="*" element={<Where />} /></Routes>
    </MemoryRouter>,
  );
}

describe("ProtocolActivityBell", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it("asks from the previous answer's time, and tells of each run that ended once", async () => {
    service.fetchProtocolActivity
      .mockResolvedValueOnce({ now: "T1", live: 2, events: [] })
      .mockResolvedValueOnce({ now: "T2", live: 1, events: [ended] })
      .mockResolvedValue({ now: "T3", live: 1, events: [ended] });
    renderBell();
    await waitFor(() => expect(service.fetchProtocolActivity).toHaveBeenCalledWith(null));
    await act(async () => { vi.advanceTimersByTime(10000); });
    await waitFor(() => expect(service.fetchProtocolActivity).toHaveBeenLastCalledWith("T1"));
    await waitFor(() => expect(toastMocks.custom).toHaveBeenCalledTimes(1));
    await act(async () => { vi.advanceTimersByTime(10000); });
    await waitFor(() => expect(service.fetchProtocolActivity).toHaveBeenLastCalledWith("T2"));
    // The same run again is not a new notice.
    expect(toastMocks.custom).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Protocol activity, 1 new" })).toBeInTheDocument();
  });

  it("lists the runs and opens the protocol in its project", async () => {
    service.fetchProtocolActivity.mockResolvedValue({ now: "T1", live: 0, events: [ended] });
    localStorage.setItem("scipionweb.activity.since", JSON.stringify("T0"));
    renderBell();
    fireEvent.click(await screen.findByRole("button", { name: /Protocol activity, 1 new/ }));
    fireEvent.click(screen.getByText("ctf consensus failed"));
    expect(screen.getByTestId("where")).toHaveTextContent("/project/load/7?protocol=4");
    // Seen: no count any more.
    expect(screen.getByRole("button", { name: "Protocol activity" })).toBeInTheDocument();
  });

  it("closes when clicking elsewhere, also on a graph that stops the event", async () => {
    service.fetchProtocolActivity.mockResolvedValue({ now: "T1", live: 0, events: [] });
    render(
      <MemoryRouter>
        <ProtocolActivityBell />
        <div data-testid="graph" onPointerDown={(e) => e.stopPropagation()} />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Protocol activity" }));
    expect(screen.getByRole("dialog", { name: "Protocol activity" })).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByTestId("graph"));
    expect(screen.queryByRole("dialog", { name: "Protocol activity" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Protocol activity" }));
    fireEvent.click(screen.getByRole("button", { name: "Close protocol activity" }));
    expect(screen.queryByRole("dialog", { name: "Protocol activity" })).toBeNull();
  });

  it("can be told not to notify: no pop-ups and no badge, the list stays", async () => {
    service.fetchProtocolActivity
      .mockResolvedValueOnce({ now: "T1", live: 0, events: [] })
      .mockResolvedValue({ now: "T2", live: 0, events: [ended] });
    renderBell();
    fireEvent.click(await screen.findByRole("button", { name: "Protocol activity" }));
    fireEvent.click(screen.getByLabelText("Notify me when runs end or the monitor alerts"));
    expect(localStorage.getItem("scipionweb.activity.notifications")).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: "Protocol activity" }));
    await act(async () => { vi.advanceTimersByTime(10000); });
    await waitFor(() => expect(service.fetchProtocolActivity).toHaveBeenLastCalledWith("T1"));
    expect(toastMocks.custom).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Protocol activity" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Protocol activity" }));
    expect(await screen.findByText("ctf consensus failed")).toBeInTheDocument();
  });

  it("tells of a monitor alert and opens its project with the monitor", async () => {
    const alert = {
      projectId: 7, projectName: "Workflow_2D", protocolId: "5", protocolClassName: "CistemProtCTFFind",
      label: "Astigmatism above 1000 Å: mic_012 and 2 more", status: "alert", threshold: "maxAstigmatism",
      endedAt: "2026-10-19T12:01:00+00:00",
    };
    service.fetchProtocolActivity.mockResolvedValue({ now: "T1", live: 1, events: [alert] });
    localStorage.setItem("scipionweb.activity.since", JSON.stringify("T0"));
    renderBell();

    await waitFor(() => expect(toastMocks.custom).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole("button", { name: /Protocol activity, 1 new/ }));
    fireEvent.click(screen.getByText("Astigmatism above 1000 Å: mic_012 and 2 more"));

    expect(screen.getByTestId("where")).toHaveTextContent("/project/load/7?monitor=1");
  });

  it("tells administrators of a new account and opens the users of the settings", async () => {
    const account = {
      projectId: 0, projectName: "Users", protocolId: "user-12", protocolClassName: "",
      label: "Ana Pi (ana@example.com) signed up and waits for activation", status: "account",
      endedAt: "2026-10-19T12:02:00+00:00",
    };
    service.fetchProtocolActivity.mockResolvedValue({ now: "T1", live: 0, events: [account] });
    localStorage.setItem("scipionweb.activity.since", JSON.stringify("T0"));
    renderBell();

    await waitFor(() => expect(toastMocks.custom).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole("button", { name: /Protocol activity, 1 new/ }));
    fireEvent.click(screen.getByText("Ana Pi (ana@example.com) signed up and waits for activation"));

    expect(screen.getByTestId("where")).toHaveTextContent("/settings?tab=users");
  });

  it("links protocols safely", () => {
    expect(eventLink({ projectId: 7, protocolId: "12", status: "failed" })).toBe("/project/load/7?protocol=12");
    expect(protocolLink({ projectId: 7, protocolId: "12" })).toBe("/project/load/7?protocol=12");
  });
});
