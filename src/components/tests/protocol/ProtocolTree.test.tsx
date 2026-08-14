import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProtocolsTree } from "@/components/protocol/ProtocolTree";

vi.mock("@/icons", () => ({
    DocsIcon: (props: any) => <svg data-testid="docs-icon" {...props} />,
    FolderIcon: (props: any) => <svg data-testid="folder-icon" {...props} />,
    OpenFolderIcon: (props: any) => <svg data-testid="open-folder-icon" {...props} />,
    ChevronDownIcon: (props: any) => <svg data-testid="chevron-down-icon" {...props} />,
    ChevronUpIcon: (props: any) => <svg data-testid="chevron-up-icon" {...props} />,
}));

vi.mock("lucide-react", () => ({
    HelpCircle: (props: any) => <svg data-testid="help-circle-icon" {...props} />,
}));

function createTreeData() {
    return [
        {
            text: "Processing",
            tag: "section",
            openItem: false,
            childs: [
                {
                    text: "Import movies",
                    tag: "protocol",
                    value: "prot-import",
                },
                {
                    text: "Refine volume",
                    tag: "protocol",
                    value: "prot-refine",
                },
            ],
        },
    ];
}

describe("ProtocolsTree", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders root nodes and keeps children collapsed by default", () => {
        const { container } = render(<ProtocolsTree data={createTreeData()} />);

        expect(screen.getByText("Processing")).toBeInTheDocument();

        const childrenContainer = container.querySelector('div[class*="children"]') as HTMLElement;
        expect(childrenContainer).toBeInTheDocument();
        expect(childrenContainer.className).toContain("childrenClosed");
    });

    it("toggles section expansion on click", () => {
        const { container } = render(<ProtocolsTree data={createTreeData()} />);

        const childrenContainer = container.querySelector('div[class*="children"]') as HTMLElement;

        expect(childrenContainer.className).toContain("childrenClosed");

        fireEvent.click(screen.getByText("Processing"));
        expect(childrenContainer.className).toContain("childrenOpen");

        fireEvent.click(screen.getByText("Processing"));
        expect(childrenContainer.className).toContain("childrenClosed");
    });

    it("calls onNodeDoubleClick when double-clicking a protocol node", () => {
        const onNodeDoubleClick = vi.fn();

        render(
            <ProtocolsTree
                data={[
                    {
                        text: "Processing",
                        tag: "section",
                        openItem: true,
                        childs: [
                            {
                                text: "Import movies",
                                tag: "protocol",
                                value: "prot-import",
                            },
                        ],
                    },
                ]}
                onNodeDoubleClick={onNodeDoubleClick}
            />,
        );

        fireEvent.doubleClick(screen.getByText("Import movies"));

        expect(onNodeDoubleClick).toHaveBeenCalledWith("prot-import");
    });

    it("calls onNodeHelpClick when clicking the help button", () => {
        const onNodeHelpClick = vi.fn();

        render(
            <ProtocolsTree
                data={[
                    {
                        text: "Processing",
                        tag: "section",
                        openItem: true,
                        childs: [
                            {
                                text: "Import movies",
                                tag: "protocol",
                                value: "prot-import",
                            },
                        ],
                    },
                ]}
                onNodeHelpClick={onNodeHelpClick}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: "Open protocol help" }));

        expect(onNodeHelpClick).toHaveBeenCalledWith("prot-import", "Import movies");
    });

    it("filters the tree by search text and auto-expands matching branches", () => {
        render(<ProtocolsTree data={createTreeData()} searchText="Import" />);

        expect(screen.getByText("Processing")).toBeInTheDocument();
        expect(
            screen.getByText(
                (_, node) =>
                    node?.tagName.toLowerCase() === "span" &&
                    node?.textContent?.replace(/\s+/g, " ").trim() === "Import movies",
            ),
        ).toBeInTheDocument();

        expect(screen.queryByText("Refine volume")).not.toBeInTheDocument();
    });

    it("keeps all descendants when the search matches a parent package", () => {
        render(<ProtocolsTree data={[{ text: "All", tag: "section", childs: [{ text: "IMOD", tag: "package", childs: [{ text: "Fiducial model", tag: "protocol", value: "imod-fiducial" }, { text: "Tilt-series alignment", tag: "protocol", value: "imod-align" }] }, { text: "RELION", tag: "package", childs: [{ text: "Refine 3D", tag: "protocol", value: "relion-refine" }] }] }]} searchText="imod" />);

        expect(screen.getByText("All")).toBeInTheDocument();
        expect(screen.getByText("IMOD")).toBeInTheDocument();
        expect(screen.getByText("Fiducial model")).toBeInTheDocument();
        expect(screen.getByText("Tilt-series alignment")).toBeInTheDocument();
        expect(screen.queryByText("RELION")).not.toBeInTheDocument();
        expect(screen.queryByText("Refine 3D")).not.toBeInTheDocument();
    });

    it("highlights search matches", () => {
        const { container } = render(
            <ProtocolsTree
                data={[
                    {
                        text: "Processing",
                        tag: "section",
                        openItem: true,
                        childs: [
                            {
                                text: "Import movies",
                                tag: "protocol",
                                value: "prot-import",
                            },
                        ],
                    },
                ]}
                searchText="Import"
            />,
        );

        const mark = container.querySelector("mark");
        expect(mark).not.toBeNull();
        expect(mark).toHaveTextContent("Import");
    });

    it("renders help button only for protocol nodes when onNodeHelpClick is provided", () => {
        render(
            <ProtocolsTree
                data={[
                    {
                        text: "Processing",
                        tag: "section",
                        openItem: true,
                        childs: [
                            {
                                text: "Import movies",
                                tag: "protocol",
                                value: "prot-import",
                            },
                            {
                                text: "Protocol group",
                                tag: "protocol_group",
                                openItem: true,
                                childs: [],
                            },
                        ],
                    },
                ]}
                onNodeHelpClick={vi.fn()}
            />,
        );

        expect(screen.getAllByRole("button", { name: "Open protocol help" })).toHaveLength(1);
    });
});