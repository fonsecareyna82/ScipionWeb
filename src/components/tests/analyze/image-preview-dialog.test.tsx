import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ImagePreviewDialog, type ImagePreviewSource } from "../../analyze/image-preview-dialog";

function source(overrides: Partial<ImagePreviewSource>): ImagePreviewSource {
  return {
    title: "Image",
    path: "/data/image.mrc",
    loadImage: async () => ({ url: "blob:quick", revoke: vi.fn() }),
    ...overrides,
  };
}

describe("ImagePreviewDialog", () => {
  it("shows on the image that the full resolution one is loading, then that it arrived", async () => {
    let resolveFull!: (result: { url: string; revoke: () => void }) => void;
    render(
      <ImagePreviewDialog
        image={source({ loadFullImage: () => new Promise((done) => { resolveFull = done; }) })}
        onClose={vi.fn()}
      />,
    );
    const dialog = await screen.findByRole("dialog", { name: "Image preview" });
    expect(await within(dialog).findByTestId("preview-quality-badge")).toHaveTextContent("Loading full resolution…");
    resolveFull({ url: "blob:full", revoke: vi.fn() });
    await waitFor(() => expect(within(dialog).getByTestId("preview-quality-badge")).toHaveTextContent(/^Full resolution/));
    expect(within(dialog).getByRole("img")).toHaveAttribute("src", "blob:full");
  });

  it("keeps the quick image when the full resolution one cannot be loaded", async () => {
    render(
      <ImagePreviewDialog
        image={source({ loadFullImage: async () => { throw new Error("too big"); } })}
        onClose={vi.fn()}
      />,
    );
    const dialog = await screen.findByRole("dialog", { name: "Image preview" });
    await waitFor(() => expect(within(dialog).getByText(/^Preview/)).toBeInTheDocument());
    expect(within(dialog).getByRole("img")).toHaveAttribute("src", "blob:quick");
    expect(within(dialog).queryByText("Image preview unavailable")).not.toBeInTheDocument();
  });

  it("shows the full resolution image when only it can be loaded", async () => {
    render(
      <ImagePreviewDialog
        image={source({
          loadImage: async () => { throw new Error("no quick image"); },
          loadFullImage: async () => ({ url: "blob:full", revoke: vi.fn() }),
        })}
        onClose={vi.fn()}
      />,
    );
    const dialog = await screen.findByRole("dialog", { name: "Image preview" });
    expect(await within(dialog).findByRole("img")).toHaveAttribute("src", "blob:full");
    expect(within(dialog).getByTestId("preview-quality-badge")).toHaveTextContent(/^Full resolution/);
    expect(within(dialog).queryByText("Image preview unavailable")).not.toBeInTheDocument();
  });

  it("shows an error only when no image can be loaded", async () => {
    render(
      <ImagePreviewDialog
        image={source({
          loadImage: async () => { throw new Error("Unreadable file"); },
          loadFullImage: async () => { throw new Error("Unreadable file"); },
        })}
        onClose={vi.fn()}
      />,
    );
    const dialog = await screen.findByRole("dialog", { name: "Image preview" });
    expect(await within(dialog).findByText("Image preview unavailable")).toBeInTheDocument();
    expect(within(dialog).getByText("Unreadable file")).toBeInTheDocument();
  });

  it("does not let a late quick image replace the full resolution one", async () => {
    let resolveQuick!: (result: { url: string; revoke: () => void }) => void;
    const revokeQuick = vi.fn();
    render(
      <ImagePreviewDialog
        image={source({
          loadImage: () => new Promise((done) => { resolveQuick = done; }),
          loadFullImage: async () => ({ url: "blob:full", revoke: vi.fn() }),
        })}
        onClose={vi.fn()}
      />,
    );
    const dialog = await screen.findByRole("dialog", { name: "Image preview" });
    expect(await within(dialog).findByRole("img")).toHaveAttribute("src", "blob:full");
    resolveQuick({ url: "blob:quick", revoke: revokeQuick });
    await waitFor(() => expect(revokeQuick).toHaveBeenCalledTimes(1));
    expect(within(dialog).getByRole("img")).toHaveAttribute("src", "blob:full");
  });
});
