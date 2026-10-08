import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProtocolLogsPanel from "@/components/protocol/ProtocolLogsPanel";
import * as projectsApi from "@/api/projects";
import { fetchWithAuth } from "@/api/auth";

vi.mock("@/api/auth", () => ({ fetchWithAuth: vi.fn() }));

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
afterEach(() => {
  if (originalClipboard) {
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  } else {
    delete (navigator as Navigator & { clipboard?: Clipboard }).clipboard;
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderPanel(onLoadFullLog: (channel: string) => Promise<Blob>) {
  return render(
    <ProtocolLogsPanel
      sortedLogChannels={[{ id: "stderr", label: "Error" }]}
      activeLogChannelId="stderr"
      setActiveLogChannelId={vi.fn()}
      activeLogText="a short, visible tail\n"
      logsError={null}
      logsContainerRef={{ current: null }}
      updateStickToBottom={vi.fn()}
      onLoadFullLog={onLoadFullLog}
    />,
  );
}

describe("copy full protocol log", () => {
  it("fetches authenticated raw bytes for only the chosen channel", async () => {
    const bytes = new Blob(["beginning\nñ😀\nending\n"], { type: "text/plain" });
    vi.mocked(fetchWithAuth).mockResolvedValue({
      ok: true, blob: async () => bytes,
    } as Response);
    expect(typeof (projectsApi as any).fetchProtocolLogRaw).toBe("function");
    const result = await (projectsApi as any).fetchProtocolLogRaw(11, 27, "schedule") as Blob;
    expect(result.size).toBe(bytes.size);
    expect(result.type).toBe("text/plain");
    expect(fetchWithAuth).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(fetchWithAuth).mock.calls[0];
    const parsed = new URL(String(url), "http://localhost");
    expect(parsed.pathname).toMatch(/\/projects\/11\/protocols\/27\/logs\/raw$/);
    expect(parsed.searchParams.get("channel")).toBe("schedule");
    expect(options).toEqual(expect.objectContaining({ method: "GET" }));
  });

  it("requests the full channel and starts clipboard write during click activation", async () => {
    let release!: (blob: Blob) => void;
    const pending = new Promise<Blob>(resolve => { release = resolve; });
    const onLoadFullLog = vi.fn(() => pending);
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("ClipboardItem", class {
      readonly entries: Record<string, Promise<Blob>>;
      constructor(entries: Record<string, Promise<Blob>>) { this.entries = entries; }
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true, value: { write },
    });

    renderPanel(onLoadFullLog);
    fireEvent.click(screen.getByRole("button", { name: /copy full log/i }));
    expect(onLoadFullLog).toHaveBeenCalledWith("stderr");
    expect(write).toHaveBeenCalledTimes(1);
    const copyButton = screen.getByRole("button", { name: /copy full log/i });
    expect(copyButton).toHaveTextContent("Copying...");
    expect(copyButton).toBeDisabled();
    expect(copyButton).not.toHaveTextContent("Copy full");
    const item = write.mock.calls[0][0][0] as { entries: Record<string, Promise<Blob>> };
    release(new Blob(["first line\nñ😀\nlast line\n"], { type: "text/plain" }));
    await expect(item.entries["text/plain"]).resolves.toBeInstanceOf(Blob);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Copied"));
    expect(copyButton).toHaveTextContent("Copied");
    expect(copyButton).toBeEnabled();
    expect(copyButton.contains(screen.getByRole("status"))).toBe(true);
  });

  it("returns to Copy after briefly showing Copied", async () => {
    vi.stubGlobal("ClipboardItem", class {
      constructor(_entries: Record<string, Promise<Blob>>) {}
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write: vi.fn().mockResolvedValue(undefined) },
    });
    renderPanel(vi.fn().mockResolvedValue(new Blob(["the complete log"], { type: "text/plain" })));
    const copyButton = screen.getByRole("button", { name: /copy full log/i });
    expect(copyButton).toHaveTextContent(/^Copy$/);
    fireEvent.click(copyButton);
    await waitFor(() => expect(copyButton).toHaveTextContent(/^Copied$/));
    await waitFor(() => expect(copyButton).toHaveTextContent(/^Copy$/), { timeout: 3500 });
  });

  it("shows an error instead of claiming to have copied when the clipboard fails", async () => {
    vi.stubGlobal("ClipboardItem", class {
      constructor(_entries: Record<string, Promise<Blob>>) {}
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true, value: { write: vi.fn().mockRejectedValue(new Error("NotAllowedError")) },
    });
    renderPanel(vi.fn().mockResolvedValue(new Blob(["entire log"], { type: "text/plain" })));
    fireEvent.click(screen.getByRole("button", { name: /copy full log/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("NotAllowedError"));
    expect(screen.queryByText("Copied")).not.toBeInTheDocument();
  });
});
