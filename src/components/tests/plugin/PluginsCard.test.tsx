import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PluginsCard from "@/components/plugin/PluginsCard";
import type { Plugin } from "@/api/plugins";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

vi.mock("framer-motion", () => ({
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    },
}));

vi.mock("@/components/ui/card", () => ({
    Card: ({ children, onClick, className }: any) => (
        <div role="button" tabIndex={0} onClick={onClick} className={className}>
            {children}
        </div>
    ),
    CardHeader: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    CardFooter: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock("@/icons", () => ({
    UpdateIcon: (props: any) => <svg data-testid="update-icon" {...props} />,
    ExecuteIcon: (props: any) => <svg data-testid="execute-icon" {...props} />,
}));

const basePlugin: Plugin = {
    name: "Scipion Plugin",
    pipName: "scipion-plugin",
    latestRelease: "3.0.0",
    installed: false,
    toUpdate: false,
};

function renderComponent(
    pluginOverrides: Partial<Plugin> = {},
    processingState: "installing" | "removing" | null = null,
) {
    const plugin = {
        ...basePlugin,
        ...pluginOverrides,
    };

    render(<PluginsCard {...plugin} processingState={processingState} />);

    return plugin;
}

describe("PluginsCard", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders basic plugin information for a not installed plugin", () => {
        renderComponent();

        expect(screen.getByText("Scipion Plugin")).toBeInTheDocument();
        expect(screen.getByText("scipion-plugin")).toBeInTheDocument();
        expect(screen.getByText("Latest v3.0.0")).toBeInTheDocument();
        expect(screen.getByText("View details")).toBeInTheDocument();
    });

    it("navigates to the plugin detail page on card click", () => {
        const plugin = renderComponent();

        fireEvent.click(screen.getByRole("button"));

        expect(mockNavigate).toHaveBeenCalledWith(`/plugins/${plugin.pipName}`, {
            state: {
                plugin: expect.objectContaining({
                    name: plugin.name,
                    pipName: plugin.pipName,
                    latestRelease: plugin.latestRelease,
                    installed: plugin.installed,
                    toUpdate: plugin.toUpdate,
                }),
            },
        });
    });

    it("renders the plugin logo when fullLogo exists", () => {
        renderComponent({
            fullLogo: "https://example.com/logo.png",
        });

        const logo = screen.getByAltText("Scipion Plugin icon");
        expect(logo).toBeInTheDocument();
        expect(logo).toHaveAttribute("src", "https://example.com/logo.png");
    });

    it("renders fallback initials when fullLogo does not exist", () => {
        renderComponent({
            fullLogo: undefined,
        });

        expect(screen.getByText("Sc")).toBeInTheDocument();
    });

    it("shows installed version when the plugin is installed", () => {
        renderComponent({
            installed: true,
            pipVersion: "2.4.1",
        });

        expect(screen.getByText("Installed v2.4.1")).toBeInTheDocument();
        expect(screen.getByText("View details")).toBeInTheDocument();
    });

    it("shows update badges when the plugin has an update available", () => {
        renderComponent({
            installed: true,
            pipVersion: "2.4.1",
            toUpdate: true,
            latestRelease: "3.0.0",
        });

        expect(screen.getByText("Update")).toBeInTheDocument();
        expect(screen.getByText("v3.0.0 available")).toBeInTheDocument();
        expect(screen.getAllByTestId("update-icon")).toHaveLength(2);
    });

    it("shows processing state when installing", () => {
        renderComponent({}, "installing");

        expect(screen.getByText("Processing")).toBeInTheDocument();
        expect(screen.getByTestId("execute-icon")).toBeInTheDocument();
    });

    it("shows processing state when removing", () => {
        renderComponent({}, "removing");

        expect(screen.getByText("Removing")).toBeInTheDocument();
        expect(screen.getByTestId("execute-icon")).toBeInTheDocument();
    });
});