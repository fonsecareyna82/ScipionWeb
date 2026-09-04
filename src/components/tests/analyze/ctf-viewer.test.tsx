import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";


const serviceMocks =
  vi.hoisted(() => ({
    listOutputCTFs: vi.fn(),
    fetchCTFPsdImageObjectUrl: vi.fn(),
    fetchCTFMicrographImageObjectUrl: vi.fn(),
  }));


vi.mock(
  "@/ProjectServiceContext",
  () => ({
    useProjectService: () =>
      serviceMocks,
  }),
);


vi.mock(
  "react-plotly.js",
  () => ({
    default: ({
      onClick,
    }: {
      onClick?: (
        event: unknown,
      ) => void;
    }) => (
      <div data-testid="mock-plotly">
        <button
          type="button"
          onClick={() =>
            onClick?.({
              points: [
                {
                  customdata: [
                    "2",
                    "mic_002",
                  ],
                },
              ],
              event: {
                button: 0,
              },
            })
          }
        >
          select-ctf-2
        </button>
      </div>
    ),
  }),
);


vi.mock(
  "../../analyze/metadata-viewer",
  () => ({
    MetadataViewer: ({
      outputName,
    }: {
      outputName: string;
    }) => (
      <div>
        Mock MetadataViewer {outputName}
      </div>
    ),
  }),
);


import CtfViewer
  from "../../analyze/ctf-viewer";


function makePayload() {
  return {
    total: 2,
    ctfs: [
      {
        ctfId: "1",
        position: 0,
        micrographId: "1",
        micrographName: "mic_001",
        excluded: false,
        failed: false,
        defocusU: 22000,
        defocusV: 21000,
        astigmatism: 1000,
        defocusAngle: 30,
        resolution: 4.2,
        fitQuality: 0.91,
        phaseShift: 0.1,
        psdFile:
          "Runs/000001/psd_001.mrc",
      },
      {
        ctfId: "2",
        position: 1,
        micrographId: "2",
        micrographName: "mic_002",
        excluded: false,
        failed: true,
        defocusU: -999,
        defocusV: -1,
        psdFile:
          "Runs/000001/psd_002.mrc",
      },
    ],
  };
}


describe(
  "CtfViewer",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      serviceMocks
        .listOutputCTFs
        .mockResolvedValue(
          makePayload(),
        );

      serviceMocks
        .fetchCTFMicrographImageObjectUrl
        .mockImplementation(
          async (
            _projectId,
            _protocolId,
            _outputName,
            ctfId,
          ) => ({
            url:
              `blob:micrograph-${ctfId}`,
            revoke: vi.fn(),
          }),
        );

      serviceMocks
        .fetchCTFPsdImageObjectUrl
        .mockImplementation(
          async (
            _projectId,
            _protocolId,
            _outputName,
            ctfId,
          ) => ({
            url:
              `blob:psd-${ctfId}`,
            revoke: vi.fn(),
          }),
        );
    });


    it(
      "selects the first CTF and loads its micrograph and PSD by default",
      async () => {
        render(
          <CtfViewer
            projectId={1}
            protocolId={2}
            outputName="outputCTF"
          />,
        );

        expect(
          await screen.findAllByText(
            "mic_001",
          ),
        ).not.toHaveLength(0);

        await waitFor(() => {
          expect(
            serviceMocks
              .fetchCTFMicrographImageObjectUrl,
          ).toHaveBeenCalledWith(
            1,
            2,
            "outputCTF",
            "1",
            expect.objectContaining({
              size: 1024,
            }),
          );

          expect(
            serviceMocks
              .fetchCTFPsdImageObjectUrl,
          ).toHaveBeenCalledWith(
            1,
            2,
            "outputCTF",
            "1",
            expect.objectContaining({
              size: 1024,
            }),
          );
        });
      },
    );


    it(
      "marks failed CTFs explicitly",
      async () => {
        render(
          <CtfViewer
            projectId={1}
            protocolId={2}
            outputName="outputCTF"
          />,
        );

        expect(
          await screen.findByText(
            "FAILED",
          ),
        ).toBeInTheDocument();

        expect(
          screen.getByText(
            "2 CTFs · 1 failed",
          ),
        ).toBeInTheDocument();
      },
    );


    it(
      "selects the CTF from the plot",
      async () => {
        render(
          <CtfViewer
            projectId={1}
            protocolId={2}
            outputName="outputCTF"
          />,
        );

        await screen.findByTestId(
          "mock-plotly",
        );

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name: "select-ctf-2",
            },
          ),
        );

        await waitFor(() => {
          expect(
            serviceMocks
              .fetchCTFMicrographImageObjectUrl,
          ).toHaveBeenLastCalledWith(
            1,
            2,
            "outputCTF",
            "2",
            expect.any(Object),
          );
        });
      },
    );


    it(
      "opens the metadata viewer",
      async () => {
        render(
          <CtfViewer
            projectId={1}
            protocolId={2}
            outputName="outputCTF"
          />,
        );

        await screen.findAllByText(
          "mic_001",
        );

        fireEvent.click(
          screen.getByRole(
            "button",
            {
              name: "Metadata",
            },
          ),
        );

        expect(
          screen.getByText(
            "Mock MetadataViewer outputCTF",
          ),
        ).toBeInTheDocument();

        expect(
          screen.getByRole(
            "button",
            {
              name: "CTF viewer",
            },
          ),
        ).toBeInTheDocument();
      },
    );
  },
);