import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import HostSettingsPanel, { defaultHostSettings, type HostSettings } from "./HostSettingsPanel";

const colors = { border: "#ddd", text: "#111", muted: "#666", surface: "#fff", hover: "#eee" };
let latest: HostSettings;

function Harness({ initial }: { initial: HostSettings }) {
    const [value, setValue] = useState<HostSettings>(initial);
    latest = value;
    return <HostSettingsPanel value={value} onChange={setValue} loading={false} error={null} fieldSx={{}}
                              colors={colors as any} />;
}

const base: HostSettings = { ...defaultHostSettings, submitTemplate: "#!/bin/bash\n\nrun", queues: [] };

describe("HostSettingsPanel", () => {
    it("puts a placeholder where the cursor is in the job script", () => {
        render(<Harness initial={base} />);
        const script = screen.getByLabelText("Job script") as HTMLTextAreaElement;
        script.focus();
        script.setSelectionRange(12, 12);
        fireEvent.click(screen.getByRole("button", { name: "Insert %_(JOB_COMMAND)s" }));
        expect(latest.submitTemplate).toBe("#!/bin/bash\n%_(JOB_COMMAND)s\nrun");
    });

    it("warns about what would break the jobs", () => {
        render(<Harness initial={{ ...base, submitCommand: "sbatch", mandatory: true }} />);
        expect(screen.getByText("Check before saving")).toBeInTheDocument();
        expect(screen.getByText(/The submit command does not contain/)).toBeInTheDocument();
        expect(screen.getByText(/Queue usage is mandatory/)).toBeInTheDocument();
    });

    it("adds a queue with its values, and deletes it", () => {
        render(<Harness initial={base} />);
        expect(screen.getByText(/No queues: protocols can only run directly/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Add queue" }));
        expect(latest.queues).toEqual([{ name: "queue1", params: [] }]);

        const queue = screen.getByTestId("queue-0");
        fireEvent.click(within(queue).getByRole("button", { name: "Add value" }));
        fireEvent.change(within(queue).getByLabelText("Label shown"), { target: { value: "Memory (MB)" } });
        expect(latest.queues[0].params[0]).toMatchObject({ variableName: "PARAM_1", label: "Memory (MB)" });

        fireEvent.click(within(queue).getByRole("button", { name: "Delete the queue queue1" }));
        expect(latest.queues).toEqual([]);
    });
});
