import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProtocolMetadataPanel from "@/components/protocol/ProtocolMetadataPanel";

const mockJsonTree = vi.fn(({ data }: { data: any }) => (
    <div data-testid="json-tree">{JSON.stringify(data)}</div>
));

vi.mock("@/components/protocol/JsonTree", () => ({
    default: (props: { data: any }) => mockJsonTree(props),
}));

describe("ProtocolMetadataPanel", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders JsonTree", () => {
        render(<ProtocolMetadataPanel metadataSnapshot={{}} />);

        expect(screen.getByTestId("json-tree")).toBeInTheDocument();
    });

    it("passes metadataSnapshot to JsonTree as data", () => {
        const metadataSnapshot = {
            id: 123,
            name: "Protocol A",
            status: "finished",
        };

        render(<ProtocolMetadataPanel metadataSnapshot={metadataSnapshot} />);

        expect(mockJsonTree).toHaveBeenCalled();
        expect(mockJsonTree.mock.calls[0][0]).toEqual({ data: metadataSnapshot });
    });

    it("renders complex metadata snapshots", () => {
        const metadataSnapshot = {
            protocol: {
                id: 1,
                name: "Import Movies",
            },
            outputs: [
                { id: "o1", name: "movies.sqlite" },
                { id: "o2", name: "summary.json" },
            ],
        };

        render(<ProtocolMetadataPanel metadataSnapshot={metadataSnapshot} />);

        expect(screen.getByTestId("json-tree")).toBeInTheDocument();
        expect(screen.getByText(JSON.stringify(metadataSnapshot))).toBeInTheDocument();
    });

    it("passes null metadataSnapshot to JsonTree", () => {
        render(<ProtocolMetadataPanel metadataSnapshot={null} />);

        expect(mockJsonTree).toHaveBeenCalled();
        expect(mockJsonTree.mock.calls[0][0]).toEqual({ data: null });
    });
});