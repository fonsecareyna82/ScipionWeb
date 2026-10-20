// Graph card, table and filter read the same assignments (useProjectTags):
// a change made in one shows in the others.
import { useMemo, useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ProtocolNodeCard from "@/components/protocol/ProtocolNodeCard";
import ProjectProtocolTable from "@/components/projects/ProjectProtocolTable";
import CreateTagDialog from "@/components/tags/CreateTagDialog";
import { ProjectTagsContext, type ProjectTagsContextValue } from "@/components/tags/ProjectTagsContext";
import { useProjectTags } from "@/hooks/useProjectTags";
import type { TagFilterMode } from "@/utils/protocol_tags";

vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

vi.mock("reactflow", () => ({
  Handle: () => null,
  Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
  useReactFlow: () => ({ getNodes: () => [], setNodes: vi.fn() }),
  useUpdateNodeInternals: () => vi.fn(),
}));

vi.mock("@/components/protocol/DragContext", () => ({
  useDrag: () => ({ setCurrentDraggedOutput: vi.fn() }),
}));

vi.mock("@/ProjectServiceContext", () => ({
  useProjectService: () => ({}),
}));

vi.mock("@/icons", () => ({
  CloseIcon: () => <svg />,
  HelpIcon: () => <svg />,
}));

vi.mock("@/components/analyze/analyze-output-dialog", () => ({ default: () => null }));
vi.mock("@/components/files/RemoteFileDialog", () => ({ default: () => null }));

// Menus render inline, so their items can be clicked directly.
function inlineMenu(prefix: "DropdownMenu" | "ContextMenu") {
  const Pass = ({ children }: any) => <div>{children}</div>;
  const Item = ({ children, onClick, onSelect, onCheckedChange, checked, inset, variant, ...props }: any) => (
    <button
      type="button"
      {...props}
      onClick={() => {
        onClick?.();
        onSelect?.({ preventDefault() {}, stopPropagation() {} });
        onCheckedChange?.(!checked);
      }}
    >
      {children}
    </button>
  );
  return {
    [prefix]: Pass,
    [`${prefix}Trigger`]: Pass,
    [`${prefix}Content`]: Pass,
    [`${prefix}Item`]: Item,
    [`${prefix}CheckboxItem`]: Item,
    [`${prefix}RadioGroup`]: Pass,
    [`${prefix}RadioItem`]: Item,
    [`${prefix}Label`]: Pass,
    [`${prefix}Separator`]: () => <hr />,
    [`${prefix}Sub`]: Pass,
    [`${prefix}SubTrigger`]: ({ children }: any) => <div>{children}</div>,
    [`${prefix}SubContent`]: Pass,
  };
}
vi.mock("@/components/ui/dropdown-menu", () => inlineMenu("DropdownMenu"));
vi.mock("@/components/ui/context-menu", () => inlineMenu("ContextMenu"));

const tagList = [
  { id: "a", title: "Alpha", color: "#ef4444" },
  { id: "b", title: "Beta", color: "#22c55e" },
];

const rows = [
  { id: "10", runName: "Import movies", label: "ProtImportMovies", status: "finished", tags: ["a"] },
  { id: "20", runName: "Motion correction", label: "ProtMotionCorr", status: "finished", tags: [] },
];

function createService() {
  return {
    listProjectTags: vi.fn().mockResolvedValue(tagList),
    createProjectTag: vi.fn(async (_pid: unknown, payload: any) => ({ id: "new", ...payload })),
    setProtocolTagIds: vi.fn(async (_pid: unknown, protocolId: unknown, tagIds: string[]) => ({
      protocolId: String(protocolId),
      tagIds,
      ignoredTagIds: [],
    })),
  };
}

function Harness({
  service,
  filterIds = [],
  filterMode = "any",
}: {
  service: ReturnType<typeof createService>;
  filterIds?: string[];
  filterMode?: TagFilterMode;
}) {
  const tags = useProjectTags({ service, projectId: 7 });
  const [seeded, setSeeded] = useState(false);
  const [createTargets, setCreateTargets] = useState<string[] | null>(null);
  if (!seeded) {
    // As a graph load does: every protocol gets an entry.
    tags.seedAssignments({ "10": ["a"], "20": [] });
    setSeeded(true);
  }

  const context = useMemo<ProjectTagsContextValue>(() => ({
    tags: tags.tags,
    tagsById: tags.tagsById,
    loading: tags.tagsLoading,
    assignments: tags.assignments,
    toggleTag: (ids, tagId) => void tags.toggleTag(ids, tagId),
    requestCreateTag: setCreateTargets,
  }), [tags.tags, tags.tagsById, tags.tagsLoading, tags.assignments, tags.toggleTag]);

  return (
    <ProjectTagsContext.Provider value={context}>
      <div data-testid="card">
        <ProtocolNodeCard
          data={{ id: "10", label: "ProtImportMovies", runName: "Import movies", title: "", comment: "", status: "finished", projectId: 7 }}
        />
      </div>
      <div data-testid="table">
        <ProjectProtocolTable
          projectStorageKey="tags-test"
          rows={rows}
          allTags={tags.tags}
          tagAssignments={tags.assignments}
          externalTagFilterIds={filterIds}
          tagFilterMode={filterMode}
          searchQuery=""
          highlightedId={null}
          selectedIds={[]}
          isRefreshing={false}
          onRefresh={vi.fn()}
          onActivate={vi.fn()}
          onOpen={vi.fn()}
          onBrowse={vi.fn()}
          onAnnotate={vi.fn()}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
          onRestartAll={vi.fn()}
          onContinueAll={vi.fn()}
          onResetFrom={vi.fn()}
          onStop={vi.fn()}
          onSelectionChange={vi.fn()}
          onToggleTag={(ids, tagId, enabled) => tags.toggleTag(ids, tagId, enabled)}
          onCreateTag={setCreateTargets}
        />
      </div>
      <CreateTagDialog
        open={createTargets != null}
        targetCount={createTargets?.length ?? 0}
        existingTags={tags.tags}
        onCreate={(payload) => tags.createTagAndAssign(payload, createTargets ?? [])}
        onClose={() => setCreateTargets(null)}
      />
    </ProjectTagsContext.Provider>
  );
}

const card = () => screen.getByTestId("card");
const table = () => screen.getByTestId("table");
const rowOf = (name: string) => within(table()).getByText(name).closest("tr") as HTMLElement;
// Chips of a table row: the tags cell, not the menu.
const rowChips = (name: string) =>
  Array.from(rowOf(name).querySelectorAll(".ppt-tagChip")).map((chip) => chip.textContent);

async function renderHarness(props: Partial<Parameters<typeof Harness>[0]> = {}) {
  const service = createService();
  render(<Harness service={service} {...props} />);
  await waitFor(() => expect(within(card()).getByLabelText("Protocol tags")).toHaveTextContent("Alpha"));
  return service;
}

describe("protocol tags: one source for graph, table and filter", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows a tag added in the graph in the table, and one removed in the table in the graph", async () => {
    const service = await renderHarness();

    fireEvent.click(within(card()).getAllByRole("menuitemcheckbox", { name: /Beta/ })[0]);

    await waitFor(() => expect(rowChips("Import movies")).toEqual(["Alpha", "Beta"]));
    expect(service.setProtocolTagIds).toHaveBeenLastCalledWith(7, "10", ["a", "b"]);

    fireEvent.click(within(rowOf("Import movies")).getByRole("menuitemcheckbox", { name: /Alpha/ }));

    await waitFor(() => expect(within(card()).getByLabelText("Protocol tags")).not.toHaveTextContent("Alpha"));
    expect(within(card()).getByLabelText("Protocol tags")).toHaveTextContent("Beta");
    expect(service.setProtocolTagIds).toHaveBeenLastCalledWith(7, "10", ["b"]);
  });

  it("lets the table filter follow a tag given in the graph", async () => {
    await renderHarness({ filterIds: ["b"] });
    expect(within(table()).queryByText("Import movies")).not.toBeInTheDocument();

    fireEvent.click(within(card()).getAllByRole("menuitemcheckbox", { name: /Beta/ })[0]);

    await waitFor(() => expect(within(table()).getByText("Import movies")).toBeInTheDocument());
  });

  it("tags a single table row from its own menu", async () => {
    const service = await renderHarness();

    fireEvent.click(within(rowOf("Motion correction")).getByRole("menuitemcheckbox", { name: /Beta/ }));

    await waitFor(() => expect(rowChips("Motion correction")).toEqual(["Beta"]));
    expect(service.setProtocolTagIds).toHaveBeenCalledWith(7, "20", ["b"]);
    // The other row is untouched.
    expect(rowChips("Import movies")).toEqual(["Alpha"]);
  });

  it("creates a tag from a row's menu and gives it to that row", async () => {
    const service = await renderHarness();

    fireEvent.click(within(rowOf("Motion correction")).getByRole("button", { name: /New tag/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("The new tag will be added to this protocol.");
    fireEvent.change(within(dialog).getAllByRole("textbox")[0], { target: { value: "Gamma" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(rowChips("Motion correction")).toEqual(["Gamma"]));
    expect(service.createProjectTag).toHaveBeenCalledWith(7, { title: "Gamma", description: null, color: "#3b82f6" });
    expect(service.setProtocolTagIds).toHaveBeenCalledWith(7, "20", ["new"]);
  });

  it("matches any or all of the filter tags in the table", async () => {
    const { rerender } = render(<Harness service={createService()} filterIds={["a", "b"]} filterMode="all" />);
    await waitFor(() => expect(within(card()).getByLabelText("Protocol tags")).toHaveTextContent("Alpha"));
    expect(within(table()).queryByText("Import movies")).not.toBeInTheDocument();

    rerender(<Harness service={createService()} filterIds={["a", "b"]} filterMode="any" />);
    expect(within(table()).getByText("Import movies")).toBeInTheDocument();
    expect(within(table()).queryByText("Motion correction")).not.toBeInTheDocument();
  });
});
