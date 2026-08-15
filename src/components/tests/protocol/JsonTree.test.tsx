import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import JsonTree from "@/components/protocol/JsonTree";

function setClipboardMock(writeTextImpl = vi.fn().mockResolvedValue(undefined)) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: writeTextImpl },
    configurable: true,
  });

  return writeTextImpl;
}

describe("JsonTree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setClipboardMock();
  });

  it("renders root content with scalar fields", () => {
    render(
      <JsonTree
        data={{
          name: "Scipion",
          count: 3,
          enabled: true,
          empty: null,
        }}
      />,
    );

    expect(screen.getByText('"name"')).toBeInTheDocument();
    expect(screen.getByText('"Scipion"')).toBeInTheDocument();

    expect(screen.getByText('"count"')).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();

    expect(screen.getByText('"enabled"')).toBeInTheDocument();
    expect(screen.getByText("true")).toBeInTheDocument();

    expect(screen.getByText('"empty"')).toBeInTheDocument();
    expect(screen.getByText("null")).toBeInTheDocument();
  });

  it("renders nested objects collapsed by default and expands them when toggled", () => {
    render(
      <JsonTree
        data={{
          nested: {
            child: "value",
          },
        }}
      />,
    );

    expect(screen.getByText('"nested"')).toBeInTheDocument();
    expect(screen.getByText(/\{\s*1 items\}/)).toBeInTheDocument();
    expect(screen.queryByText('"child"')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));

    expect(screen.getByText('"child"')).toBeInTheDocument();
    expect(screen.getByText('"value"')).toBeInTheDocument();
  });

  it("renders arrays collapsed by default and expands them when toggled", () => {
    render(
      <JsonTree
        data={{
          items: [1, 2],
        }}
      />,
    );

    expect(screen.getByText('"items"')).toBeInTheDocument();
    expect(screen.getByText(/\[\s*2 items\]/)).toBeInTheDocument();
    expect(screen.queryByText("1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("copies the JSON content to the clipboard", async () => {
    const writeText = setClipboardMock(vi.fn().mockResolvedValue(undefined));

    render(
      <JsonTree
        data={{
          name: "Scipion",
          count: 3,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy JSON" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });

    expect(writeText).toHaveBeenCalledWith(
      JSON.stringify(
        {
          name: "Scipion",
          count: 3,
        },
        null,
        2,
      ),
    );

    expect(screen.getByText("Copying...")).toBeInTheDocument();
  });

  it("renders circular references safely", () => {
    const data: any = {
      name: "root",
    };
    data.self = data;

    render(<JsonTree data={data} />);

    expect(screen.getByText('"self"')).toBeInTheDocument();
    expect(screen.getByText('"[Circular]"')).toBeInTheDocument();
  });

  it("renders bigint, function and symbol values safely", () => {
    render(
      <JsonTree
        data={{
          big: BigInt(5),
          fn: () => "hello",
          sym: Symbol("x"),
        }}
      />,
    );

    expect(screen.getByText('"big"')).toBeInTheDocument();
    expect(screen.getByText('"5"')).toBeInTheDocument();

    expect(screen.getByText('"fn"')).toBeInTheDocument();
    expect(screen.getByText('"[Function]"')).toBeInTheDocument();

    expect(screen.getByText('"sym"')).toBeInTheDocument();
    expect(screen.getByText('"[Symbol]"')).toBeInTheDocument();
  });
});