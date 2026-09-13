import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { VolumeHistogramPlot } from "../../analyze/volume-histogram-plot";

const plot = vi.hoisted(() => vi.fn());
vi.mock("react-plotly.js", () => ({ default: (props: unknown) => { plot(props); return <div />; } }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("sizes the real plot area, uses Plotly 3 titles and changes scale without refetching data", () => {
  let notify!: ResizeObserverCallback;
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class { constructor(callback: ResizeObserverCallback) { notify = callback; } observe() {} disconnect = disconnect; });
  let rect = { width: 310, height: 280 };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => rect as DOMRect);
  const data = { x: [0.5], y: [12], width: [1] };
  const { unmount } = render(<VolumeHistogramPlot data={data} range={[0, 1]} />);
  expect(plot.mock.lastCall?.[0].layout).toMatchObject({ width: 310, height: 280, autosize: false, xaxis: { title: { text: "Intensity" } }, yaxis: { title: { text: "Count" } } });
  rect = { width: 420, height: 340 };
  act(() => notify([], {} as ResizeObserver));
  expect(plot.mock.lastCall?.[0].layout).toMatchObject({ width: 420, height: 340 });
  fireEvent.click(screen.getByRole("button", { name: "Log" }));
  expect(plot.mock.lastCall?.[0].layout.yaxis.type).toBe("log");
  expect(plot.mock.lastCall?.[0].data[0].y).toBe(data.y);
  unmount();
  expect(disconnect).toHaveBeenCalledOnce();
});
