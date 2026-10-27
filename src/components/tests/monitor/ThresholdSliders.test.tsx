import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ThresholdSliders, { previewAlerts } from "@/components/monitor/ThresholdSliders";
import type { StreamingMonitorThresholds } from "@/services/ProjectService";

const thresholds = { maxResolution: null, maxResidual: 2 } as StreamingMonitorThresholds;

describe("ThresholdSliders", () => {
  it("keeps disabled thresholds off until explicitly enabled", () => {
    const onChange = vi.fn();
    render(<ThresholdSliders names={["maxResolution"]} thresholds={thresholds} bounds={thresholds} onChange={onChange} />);
    expect(screen.getByRole("slider")).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Enable CTF resolution worse than" }));
    expect(onChange).toHaveBeenCalledWith({ maxResolution: 10 });
  });

  it("allows large existing thresholds without clipping the slider", () => {
    render(<ThresholdSliders names={["maxResidual"]} thresholds={{ ...thresholds, maxResidual: 250 }}
                             bounds={{ ...thresholds, maxResidual: 250 }} onChange={vi.fn()} />);
    expect(screen.getByRole("slider")).toHaveAttribute("max", "500");
    expect(screen.getByRole("slider")).toHaveValue("250");
  });

  it("shows defocus as one range and keeps the two endpoints from crossing", () => {
    const onChange = vi.fn();
    const limits = { ...thresholds, minDefocus: 1000, maxDefocus: 40000 };
    render(<ThresholdSliders names={["minDefocus", "maxDefocus"]} thresholds={limits} bounds={limits} onChange={onChange} />);
    expect(screen.getByRole("group", { name: "Defocus range" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("slider", { name: "Defocus below slider" }), { target: { value: "45000" } });
    expect(onChange).toHaveBeenLastCalledWith({ minDefocus: 39990 });
    fireEvent.change(screen.getByRole("slider", { name: "Defocus above slider" }), { target: { value: "500" } });
    expect(onChange).toHaveBeenLastCalledWith({ maxDefocus: 1010 });
  });

  it("switches both defocus limits off together", () => {
    const onChange = vi.fn();
    const limits = { ...thresholds, minDefocus: 1000, maxDefocus: 40000 };
    render(<ThresholdSliders names={["minDefocus", "maxDefocus"]} thresholds={limits} bounds={limits} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Enable defocus range" }));
    expect(onChange).toHaveBeenCalledWith({ minDefocus: null, maxDefocus: null });
  });

  it("previews lower and upper limits, disabled limits and missing values", () => {
    expect(previewAlerts(["maxResolution", "maxTotalDrift"], {
      minDefocus: 1000, maxResolution: null, maxAstigmatism: 500,
    }, { minDefocus: 800, maxAstigmatism: 600 })).toEqual(["maxTotalDrift", "minDefocus", "maxAstigmatism"]);
    expect(previewAlerts(["minParticles"], { minParticles: 100 }, {})).toEqual([]);
    expect(previewAlerts([], { maxResidual: 2 }, { maxResidual: 2 })).toEqual([]);
  });
});
