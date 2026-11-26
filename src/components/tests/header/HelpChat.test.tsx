import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const helpMocks = vi.hoisted(() => ({ askHelp: vi.fn(), getHelpChatStatus: vi.fn(), applyHelpAction: vi.fn() }));
vi.mock("@/api/helpChat", () => helpMocks);

import HelpChat from "@/components/header/HelpChat";
import { onHelpChatRequest, type HelpChatRequest } from "@/utils/help_chat_actions";
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
    helpMocks.getHelpChatStatus.mockResolvedValue({ assistant: false });
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
    expect(helpMocks.askHelp).toHaveBeenCalledWith("dose filter", { projectId: 7, protocolId: "3" }, []);
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
    expect(helpMocks.askHelp).toHaveBeenLastCalledWith("Why did #5 fail?", { projectId: 7, protocolId: "3" },
      expect.any(Array));
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

  it("answers with the AI assistant: its text formatted, what it looked at and the conversation sent", async () => {
    helpMocks.getHelpChatStatus.mockResolvedValue({ assistant: true, dailyLimit: 50, left: 12 });
    helpMocks.askHelp.mockResolvedValueOnce({
      assistant: true, left: 11, cards: [],
      text: "It ran out of **GPU memory**.\n\n- Use 100 classes\n- Or a box of 200 px",
      steps: ["Read why protocol 145 failed", "Read the stderr log of protocol 145"],
    }).mockResolvedValueOnce({ assistant: true, left: 10, cards: [], text: "Yes.", steps: [] });
    openChat();

    await screen.findByText("Answers with AI");
    expect(screen.getByText(/12 questions left today/)).toBeInTheDocument();
    expect(screen.getByText(/I only read/)).toBeInTheDocument();
    send("Why did it fail?");

    expect(await screen.findByText("GPU memory")).toBeInTheDocument();
    expect(screen.getByText("GPU memory").tagName).toBe("STRONG");
    expect(screen.getByText("Use 100 classes").tagName).toBe("LI");
    fireEvent.click(screen.getByRole("button", { name: "Looked at 2 things" }));
    expect(screen.getByText("Read the stderr log of protocol 145")).toBeInTheDocument();

    send("Is 100 enough?");
    await screen.findByText("Yes.");
    expect(helpMocks.askHelp).toHaveBeenLastCalledWith("Is 100 enough?", { projectId: null, protocolId: null }, [
      { role: "user", text: "Why did it fail?" },
      { role: "assistant", text: "It ran out of **GPU memory**.\n\n- Use 100 classes\n- Or a box of 200 px" },
    ]);
  });

  it("never draws HTML the model writes", async () => {
    helpMocks.getHelpChatStatus.mockResolvedValue({ assistant: true, left: 5 });
    helpMocks.askHelp.mockResolvedValue({ assistant: true, cards: [], steps: [],
                                          text: "<img src=x onerror=alert(1)> done" });
    openChat();
    await screen.findByText("Answers with AI");
    send("hi");
    expect(await screen.findByText("<img src=x onerror=alert(1)> done")).toBeInTheDocument();
    expect(document.querySelector("img[src='x']")).toBeNull();
  });

  const RELAUNCH = {
    kind: "action", action: "relaunch", projectId: 7, protocolId: "37", label: "alignPCA-2D", className: "Prot2D",
    status: "finished", mode: "restart", modes: ["restart"], reason: "Fewer classes fit the data better.",
    changes: [{ name: "numberOfClasses", label: "Number of classes", from: 50, to: 100 }],
    children: [{ protocolId: "105", label: "subset", status: "finished", active: false },
               { protocolId: "106", label: "initial model", status: "running", active: true }],
  };

  async function proposal(card: object) {
    helpMocks.getHelpChatStatus.mockResolvedValue({ assistant: true, left: 5 });
    helpMocks.askHelp.mockResolvedValue({ assistant: true, text: "Here is my proposal.", steps: [], cards: [card] });
    openChat();
    await screen.findByText("Answers with AI");
    send("do it");
    await screen.findByText("Here is my proposal.");
  }

  it("asks which protocols to relaunch before applying a relaunch with children", async () => {
    const requests: HelpChatRequest[] = [];
    const off = onHelpChatRequest((request) => requests.push(request));
    helpMocks.applyHelpAction.mockResolvedValue({ ok: true });
    await proposal(RELAUNCH);

    expect(screen.getByText("Restart #37 alignPCA-2D")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText(/2 protocols depend on it/)).toBeInTheDocument();
    expect(screen.getByText("Running now: #106.")).toBeInTheDocument();
    const apply = screen.getByRole("button", { name: "Apply" });
    expect(apply).toBeDisabled();

    fireEvent.click(screen.getByRole("radio", { name: /Only this one/ }));
    fireEvent.click(apply);
    await screen.findByText("Restart sent.");
    expect(helpMocks.applyHelpAction).toHaveBeenCalledWith({
      action: "relaunch", projectId: 7, protocolId: "37", mode: "restart", scope: "single",
      changes: { numberOfClasses: 100 },
    });
    expect(requests).toEqual([{ kind: "refresh", projectId: 7 }]);
    off();
  });

  it("does nothing when the proposal is cancelled, and offers the form", async () => {
    const requests: HelpChatRequest[] = [];
    const off = onHelpChatRequest((request) => requests.push(request));
    await proposal({ ...RELAUNCH, children: [] });
    fireEvent.click(screen.getByRole("button", { name: "Open in the form" }));
    expect(requests).toEqual([{ kind: "openProtocol", projectId: 7, protocolId: "37" }]);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Cancelled: nothing was done.")).toBeInTheDocument();
    expect(helpMocks.applyHelpAction).not.toHaveBeenCalled();
    off();
  });

  it("lets a failed protocol continue or restart", async () => {
    helpMocks.applyHelpAction.mockResolvedValue({ ok: true });
    await proposal({ ...RELAUNCH, status: "failed", mode: "continue", modes: ["continue", "restart"], changes: [],
                     children: [] });
    expect(screen.getByText("Continue #37 alignPCA-2D")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Restart/ }));
    expect(screen.getByText("Restart #37 alignPCA-2D")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(helpMocks.applyHelpAction).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "restart", changes: {} })));
  });

  it("shows why an action could not be applied and lets it be tried again", async () => {
    helpMocks.applyHelpAction.mockRejectedValue(new Error("The protocol is running; it has to be stopped first"));
    await proposal({ kind: "action", action: "stop", projectId: 7, protocolId: "40", label: "picking",
                     className: "P", status: "running", reason: "" });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText("The protocol is running; it has to be stopped first")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();
  });

  it("opens the next protocol's form only in the project page that shows it", async () => {
    await proposal({ kind: "action", action: "next", projectId: 7, protocolId: "22", label: "extract",
                     nextClassName: "Prot2D", nextLabel: "2D classification", reason: "" });
    fireEvent.click(screen.getByRole("button", { name: "Open its form" }));
    expect(screen.getByText("Open project 7 to add it.")).toBeInTheDocument();

    const requests: HelpChatRequest[] = [];
    const off = onHelpChatRequest((request) => requests.push(request));
    fireEvent.click(screen.getByRole("button", { name: "Open its form" }));
    expect(requests).toEqual([{ kind: "openProtocolClass", projectId: 7, className: "Prot2D" }]);
    expect(screen.getByText(/Its form is open/)).toBeInTheDocument();
    off();
  });

  it("makes a copy with the changes, without opening its form", async () => {
    const requests: HelpChatRequest[] = [];
    const off = onHelpChatRequest((request) => requests.push(request));
    helpMocks.applyHelpAction.mockResolvedValue({ ok: true, newProtocolId: "200" });
    await proposal({ kind: "action", action: "duplicate", projectId: 7, protocolId: "37", label: "alignPCA-2D",
                     className: "P", status: "finished", reason: "",
                     changes: [{ name: "numberOfClasses", label: "Number of classes", from: 50, to: 30 }] });
    expect(screen.getByText("Copy #37 alignPCA-2D")).toBeInTheDocument();
    expect(screen.getByText(/The original and what depends on it stay as they are/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Make the copy" }));
    await screen.findByText("Copy #200 made, not launched.");
    expect(helpMocks.applyHelpAction).toHaveBeenCalledWith({ action: "duplicate", projectId: 7, protocolId: "37",
                                                             changes: { numberOfClasses: 30 } });
    expect(requests).toEqual([{ kind: "refresh", projectId: 7 }]);
    off();
  });

  it("deletes only after the protocol's number is written", async () => {
    helpMocks.applyHelpAction.mockResolvedValue({ ok: true });
    await proposal({ kind: "action", action: "delete", projectId: 7, protocolId: "37", label: "alignPCA-2D",
                     className: "P", status: "finished", reason: "",
                     outputs: [{ name: "outputClasses", type: "SetOfClasses2D", size: 42 }],
                     children: [{ protocolId: "105", label: "subset", status: "new" }] });
    expect(screen.getByText("Cannot be undone")).toBeInTheDocument();
    expect(screen.getByText("outputClasses: 42 items")).toBeInTheDocument();
    expect(screen.getByText(/lose their input/)).toHaveTextContent("#105");
    const remove = screen.getByRole("button", { name: "Delete" });
    expect(remove).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Write 37 to confirm"), { target: { value: "3" } });
    expect(remove).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Write 37 to confirm"), { target: { value: "37" } });
    fireEvent.click(remove);
    await screen.findByText("Deleted.");
    expect(helpMocks.applyHelpAction).toHaveBeenCalledWith({ action: "delete", projectId: 7, protocolId: "37",
                                                             confirm: "37" });
  });

  it("says nothing about questions left when there is no limit", async () => {
    helpMocks.getHelpChatStatus.mockResolvedValue({ assistant: true, dailyLimit: 0 });
    openChat();
    await screen.findByText("Answers with AI");
    expect(screen.queryByText(/left today/)).not.toBeInTheDocument();
  });

  const TEMPLATE_CARD = {
    kind: "action", action: "template", projectId: 7, protocolId: "22", label: "extract",
    templateId: "WH:Workflow 3D cryosparc", templateName: "Workflow 3D cryosparc",
    source: { protocolId: "22", label: "extract", output: "outputParticles" }, anchor: "8178.outputParticles",
    alternatives: ["8178.outputParticles"], reason: "",
    links: [
      { templateRef: "8178.outputParticles", templateClass: "XmippProtExtractParticles", projectRef: "22.outputParticles",
        how: "the source", projectLabel: "extract" },
      { templateRef: "7510.outputCTF", templateClass: "XmippProtCTFConsensus", projectRef: "6.outputCTF",
        how: "an earlier step of the source", projectLabel: "ctf consensus" },
    ],
    missing: [], fields: [],
    steps: [
      { id: "8268", className: "ProtCryo2D", label: "cryosparc 2D", keyStep: "2D classes", stop: true },
      { id: "8550", className: "ProtCryoSparcInitialModel", label: "initial model", keyStep: "initial model", stop: true },
      { id: "9265", className: "ProtCryoSparcNewNonUniformRefine3D", label: "NU refine", keyStep: null, stop: false },
    ],
  };

  it("adds a template from the project's particles, with the stops chosen", async () => {
    helpMocks.applyHelpAction.mockResolvedValue({ ok: true, chainId: 1, created: ["150", "151", "152"],
                                                  launched: ["150", "151"], errors: [] });
    await proposal(TEMPLATE_CARD);
    expect(screen.getByText("Add Workflow 3D cryosparc from #22 extract")).toBeInTheDocument();
    expect(screen.getByText("#6")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Stop after cryosparc 2D" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Stop after NU refine" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Stop after initial model" }));
    fireEvent.click(screen.getByRole("button", { name: "Add and launch" }));
    await screen.findByText(/Added 3 protocols \(#150…#152\)\. Launched now: #150, #151/);
    expect(helpMocks.applyHelpAction).toHaveBeenCalledWith({
      action: "template", projectId: 7, protocolId: "22", templateId: "WH:Workflow 3D cryosparc",
      fromOutput: "outputParticles", anchor: "8178.outputParticles",
      links: { "8178.outputParticles": "22.outputParticles", "7510.outputCTF": "6.outputCTF" }, stops: ["8268"],
    });
  });

  it("does not add a template while something it needs is missing", async () => {
    await proposal({ ...TEMPLATE_CARD, missing: ["7510.outputCTF"],
                     links: [{ ...TEMPLATE_CARD.links[1], projectRef: null, projectLabel: "" }] });
    expect(screen.getByText("nothing found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add and launch" })).toBeDisabled();
  });

  it("sends a whole template's values", async () => {
    helpMocks.applyHelpAction.mockResolvedValue({ ok: true, created: ["150"], launched: ["150"] });
    await proposal({ ...TEMPLATE_CARD, source: null, protocolId: "", label: "", anchor: null, links: [],
                     fields: [{ alias: "moviesPath", title: "Movies folder", value: "/data" }] });
    fireEvent.change(screen.getByLabelText("Movies folder"), { target: { value: "/data/session7" } });
    fireEvent.click(screen.getByRole("button", { name: "Add and launch" }));
    await waitFor(() => expect(helpMocks.applyHelpAction).toHaveBeenCalledWith(expect.objectContaining({
      protocolId: "", fields: { moviesPath: "/data/session7" } })));
  });

  it("goes on with a chain after a stop", async () => {
    helpMocks.applyHelpAction.mockResolvedValue({ ok: true, launched: ["152"], errors: [] });
    await proposal({ kind: "action", action: "continue", projectId: 7, chainId: 1, protocolId: "151",
                     label: "initial model", title: "Workflow 3D cryosparc from #22", reason: "",
                     next: [{ protocolId: "152", label: "3D classes", className: "P", stop: true }] });
    expect(screen.getByText("Go on after #151 initial model")).toBeInTheDocument();
    expect(screen.getByText("stops after it")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Launch them" }));
    await screen.findByText(/Launched now: #152/);
    expect(helpMocks.applyHelpAction).toHaveBeenCalledWith({ action: "continue", projectId: 7, protocolId: "151",
                                                             chainId: 1 });
  });

  it("warns when a template adds very little from there", async () => {
    await proposal({ ...TEMPLATE_CARD, few: true, steps: [TEMPLATE_CARD.steps[0]] });
    expect(screen.getByText(/From here this template adds only 1 protocol/)).toBeInTheDocument();
  });

  it("lets a template be chosen from the options with one click", async () => {
    helpMocks.getHelpChatStatus.mockResolvedValue({ assistant: true, left: 5 });
    helpMocks.askHelp.mockResolvedValueOnce({ assistant: true, text: "These take your particles:", steps: [], cards: [
      { kind: "templates", projectId: 7, fromProtocolId: "105", fromOutput: "outputParticles", items: [
        { id: "WH:Workflow 3D cryosparc", name: "Workflow 3D cryosparc", description: "", adds: 23,
          keySteps: ["2D classes", "initial model"] },
        { id: "WH:Workflow 2D Xmipp", name: "Workflow 2D Xmipp", description: "", adds: 1, keySteps: ["2D classes"] },
      ] },
    ] }).mockResolvedValueOnce({ assistant: true, text: "Here it is.", steps: [], cards: [] });
    openChat();
    await screen.findByText("Answers with AI");
    send("which workflows from 105?");
    expect(await screen.findByText("Adds 23 protocols · 2D classes, initial model")).toBeInTheDocument();
    expect(screen.getByText("Adds 1 protocol · 2D classes")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Use this one" })[0]);
    await screen.findByText("Here it is.");
    expect(helpMocks.askHelp).toHaveBeenLastCalledWith(
      'Apply the template "Workflow 3D cryosparc" (WH:Workflow 3D cryosparc) from protocol #105 (outputParticles)',
      { projectId: null, protocolId: null }, expect.any(Array));
  });
});
