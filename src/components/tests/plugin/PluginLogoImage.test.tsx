import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PluginLogoImage from "@/components/plugin/PluginLogoImage";

describe("PluginLogoImage", () => {
  it("shows the fallback when there is no logo or it does not load", () => {
    const { rerender } = render(<PluginLogoImage alt="xmipp icon" fallback={<span>XM</span>} />);
    expect(screen.getByText("XM")).toBeInTheDocument();

    rerender(<PluginLogoImage src="https://scipion.example/xmipp.png" alt="xmipp icon" fallback={<span>XM</span>} />);
    fireEvent.error(screen.getByRole("img", { name: "xmipp icon" }));
    expect(screen.getByText("XM")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
