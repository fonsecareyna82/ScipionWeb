import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import TagPicker from "../../tags/TagPicker";

const allTags = [
    { id: "alpha", title: "Alpha", color: "#ff0000" },
    { id: "beta", title: "Beta", color: "#00ff00" },
    { id: "gamma", title: "Gamma", color: "#0000ff" },
];

describe("TagPicker", () => {
    it("renders selected tags as chips", () => {
        render(
            <TagPicker
                allTags={allTags}
                selectedTagIds={["alpha", "beta"]}
                onChange={() => { }}
            />,
        );

        expect(screen.getByText("Alpha")).toBeInTheDocument();
        expect(screen.getByText("Beta")).toBeInTheDocument();
    });

    it("uses placeholder tags for unknown selected ids", () => {
        render(
            <TagPicker
                allTags={allTags}
                selectedTagIds={["missing-tag"]}
                onChange={() => { }}
            />,
        );

        expect(screen.getByText("missing-tag")).toBeInTheDocument();
    });

    it("calls onChange with normalized unique ids when selecting options", async () => {
        const onChange = vi.fn();

        render(
            <TagPicker
                allTags={allTags}
                selectedTagIds={[]}
                onChange={onChange}
                label="Tags"
            />,
        );

        const input = screen.getByLabelText("Tags");
        fireEvent.mouseDown(input);

        const alphaOption = await screen.findByText("Alpha");
        fireEvent.click(alphaOption);

        await waitFor(() => {
            expect(onChange).toHaveBeenCalledWith(["alpha"]);
        });
    });

    it("preserves unknown selected tags in the options list", async () => {
        render(
            <TagPicker
                allTags={allTags}
                selectedTagIds={["missing-tag"]}
                onChange={() => { }}
                label="Tags"
            />,
        );

        const input = screen.getByLabelText("Tags");

        fireEvent.focus(input);
        fireEvent.keyDown(input, { key: "ArrowDown" });

        const listbox = await screen.findByRole("listbox");

        expect(within(listbox).getByText("missing-tag")).toBeInTheDocument();
    });

    it("renders helper text and custom placeholder", () => {
        render(
            <TagPicker
                allTags={allTags}
                selectedTagIds={[]}
                onChange={() => { }}
                label="Tags"
                helperText="Choose project tags"
                placeholder="Search tags"
            />,
        );

        expect(screen.getByText("Choose project tags")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Search tags")).toBeInTheDocument();
    });

    it("is disabled when disabled=true", () => {
        render(
            <TagPicker
                allTags={allTags}
                selectedTagIds={[]}
                onChange={() => { }}
                label="Tags"
                disabled={true}
            />,
        );

        expect(screen.getByLabelText("Tags")).toBeDisabled();
    });
});