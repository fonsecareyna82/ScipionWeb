import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({ listStorageQuotas: vi.fn(), saveStorageQuota: vi.fn() }));
vi.mock("@/api/storage", () => storageMocks);
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import StorageQuotasCard from "./StorageQuotasCard";

const GB = 1024 ** 3;
const styles = { fieldSx: {}, cardSx: {}, cardHeaderSx: {}, colors: { border: "#ddd", text: "#111", muted: "#666" } };
const report: any = {
  users: [{ userId: 3, name: "Ana Pi", email: "ana@example.org" }, { userId: 4, name: "Luis", email: "luis@example.org" }],
  groups: [{ groupId: 9, name: "Pi lab" }],
};
const labQuota = { kind: "group", targetId: 9, name: "Pi lab", limitBytes: 100 * GB, usedBytes: 100 * GB, percent: 100, full: true };

describe("Disk quotas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMocks.listStorageQuotas.mockResolvedValue([labQuota]);
  });

  it("show how much of each is used, a full one in red", async () => {
    render(<StorageQuotasCard report={report} canEdit={false} {...styles} />);

    const row = await screen.findByTestId("quota-group-9");
    expect(within(row).getByText(/100 GB of 100 GB \(100 %\)/)).toBeInTheDocument();
    expect(within(row).getByText(/full: nothing new can be launched/)).toBeInTheDocument();
    // Only who manages the settings changes them
    expect(screen.queryByRole("button", { name: "Add quota" })).not.toBeInTheDocument();
  });

  it("are added, raised and removed by who manages the settings", async () => {
    storageMocks.saveStorageQuota.mockResolvedValue([labQuota]);
    render(<StorageQuotasCard report={report} canEdit {...styles} />);
    await screen.findByTestId("quota-group-9");

    fireEvent.mouseDown(screen.getAllByRole("combobox")[1]);
    fireEvent.click(await screen.findByRole("option", { name: "Ana Pi (ana@example.org)" }));
    fireEvent.change(screen.getAllByLabelText("Limit (GB)")[1], { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "Add quota" }));
    await waitFor(() => expect(storageMocks.saveStorageQuota).toHaveBeenCalledWith("user", 3, 40 * GB));

    const row = screen.getByTestId("quota-group-9");
    fireEvent.change(within(row).getByLabelText("Limit (GB)"), { target: { value: "150" } });
    fireEvent.click(within(row).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(storageMocks.saveStorageQuota).toHaveBeenLastCalledWith("group", 9, 150 * GB));
    fireEvent.click(within(row).getByRole("button", { name: "Remove the quota of Pi lab" }));
    await waitFor(() => expect(storageMocks.saveStorageQuota).toHaveBeenLastCalledWith("group", 9, null));
  });
});
