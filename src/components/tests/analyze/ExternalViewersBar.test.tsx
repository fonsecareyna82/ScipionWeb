import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const svc = vi.hoisted(() => ({
  listExternalViewers: vi.fn(),
  launchExternalViewer: vi.fn(),
}));
const remote = vi.hoisted(() => ({ available: true }));
const fetchWithAuth = vi.hoisted(() => vi.fn());

vi.mock("@/ProjectServiceContext", () => ({ useProjectService: () => svc }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/api/auth", () => ({ fetchWithAuth }));
vi.mock("@/components/ui/floating-window/FloatingWindow", () => ({
  default: ({ title, children, onClose }: any) => (
    <div role="dialog" aria-label={String(title)}>
      <button type="button" onClick={onClose}>Close window</button>
      {children}
    </div>
  ),
}));
vi.mock("@/api/remoteDisplays", async () => {
  const actual = await vi.importActual<typeof import("@/api/remoteDisplays")>("@/api/remoteDisplays");
  return { ...actual, remoteDisplaysAvailable: () => Promise.resolve(remote.available) };
});

import ExternalViewersBar from "@/components/analyze/ExternalViewersBar";
import RemoteDisplayHost from "@/components/analyze/RemoteDisplayHost";
import { forgetRemoteDisplay, getRemoteDisplays, resetRemoteDisplaysAvailability } from "@/api/remoteDisplays";

const DISPLAY = { id: "abc", title: "3D viewer · outputVolume (#3)", path: "remote-displays/abc/index.html?password=p" };

describe("ExternalViewersBar", () => {
  beforeEach(() => {
    svc.listExternalViewers.mockResolvedValue([{ id: "viewer3d", label: "3D viewer", available: true }]);
    svc.launchExternalViewer.mockReset();
    fetchWithAuth.mockReset().mockResolvedValue({ ok: true });
    getRemoteDisplays().forEach((display) => forgetRemoteDisplay(display.id));
    resetRemoteDisplaysAvailability();
    vi.spyOn(window, "open").mockReturnValue(null);
  });

  const renderPage = () => render(
    <>
      <ExternalViewersBar projectId={7} protocolId={3} outputName="outputVolume" loadDelayMs={0} />
      <RemoteDisplayHost />
    </>,
  );

  it("opens the viewer on the server and shows only it in a window of the web", async () => {
    remote.available = true;
    svc.launchExternalViewer.mockResolvedValue({ success: true, viewerId: "viewer3d", display: DISPLAY });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /3D viewer/ }));

    const frame = await screen.findByTitle(DISPLAY.title);
    expect(frame.getAttribute("src")).toBe("/api/remote-displays/abc/index.html?password=p&embed=1&floating_menu=no");
    expect(svc.launchExternalViewer.mock.calls[0][4]).toMatchObject({ inBrowser: true });
    expect(window.open).not.toHaveBeenCalled();
    expect(screen.getByText("Opening the viewer on the server…")).toBeInTheDocument();
  });

  it("closing the window closes the program on the server", async () => {
    remote.available = true;
    svc.launchExternalViewer.mockResolvedValue({ success: true, viewerId: "viewer3d", display: DISPLAY });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /3D viewer/ }));
    await screen.findByTitle(DISPLAY.title);

    fireEvent.click(screen.getByRole("button", { name: "Close window" }));

    expect(fetchWithAuth).toHaveBeenCalledWith("/api/remote-displays/abc", { method: "DELETE" });
    await waitFor(() => expect(screen.queryByTitle(DISPLAY.title)).not.toBeInTheDocument());
  });

  it("hides the waiting note once the program shows its window", async () => {
    remote.available = true;
    svc.launchExternalViewer.mockResolvedValue({ success: true, viewerId: "viewer3d", display: DISPLAY });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /3D viewer/ }));
    const frame = (await screen.findByTitle(DISPLAY.title)) as HTMLIFrameElement;

    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        origin: window.location.origin, source: frame.contentWindow,
        data: { type: "scipion-remote-display", windows: 1 },
      }));
    });

    expect(screen.queryByText("Opening the viewer on the server…")).not.toBeInTheDocument();
  });

  it("does not close while the program is still starting (no window yet)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      remote.available = true;
      svc.launchExternalViewer.mockResolvedValue({ success: true, viewerId: "viewer3d", display: DISPLAY });
      renderPage();
      fireEvent.click(await screen.findByRole("button", { name: /3D viewer/ }));
      const frame = (await screen.findByTitle(DISPLAY.title)) as HTMLIFrameElement;

      act(() => {
        window.dispatchEvent(new MessageEvent("message", {
          origin: window.location.origin, source: frame.contentWindow,
          data: { type: "scipion-remote-display", windows: 0 },
        }));
      });
      act(() => { vi.advanceTimersByTime(3000); });

      expect(screen.getByTitle(DISPLAY.title)).toBeInTheDocument();
      expect(fetchWithAuth).not.toHaveBeenCalledWith("/api/remote-displays/abc", { method: "DELETE" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("launches it as before when the server cannot show windows", async () => {
    remote.available = false;
    svc.launchExternalViewer.mockResolvedValue({ success: true, viewerId: "viewer3d", message: "ok" });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /3D viewer/ }));

    await waitFor(() => expect(svc.launchExternalViewer).toHaveBeenCalled());
    expect(svc.launchExternalViewer.mock.calls[0][4].inBrowser).toBeUndefined();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows again, after a reload, the programs left open on the server", async () => {
    fetchWithAuth.mockImplementation((url: string) => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(url.endsWith("/available") ? { available: true } : [DISPLAY]),
    }));
    render(<RemoteDisplayHost />);

    const frame = await screen.findByTitle(DISPLAY.title);
    expect(frame.getAttribute("src")).toBe("/api/remote-displays/abc/index.html?password=p&embed=1&floating_menu=no");
    expect(fetchWithAuth).toHaveBeenCalledWith("/api/remote-displays");
  });
});
