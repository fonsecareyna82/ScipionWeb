import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const helpMocks = vi.hoisted(() => ({ askHelp: vi.fn() }));
vi.mock("@/api/helpChat", () => helpMocks);

import HelpChat from "@/components/header/HelpChat";
import { setHelpFocus } from "@/utils/help_chat_focus";

function openChat() {
  render(<HelpChat />);
  fireEvent.click(screen.getByRole("button", { name: "Help chat" }));
}

function send(question: string) {
  fireEvent.change(screen.getByPlaceholderText("Write your question…"), { target: { value: question } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
}

describe("HelpChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setHelpFocus(null);
  });
  afterEach(() => act(() => setHelpFocus(null)));

  it("asks with where the user is and shows the answer's cards", async () => {
    act(() => setHelpFocus({ projectId: 7, projectName: "Demo", protocolId: "3", protocolLabel: "motioncor" }));
    helpMocks.askHelp.mockResolvedValue({
      text: "In the parameters of motioncor:",
      cards: [
        { kind: "param", className: "ProtMotionCorr", protocolLabel: "movie alignment", name: "doseFilter",
          label: "Apply dose filter", help: "Weights each frame by its dose.", section: "Input" },
        { kind: "guide", page: "Projects", title: "Share a project", text: "Open the project menu.",
          url: "https://docs/x#share" },
      ],
    });
    openChat();
    expect(screen.getByText("Demo · #3 motioncor")).toBeInTheDocument();
    send("dose filter");

    expect(screen.getByText("dose filter")).toBeInTheDocument();
    await screen.findByText("In the parameters of motioncor:");
    expect(helpMocks.askHelp).toHaveBeenCalledWith("dose filter", { projectId: 7, protocolId: "3" });
    expect(screen.getByText("Apply dose filter")).toBeInTheDocument();
    expect(screen.getByText("Parameter of movie alignment · Input")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open in the guide/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Share a project" }));
    expect(screen.getByRole("link", { name: /Open in the guide/ })).toHaveAttribute("href", "https://docs/x#share");
  });

  it("offers the shortcuts of a selected protocol and asks again from a listed one", async () => {
    act(() => setHelpFocus({ projectId: 7, protocolId: "3" }));
    helpMocks.askHelp.mockResolvedValueOnce({
      text: "How the protocols of this project are:",
      cards: [{ kind: "protocols", items: [{ protocolId: "5", label: "picking", status: "failed" }] }],
    }).mockResolvedValueOnce({ text: "This is why picking failed:", cards: [
      { kind: "failure", protocolId: "5", label: "picking",
        explained: { cause: { title: "Out of GPU memory", hint: "Use another GPU" }, error: { text: "OOM", line: 12, channel: "stderr" } } },
    ] });
    openChat();
    fireEvent.click(screen.getByRole("button", { name: "How is the project going?" }));
    fireEvent.click(await screen.findByRole("button", { name: /#5\s*picking\s*failed/ }));

    await screen.findByText("Out of GPU memory");
    expect(helpMocks.askHelp).toHaveBeenLastCalledWith("Why did #5 fail?", { projectId: 7, protocolId: "3" });
    expect(screen.getByText("(line 12 of stderr)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Why did it fail?" })).toBeInTheDocument();
  });

  it("says when the help could not answer, and closes with Escape", async () => {
    helpMocks.askHelp.mockRejectedValue(new Error("The help could not answer"));
    openChat();
    expect(screen.queryByRole("button", { name: "What comes next?" })).not.toBeInTheDocument();
    send("ctf");
    await screen.findByText("The help could not answer");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Help chat" })).not.toBeInTheDocument());
  });

  it("shows a protocol's outputs with how many items each has", async () => {
    helpMocks.askHelp.mockResolvedValue({
      text: "picking (#6) has 9,876 particles in outputParticles.",
      cards: [{ kind: "outputs", protocolId: "6", label: "picking", items: [
        { name: "outputParticles", type: "Particles", what: "particles", size: 9876 },
        { name: "outputVolume", type: "Volume", what: "", size: null },
      ] }],
    });
    openChat();
    send("How many particles has #6");
    await screen.findByText("picking (#6) has 9,876 particles in outputParticles.");
    expect(screen.getByText("outputParticles")).toBeInTheDocument();
    expect(screen.getByText("Volume")).toBeInTheDocument();
  });
});
