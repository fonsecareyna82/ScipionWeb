import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import InstancePanel, { type InstanceSettingsValue } from "./InstancePanel";

const colors = { border: "#ddd", text: "#111", muted: "#666", card: "#fff", hover: "#eee", primary: "#2563eb" };

let latest: InstanceSettingsValue;

function Harness({ queueNames, initial }: { queueNames: string[] | null; initial: InstanceSettingsValue }) {
    const [value, setValue] = useState(initial);
    latest = value;
    return (
        <InstancePanel value={value} onChange={(update) => setValue((prev) => update(prev))} queueNames={queueNames}
                       colors={colors}
                       isDarkMode={false} fieldSx={{}} menuPaperSx={{}} />
    );
}

describe("InstancePanel", () => {
    it("chooses the default queue among the host's queues", () => {
        render(<Harness queueNames={["gpu", "cpu"]} initial={{ defaultQueueName: "", maxConcurrentRunsPerUser: 0 }} />);
        expect(screen.getByText("The first one (gpu)")).toBeTruthy();

        fireEvent.mouseDown(screen.getByRole("combobox", { name: /Default queue/ }));
        fireEvent.click(within(screen.getByRole("listbox")).getByText("cpu"));
        expect(latest.defaultQueueName).toBe("cpu");
    });

    it("says a configured queue no longer exists, and that there are no queues", () => {
        const { unmount } = render(
            <Harness queueNames={["gpu"]} initial={{ defaultQueueName: "old", maxConcurrentRunsPerUser: 0 }} />);
        fireEvent.mouseDown(screen.getByRole("combobox", { name: /Default queue/ }));
        expect(screen.getByText("old (no longer exists)")).toBeTruthy();
        unmount();

        render(<Harness queueNames={[]} initial={{ defaultQueueName: "", maxConcurrentRunsPerUser: 0 }} />);
        expect(screen.getByText(/No queues yet/)).toBeTruthy();
    });

    it("limits the runs per user, no limit by default", () => {
        render(<Harness queueNames={[]} initial={{ defaultQueueName: "", maxConcurrentRunsPerUser: 0 }} />);
        expect(screen.getByText("No limit")).toBeTruthy();
        fireEvent.mouseDown(screen.getByRole("combobox", { name: /Runs per user/ }));
        fireEvent.click(within(screen.getByRole("listbox")).getByText("4"));
        expect(latest.maxConcurrentRunsPerUser).toBe(4);
        expect(screen.getByText("4 at a time")).toBeTruthy();
    });
});
