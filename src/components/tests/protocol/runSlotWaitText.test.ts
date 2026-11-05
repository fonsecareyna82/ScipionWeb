import { describe, expect, it } from "vitest";

import { runSlotWaitText } from "@/components/protocol/ProtocolNodeCard";

describe("runSlotWaitText", () => {
    it("explains why a launched protocol waits for a run slot", () => {
        expect(runSlotWaitText("launched", { inUse: 4, limit: 4 })).toBe(
            "Waiting for a free run slot: 4 of 4 of your protocols are running (Max concurrent runs per user). "
            + "It starts when one of them ends.");
    });

    it("says nothing for other statuses, no wait or no limit", () => {
        expect(runSlotWaitText("running", { inUse: 4, limit: 4 })).toBe("");
        expect(runSlotWaitText("launched", null)).toBe("");
        expect(runSlotWaitText("launched", { inUse: 4, limit: 0 })).toBe("");
    });
});
