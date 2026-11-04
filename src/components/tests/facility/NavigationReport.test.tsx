import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const facilityMocks = vi.hoisted(() => ({
  fetchNavigationReportUrl: vi.fn(),
  getNavigationReport: vi.fn(),
  makeNavigationReport: vi.fn(),
}));
vi.mock("@/api/facility", () => facilityMocks);
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import NavigationReport from "@/pages/Facility/NavigationReport";

const data = (navigation: any) => ({ id: 9, folder: "S_DATA_01", navigation });

describe("A tomography DATA's navigation report", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens in a tab of its own once made", async () => {
    const tab = { location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(tab as any);
    facilityMocks.fetchNavigationReportUrl.mockResolvedValue("blob:report");
    render(<NavigationReport dataset={data({ state: "done" })} canMake={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Navigation report of S_DATA_01" }));

    await waitFor(() => expect(tab.location.href).toBe("blob:report"));
    expect(facilityMocks.fetchNavigationReportUrl).toHaveBeenCalledWith(9);
  });

  it("is made by the staff, and only where tomo5-mapper is installed", async () => {
    facilityMocks.makeNavigationReport.mockResolvedValue({ state: "making" });
    const { rerender } = render(<NavigationReport dataset={data({ state: "none", available: true })} canMake />);

    fireEvent.click(screen.getByRole("button", { name: "Make the navigation report" }));
    expect(await screen.findByText("Making the navigation report…")).toBeInTheDocument();
    expect(facilityMocks.makeNavigationReport).toHaveBeenCalledWith(9);

    rerender(<NavigationReport dataset={data({ state: "none", available: false })} canMake />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(<NavigationReport dataset={data({ state: "failed", available: true, message: "No Tomography 5 session" })} canMake={false} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
