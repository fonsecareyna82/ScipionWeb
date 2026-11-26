import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
    getAssistantSettings: vi.fn(),
    saveAssistantSettings: vi.fn(),
    listAssistantModels: vi.fn(),
    testAssistant: vi.fn(),
}));
vi.mock("@/api/helpChat", () => api);
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import AssistantPanel from "./AssistantPanel";

const PROVIDERS = [
    { key: "openai", label: "OpenAI (ChatGPT)", baseUrl: "https://api.openai.com/v1", needsKey: true },
    { key: "local", label: "Local or compatible model", baseUrl: "", needsKey: false },
];

const SETTINGS = {
    enabled: false, provider: "openai", baseUrl: "", model: "", mode: "answer", dailyLimit: 50, keySet: true,
    ready: false, providers: PROVIDERS,
    usage: { today: { users: 2, questions: 7, inputTokens: 12000, outputTokens: 900 },
             last30Days: { users: 3, questions: 40, inputTokens: 90000, outputTokens: 7000 } },
};

describe("AssistantPanel", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.getAssistantSettings.mockResolvedValue(SETTINGS);
        api.saveAssistantSettings.mockImplementation(async (payload) => ({ ...SETTINGS, ...payload, keySet: true }));
    });

    it("starts off, keeps the key when left empty and shows the usage in its own tab", async () => {
        render(<AssistantPanel />);
        expect(await screen.findByText("Set: leave it empty to keep it")).toBeInTheDocument();
        expect(screen.getByRole("checkbox", { name: "Answer with AI" })).not.toBeChecked();
        expect(screen.getByText(/are sent to that provider/)).toBeInTheDocument();
        expect(screen.queryByText(/7 questions from 2 users/)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Limit and usage" }));
        expect(screen.getByText(/7 questions from 2 users/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Model" }));

        fireEvent.click(screen.getByRole("checkbox", { name: "Answer with AI" }));
        fireEvent.click(screen.getByRole("button", { name: "Save assistant settings" }));
        await waitFor(() => expect(api.saveAssistantSettings).toHaveBeenCalled());
        const sent = api.saveAssistantSettings.mock.calls[0][0];
        expect(sent.enabled).toBe(true);
        expect("key" in sent).toBe(false);
    });

    it("lists the models with the key typed, before saving", async () => {
        api.listAssistantModels.mockResolvedValue({ models: ["model-a", "model-b"] });
        render(<AssistantPanel />);
        const key = await screen.findByLabelText("Key");
        fireEvent.change(key, { target: { value: "sk-typed" } });
        fireEvent.click(screen.getByRole("button", { name: "Load models" }));
        await waitFor(() => expect(api.listAssistantModels).toHaveBeenCalled());
        expect(api.listAssistantModels.mock.calls[0][0]).toMatchObject({ provider: "openai", key: "sk-typed" });
        expect(api.saveAssistantSettings).not.toHaveBeenCalled();
    });

    it("asks a local model for its address and does not warn about data leaving", async () => {
        api.getAssistantSettings.mockResolvedValue({ ...SETTINGS, provider: "local", keySet: false });
        render(<AssistantPanel />);
        expect(await screen.findByLabelText("Address")).toBeInTheDocument();
        expect(screen.queryByText(/are sent to that provider/)).not.toBeInTheDocument();
    });

    it("offers deleting only when proposing, off by default", async () => {
        render(<AssistantPanel />);
        await screen.findByText("Set: leave it empty to keep it");
        fireEvent.click(screen.getByRole("button", { name: "What it may do" }));
        expect(screen.queryByRole("checkbox", { name: "Propose deleting protocols" })).not.toBeInTheDocument();
    });

    it("shows the delete switch off when proposing, and keeps it when another tab is open", async () => {
        api.getAssistantSettings.mockResolvedValue({ ...SETTINGS, mode: "propose", modes: ["answer", "propose"] });
        render(<AssistantPanel />);
        fireEvent.click(await screen.findByRole("button", { name: "What it may do" }));
        const toggle = await screen.findByRole("checkbox", { name: "Propose deleting protocols" });
        expect(toggle).not.toBeChecked();
        fireEvent.click(toggle);
        fireEvent.click(screen.getByRole("button", { name: "Model" }));
        fireEvent.click(screen.getByRole("button", { name: "Save assistant settings" }));
        await waitFor(() => expect(api.saveAssistantSettings).toHaveBeenCalled());
        expect(api.saveAssistantSettings.mock.calls[0][0]).toMatchObject({ mode: "propose", allowDelete: true });
    });
});
