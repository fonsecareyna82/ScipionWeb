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

  it("keeps the defocus track fixed when either endpoint is saved", () => {
    const onChange = vi.fn();
    const limits = { ...thresholds, minDefocus: 1000, maxDefocus: 40000 };
    const view = render(<ThresholdSliders names={["minDefocus", "maxDefocus"]} thresholds={limits} bounds={limits} onChange={onChange} />);
    const lower = screen.getByRole("slider", { name: "Defocus below slider" });
    const upper = screen.getByRole("slider", { name: "Defocus above slider" });
    expect(upper).toHaveAttribute("max", "80000");
    fireEvent.change(upper, { target: { value: "30000" } });
    expect(onChange).toHaveBeenLastCalledWith({ maxDefocus: 30000 });
    const saved = { ...limits, maxDefocus: 30000 };
    view.rerender(<ThresholdSliders names={["minDefocus", "maxDefocus"]} thresholds={saved} bounds={saved} onChange={onChange} />);
    expect(upper).toHaveAttribute("max", "80000");
    expect(lower).toHaveValue("1000");
    const next = { ...saved, minDefocus: 2000 };
    view.rerender(<ThresholdSliders names={["minDefocus", "maxDefocus"]} thresholds={next} bounds={next} onChange={onChange} />);
    expect(upper).toHaveValue("30000");
    expect(lower).toHaveAttribute("max", "80000");
  });

  it("keeps scalar slider scales fixed after saving, while allowing external values beyond the scale", () => {
    const onChange = vi.fn();
    const initial = { ...thresholds, maxResidual: 250 };
    const view = render(<ThresholdSliders names={["maxResidual"]} thresholds={initial} bounds={initial} onChange={onChange} />);
    const saved = { ...initial, maxResidual: 150 };
    view.rerender(<ThresholdSliders names={["maxResidual"]} thresholds={saved} bounds={saved} onChange={onChange} />);
    expect(screen.getByRole("slider")).toHaveAttribute("max", "500");
    const external = { ...saved, maxResidual: 1000 };
    view.rerender(<ThresholdSliders names={["maxResidual"]} thresholds={external} bounds={external} onChange={onChange} />);
    expect(screen.getByRole("slider")).toHaveAttribute("max", "2000");
    expect(screen.getByRole("slider")).toHaveValue("1000");
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
