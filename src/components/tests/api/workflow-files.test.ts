import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  importWorkflowFile,
  inspectWorkflowFile,
} from "@/api/projects";
import { fetchWithAuth } from "@/api/auth";


vi.mock("@/api/auth", () => ({
  fetchWithAuth: vi.fn(),
}));


describe("workflow file API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });


  it("inspects a workflow file using the filesystem endpoint", async () => {
    const inspection = {
      path: "workflows/demo.json",
      fileName: "demo.json",
      scipionWebWrapped: true,
      protocolsCount: 3,
      requiredPluginNames: [
        "xmipp3",
      ],
      missingPluginNames: [],
      canLoad: true,
      disabledReason: "",
    };

    vi.mocked(fetchWithAuth)
      .mockResolvedValue(
        new Response(
          JSON.stringify(
            inspection,
          ),
          {
            status: 200,
          },
        ),
      );

    const result =
      await inspectWorkflowFile(
        "workflows/demo.json",
      );

    const [url, options] =
      vi.mocked(fetchWithAuth)
        .mock.lastCall!;

    expect(
      String(url),
    ).toContain(
      "/projects/workflows/inspect-file",
    );

    expect(
      options?.method,
    ).toBe("POST");

    expect(
      options?.headers,
    ).toEqual({
      "Content-Type":
        "application/json",
    });

    expect(
      JSON.parse(
        String(options?.body),
      ),
    ).toEqual({
      path:
        "workflows/demo.json",
    });

    expect(result).toEqual(
      inspection,
    );
  });


  it("imports a workflow file into the selected project", async () => {
    const importResult = {
      status: 0,
      errors: [],
      protocolsCount: 3,
      dependenciesCount: 2,
      fileName: "demo.json",
      requiredPluginNames: [
        "xmipp3",
      ],
    };

    vi.mocked(fetchWithAuth)
      .mockResolvedValue(
        new Response(
          JSON.stringify(
            importResult,
          ),
          {
            status: 200,
          },
        ),
      );

    const result =
      await importWorkflowFile(
        42,
        "workflows/demo.json",
      );

    const [url, options] =
      vi.mocked(fetchWithAuth)
        .mock.lastCall!;

    expect(
      String(url),
    ).toContain(
      "/projects/42/workflows/import-file",
    );

    expect(
      options?.method,
    ).toBe("POST");

    expect(
      JSON.parse(
        String(options?.body),
      ),
    ).toEqual({
      path:
        "workflows/demo.json",
    });

    expect(result).toEqual(
      importResult,
    );
  });


  it("routes workflow file operations through the production adapter", async () => {
    vi.mocked(fetchWithAuth)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            path:
              "workflows/demo.json",
            fileName:
              "demo.json",
            scipionWebWrapped:
              true,
            protocolsCount: 1,
            requiredPluginNames:
              [],
            missingPluginNames:
              [],
            canLoad: true,
            disabledReason: "",
          }),
          {
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 0,
            errors: [],
            protocolsCount: 1,
          }),
          {
            status: 200,
          },
        ),
      );

    const {
      default: service,
    } = await import(
      "@/adapters/projectsAdapter"
    );

    await service
      .inspectWorkflowFile(
        "workflows/demo.json",
      );

    expect(
      String(
        vi.mocked(
          fetchWithAuth,
        ).mock.calls[0][0],
      ),
    ).toContain(
      "/projects/workflows/inspect-file",
    );

    await service
      .importWorkflowFile(
        19,
        "workflows/demo.json",
      );

    expect(
      String(
        vi.mocked(
          fetchWithAuth,
        ).mock.calls[1][0],
      ),
    ).toContain(
      "/projects/19/workflows/import-file",
    );
  });
});