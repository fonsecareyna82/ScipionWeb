import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import {
    Box,
    Button,
    CircularProgress,
    MenuItem,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";

import {
    ArrowBack,
    TableView as MetadataIcon,
} from "@mui/icons-material";

import Plot from "react-plotly.js";

import { useProjectService } from "@/ProjectServiceContext";

import type {
    CtfModelListItem,
    Id,
} from "@/services/ProjectService";

import { MetadataViewer } from "./metadata-viewer";


type CtfViewerProps = {
    projectId: Id;
    protocolId: Id;
    outputName: string;
    hideMetadataAction?: boolean;
};


type PreviewPanelProps = {
    title: string;
    subtitle?: string;
    loading: boolean;
    error: string | null;
    imageUrl: string | null;
    emptyText: string;
    alt: string;
};

type CtfPlotMode =
    | "trends"
    | "quality"
    | "distribution";

type CtfDistributionMetric =
    | "resolution"
    | "meanDefocus"
    | "astigmatism"
    | "fitQuality";

const distributionMetrics: Array<{
    value: CtfDistributionMetric;
    label: string;
}> = [
        { value: "resolution", label: "Resolution (Å)" },
        { value: "meanDefocus", label: "Mean defocus (µm)" },
        { value: "astigmatism", label: "Astigmatism (Å)" },
        { value: "fitQuality", label: "Fit quality" },
    ];

function median(values: number[]): number | null {
    const sorted = values
        .filter(Number.isFinite)
        .sort((a, b) => a - b);

    if (!sorted.length) return null;

    const middle = Math.floor(sorted.length / 2);

    return sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2;
}

function getMeanDefocus(row: CtfModelListItem): number | null {
    if (
        row.defocusU == null ||
        row.defocusV == null ||
        !Number.isFinite(row.defocusU) ||
        !Number.isFinite(row.defocusV)
    ) {
        return null;
    }

    return (row.defocusU + row.defocusV) / 2;
}

function getAstigmatism(row: CtfModelListItem): number | null {
    if (
        row.astigmatism != null &&
        Number.isFinite(row.astigmatism)
    ) {
        return Math.abs(row.astigmatism);
    }

    if (
        row.defocusU != null &&
        row.defocusV != null &&
        Number.isFinite(row.defocusU) &&
        Number.isFinite(row.defocusV)
    ) {
        return Math.abs(row.defocusU - row.defocusV);
    }

    return null;
}


function formatNumber(
    value: number | null | undefined,
    decimals = 2,
): string {
    if (value == null || !Number.isFinite(value)) {
        return "";
    }

    return value.toFixed(decimals);
}


function getStatus(row: CtfModelListItem): string {
    if (row.failed) {
        return "FAILED";
    }

    if (row.excluded) {
        return "Excluded";
    }

    return "OK";
}


function PreviewPanel({
    title,
    subtitle,
    loading,
    error,
    imageUrl,
    emptyText,
    alt,
}: PreviewPanelProps) {
    return (
        <Paper
            elevation={0}
            sx={{
                minWidth: 0,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                border: "1px solid #e5e7eb",
                borderRadius: 1.5,
                overflow: "hidden",
                bgcolor: "background.paper",
            }}
        >
            <Box
                sx={{
                    px: 1,
                    py: 0.5,
                    borderBottom: "1px solid #e5e7eb",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 1,
                }}
            >
                <Typography
                    variant="caption"
                    sx={{
                        fontWeight: 700,
                        fontSize: "0.72rem",
                    }}
                >
                    {title}
                </Typography>

                {subtitle ? (
                    <Typography
                        variant="caption"
                        color="text.secondary"
                        noWrap
                        sx={{
                            minWidth: 0,
                            fontSize: "0.68rem",
                        }}
                    >
                        {subtitle}
                    </Typography>
                ) : null}
            </Box>

            <Box
                sx={{
                    flex: 1,
                    minHeight: 0,
                    p: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                }}
            >
                {loading ? (
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                        }}
                    >
                        <CircularProgress size={18} />

                        <Typography
                            variant="body2"
                            sx={{ fontSize: "0.8rem" }}
                        >
                            Loading…
                        </Typography>
                    </Box>
                ) : error ? (
                    <Typography
                        variant="body2"
                        color="error"
                        sx={{ fontSize: "0.78rem" }}
                    >
                        {error}
                    </Typography>
                ) : imageUrl ? (
                    <Box
                        component="img"
                        src={imageUrl}
                        alt={alt}
                        sx={{
                            maxWidth: "100%",
                            maxHeight: "100%",
                            objectFit: "contain",
                        }}
                    />
                ) : (
                    <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                            px: 1,
                            textAlign: "center",
                            fontSize: "0.78rem",
                        }}
                    >
                        {emptyText}
                    </Typography>
                )}
            </Box>
        </Paper>
    );
}


export default function CtfViewer({
    projectId,
    protocolId,
    outputName,
    hideMetadataAction = false,
}: CtfViewerProps) {
    const svc = useProjectService();

    const [mainMode, setMainMode] =
        useState<"viewer" | "metadata">("viewer");

    const [rows, setRows] =
        useState<CtfModelListItem[]>([]);

    const [rowsLoading, setRowsLoading] =
        useState(false);

    const [rowsError, setRowsError] =
        useState<string | null>(null);

    const [selectedCtfId, setSelectedCtfId] =
        useState<Id | null>(null);

    const [filterText, setFilterText] =
        useState("");

    const [plotMode, setPlotMode] =
        useState<CtfPlotMode>("trends");

    const [distributionMetric, setDistributionMetric] =
        useState<CtfDistributionMetric>("resolution");

    const [micrographLoading, setMicrographLoading] =
        useState(false);

    const [micrographError, setMicrographError] =
        useState<string | null>(null);

    const [micrographImageUrl, setMicrographImageUrl] =
        useState<string | null>(null);

    const [psdLoading, setPsdLoading] =
        useState(false);

    const [psdError, setPsdError] =
        useState<string | null>(null);

    const [psdImageUrl, setPsdImageUrl] =
        useState<string | null>(null);

    const previewAbortRef =
        useRef<AbortController | null>(null);

    const micrographRevokeRef =
        useRef<(() => void) | null>(null);

    const psdRevokeRef =
        useRef<(() => void) | null>(null);

    const rowRefs =
        useRef<Record<string, HTMLTableRowElement | null>>({});


    const projectIdNum =
        useMemo(
            () => Number(projectId),
            [projectId],
        );

    const protocolIdNum =
        useMemo(
            () => Number(protocolId),
            [protocolId],
        );

    const canOpenMetadata =
        useMemo(
            () =>
                Number.isFinite(projectIdNum) &&
                Number.isFinite(protocolIdNum),
            [
                projectIdNum,
                protocolIdNum,
            ],
        );


    const getErrorMsg = (
        error: any,
    ): string => {
        if (
            error &&
            typeof error === "object"
        ) {
            return (
                error?.data?.detail ||
                error?.message ||
                "Operation failed"
            );
        }

        return "Operation failed";
    };


    const disposeMicrographImage =
        useCallback(
            () => {
                micrographRevokeRef.current?.();
                micrographRevokeRef.current = null;

                setMicrographImageUrl(null);
            },
            [],
        );


    const disposePsdImage =
        useCallback(
            () => {
                psdRevokeRef.current?.();
                psdRevokeRef.current = null;

                setPsdImageUrl(null);
            },
            [],
        );


    useEffect(
        () => {
            return () => {
                previewAbortRef.current?.abort();

                micrographRevokeRef.current?.();
                psdRevokeRef.current?.();
            };
        },
        [],
    );


    useEffect(
        () => {
            let cancelled = false;

            setRowsLoading(true);
            setRowsError(null);
            setRows([]);
            setSelectedCtfId(null);

            void svc
                .listOutputCTFs(
                    projectId,
                    protocolId,
                    outputName,
                )
                .then((payload) => {
                    if (cancelled) {
                        return;
                    }

                    const nextRows =
                        Array.isArray(payload?.ctfs)
                            ? payload.ctfs
                            : [];

                    setRows(nextRows);

                    setSelectedCtfId(
                        nextRows.length
                            ? nextRows[0].ctfId
                            : null,
                    );
                })
                .catch((error) => {
                    if (cancelled) {
                        return;
                    }

                    console.error(
                        "Failed to load SetOfCTF",
                        error,
                    );

                    setRowsError(
                        getErrorMsg(error),
                    );

                    setRows([]);
                    setSelectedCtfId(null);
                })
                .finally(() => {
                    if (!cancelled) {
                        setRowsLoading(false);
                    }
                });

            return () => {
                cancelled = true;
            };
        },
        [
            svc,
            projectId,
            protocolId,
            outputName,
        ],
    );


    const selectedRow =
        useMemo(
            () => {
                if (selectedCtfId == null) {
                    return null;
                }

                return (
                    rows.find(
                        (row) =>
                            String(row.ctfId) ===
                            String(selectedCtfId),
                    ) ?? null
                );
            },
            [
                rows,
                selectedCtfId,
            ],
        );


    useEffect(
        () => {
            previewAbortRef.current?.abort();
            previewAbortRef.current = null;

            disposeMicrographImage();
            disposePsdImage();

            setMicrographLoading(false);
            setPsdLoading(false);

            setMicrographError(null);
            setPsdError(null);

            if (
                mainMode !== "viewer" ||
                !selectedRow
            ) {
                return;
            }

            const controller =
                new AbortController();

            previewAbortRef.current =
                controller;

            setMicrographLoading(true);

            void svc
                .fetchCTFMicrographImageObjectUrl(
                    projectId,
                    protocolId,
                    outputName,
                    selectedRow.ctfId,
                    {
                        size: 1024,
                        format: "png",
                        quality: 80,
                        signal: controller.signal,
                    },
                )
                .then((result) => {
                    if (
                        controller.signal.aborted
                    ) {
                        result.revoke();
                        return;
                    }

                    micrographRevokeRef.current =
                        result.revoke;

                    setMicrographImageUrl(
                        result.url,
                    );
                })
                .catch((error) => {
                    if (
                        controller.signal.aborted ||
                        error?.name === "AbortError"
                    ) {
                        return;
                    }

                    console.error(
                        "Failed to load CTF micrograph",
                        error,
                    );

                    setMicrographError(
                        getErrorMsg(error),
                    );
                })
                .finally(() => {
                    if (
                        !controller.signal.aborted
                    ) {
                        setMicrographLoading(false);
                    }
                });


            if (selectedRow.psdFile) {
                setPsdLoading(true);

                void svc
                    .fetchCTFPsdImageObjectUrl(
                        projectId,
                        protocolId,
                        outputName,
                        selectedRow.ctfId,
                        {
                            size: 1024,
                            format: "png",
                            quality: 80,
                            signal: controller.signal,
                        },
                    )
                    .then((result) => {
                        if (
                            controller.signal.aborted
                        ) {
                            result.revoke();
                            return;
                        }

                        psdRevokeRef.current =
                            result.revoke;

                        setPsdImageUrl(
                            result.url,
                        );
                    })
                    .catch((error) => {
                        if (
                            controller.signal.aborted ||
                            error?.name === "AbortError"
                        ) {
                            return;
                        }

                        console.error(
                            "Failed to load CTF PSD",
                            error,
                        );

                        setPsdError(
                            getErrorMsg(error),
                        );
                    })
                    .finally(() => {
                        if (
                            !controller.signal.aborted
                        ) {
                            setPsdLoading(false);
                        }
                    });
            }

            return () => {
                controller.abort();

                if (
                    previewAbortRef.current ===
                    controller
                ) {
                    previewAbortRef.current = null;
                }
            };
        },
        [
            mainMode,
            selectedRow,
            svc,
            projectId,
            protocolId,
            outputName,
            disposeMicrographImage,
            disposePsdImage,
        ],
    );


    const filteredRows =
        useMemo(
            () => {
                const needle =
                    filterText
                        .trim()
                        .toLowerCase();

                if (!needle) {
                    return rows;
                }

                return rows.filter((row) => {
                    const values = [
                        row.micrographName,
                        row.micrographId,
                        row.ctfId,
                        row.defocusU,
                        row.defocusV,
                        row.astigmatism,
                        row.defocusAngle,
                        row.resolution,
                        row.fitQuality,
                        row.phaseShift,
                        getStatus(row),
                    ];

                    return values.some(
                        (value) =>
                            String(value ?? "")
                                .toLowerCase()
                                .includes(needle),
                    );
                });
            },
            [
                rows,
                filterText,
            ],
        );


    const failedCount =
        useMemo(
            () =>
                rows.filter(
                    (row) => row.failed,
                ).length,
            [rows],
        );


    const statistics =
        useMemo(() => {
            const validRows = rows.filter(
                (row) => !row.failed && !row.excluded,
            );

            const meanDefocusValues = validRows
                .map(getMeanDefocus)
                .filter((value): value is number => value != null);

            const resolutionValues = validRows
                .map((row) => row.resolution)
                .filter(
                    (value): value is number =>
                        value != null &&
                        Number.isFinite(value) &&
                        value > 0,
                );

            const astigmatismValues = validRows
                .map(getAstigmatism)
                .filter((value): value is number => value != null);

            return {
                total: rows.length,
                failed: failedCount,
                medianMeanDefocus: median(meanDefocusValues),
                medianResolution: median(resolutionValues),
                medianAstigmatism: median(astigmatismValues),
            };
        }, [rows, failedCount]);

    const chartRows =
        useMemo(
            () =>
                filteredRows.filter(
                    (row) => !row.failed,
                ),
            [filteredRows],
        );


    const selectedChartRow =
        useMemo(
            () =>
                chartRows.find(
                    (row) =>
                        String(row.ctfId) ===
                        String(selectedCtfId),
                ) ?? null,
            [
                chartRows,
                selectedCtfId,
            ],
        );

    const qualityRows =
        useMemo(
            () =>
                chartRows.filter((row) => {
                    const meanDefocus = getMeanDefocus(row);
                    const astigmatism = getAstigmatism(row);

                    return (
                        !row.excluded &&
                        meanDefocus != null &&
                        astigmatism != null &&
                        row.resolution != null &&
                        Number.isFinite(row.resolution) &&
                        row.resolution > 0
                    );
                }),
            [chartRows],
        );


    const qualityPlotData =
        useMemo(() => {
            if (!qualityRows.length) return [];

            const customdata = qualityRows.map((row) => [
                String(row.ctfId),
                row.micrographName,
                row.defocusU,
                row.defocusV,
                getMeanDefocus(row),
                getAstigmatism(row),
                row.resolution,
            ]);

            const traces: any[] = [
                {
                    type: "scatter",
                    mode: "markers",
                    name: "CTFs",
                    x: qualityRows.map(
                        (row) => (getMeanDefocus(row) as number) / 10000,
                    ),
                    y: qualityRows.map(
                        (row) => getAstigmatism(row),
                    ),
                    customdata,
                    hovertemplate:
                        "<b>%{customdata[1]}</b><br>" +
                        "DefocusU: %{customdata[2]:.2f} Å<br>" +
                        "DefocusV: %{customdata[3]:.2f} Å<br>" +
                        "Mean defocus: %{x:.3f} µm<br>" +
                        "Astigmatism: %{y:.2f} Å<br>" +
                        "Resolution: %{customdata[6]:.2f} Å" +
                        "<extra></extra>",
                    marker: {
                        size: 9,
                        color: qualityRows.map((row) => row.resolution),
                        colorscale: "Viridis",
                        showscale: true,
                        colorbar: {
                            title: "Resolution (Å)",
                            thickness: 12,
                        },
                        line: {
                            width: 0.5,
                            color: "#374151",
                        },
                    },
                },
            ];

            const selected = qualityRows.find(
                (row) =>
                    selectedCtfId != null &&
                    String(row.ctfId) === String(selectedCtfId),
            );

            if (selected) {
                traces.push({
                    type: "scatter",
                    mode: "markers",
                    name: "Selected CTF",
                    x: [(getMeanDefocus(selected) as number) / 10000],
                    y: [getAstigmatism(selected)],
                    customdata: [[
                        String(selected.ctfId),
                        selected.micrographName,
                        selected.defocusU,
                        selected.defocusV,
                        getMeanDefocus(selected),
                        getAstigmatism(selected),
                        selected.resolution,
                    ]],
                    hovertemplate:
                        "<b>%{customdata[1]}</b><br>" +
                        "Mean defocus: %{x:.3f} µm<br>" +
                        "Astigmatism: %{y:.2f} Å<br>" +
                        "Resolution: %{customdata[6]:.2f} Å" +
                        "<extra></extra>",
                    marker: {
                        size: 13,
                        color: "rgba(250,204,21,0.95)",
                        line: {
                            color: "#111827",
                            width: 2,
                        },
                    },
                    showlegend: false,
                });
            }

            return traces;
        }, [qualityRows, selectedCtfId]);


    const qualityPlotLayout =
        useMemo(
            () => ({
                autosize: true,
                margin: {
                    t: 25,
                    r: 72,
                    b: 48,
                    l: 62,
                },
                hovermode: "closest",
                xaxis: {
                    title: "Mean defocus (µm)",
                    tickformat: ".3f",
                    zeroline: false,
                },
                yaxis: {
                    title: "Astigmatism (Å)",
                    tickformat: ".2f",
                    zeroline: false,
                },
                showlegend: false,
            }),
            [],
        );


    const distributionValues =
        useMemo(() => {
            const validRows = chartRows.filter(
                (row) => !row.excluded,
            );

            return validRows
                .map((row) => {
                    switch (distributionMetric) {
                        case "meanDefocus": {
                            const value = getMeanDefocus(row);
                            return value != null
                                ? value / 10000
                                : null;
                        }

                        case "astigmatism":
                            return getAstigmatism(row);

                        case "fitQuality":
                            return row.fitQuality ?? null;

                        case "resolution":
                        default:
                            return row.resolution != null &&
                                row.resolution > 0
                                ? row.resolution
                                : null;
                    }
                })
                .filter(
                    (value): value is number =>
                        value != null &&
                        Number.isFinite(value),
                );
        }, [chartRows, distributionMetric]);


    const distributionLabel =
        useMemo(
            () =>
                distributionMetrics.find(
                    (item) => item.value === distributionMetric,
                )?.label ?? "Value",
            [distributionMetric],
        );


    const distributionPlotData =
        useMemo(() => {
            if (!distributionValues.length) return [];

            return [
                {
                    type: "histogram",
                    x: distributionValues,
                    nbinsx: Math.min(
                        30,
                        Math.max(
                            8,
                            Math.ceil(Math.sqrt(distributionValues.length)),
                        ),
                    ),
                    hovertemplate:
                        `${distributionLabel}: %{x}<br>` +
                        "Count: %{y}" +
                        "<extra></extra>",
                },
            ];
        }, [distributionValues, distributionLabel]);


    const distributionPlotLayout =
        useMemo(
            () => ({
                autosize: true,
                margin: {
                    t: 25,
                    r: 30,
                    b: 48,
                    l: 52,
                },
                bargap: 0.06,
                xaxis: {
                    title: distributionLabel,
                    zeroline: false,
                },
                yaxis: {
                    title: "Count",
                    rangemode: "tozero",
                    zeroline: false,
                },
                showlegend: false,
            }),
            [distributionLabel],
        );

    const plotData =
        useMemo(
            () => {
                if (!chartRows.length) {
                    return [];
                }

                const x =
                    chartRows.map(
                        (row) =>
                            Number(row.position) + 1,
                    );

                const customdata =
                    chartRows.map((row) => [
                        String(row.ctfId),
                        row.micrographName,
                        row.defocusU,
                        row.defocusV,
                        row.resolution,
                    ]);

                const hovertemplate =
                    "<b>%{customdata[1]}</b><br>" +
                    "Micrograph: %{x}<br>" +
                    "DefocusU: %{customdata[2]:.2f} Å<br>" +
                    "DefocusV: %{customdata[3]:.2f} Å<br>" +
                    "Resolution: %{customdata[4]:.2f} Å" +
                    "<extra></extra>";

                const traces: any[] = [
                    {
                        type: "scatter",
                        mode: "lines+markers",
                        name: "DefocusU (Å)",
                        x,
                        y: chartRows.map(
                            (row) =>
                                row.excluded
                                    ? null
                                    : row.defocusU ?? null,
                        ),
                        customdata,
                        connectgaps: true,
                        hovertemplate,
                        marker: { size: 6 },
                        line: {
                            width: 2,
                            color: "#ef4444",
                        },
                        yaxis: "y",
                    },
                    {
                        type: "scatter",
                        mode: "lines+markers",
                        name: "DefocusV (Å)",
                        x,
                        y: chartRows.map(
                            (row) =>
                                row.excluded
                                    ? null
                                    : row.defocusV ?? null,
                        ),
                        customdata,
                        connectgaps: true,
                        hovertemplate,
                        marker: { size: 6 },
                        line: {
                            width: 2,
                            color: "#3b82f6",
                        },
                        yaxis: "y",
                    },
                    {
                        type: "scatter",
                        mode: "lines+markers",
                        name: "Resolution (Å)",
                        x,
                        y: chartRows.map(
                            (row) =>
                                row.excluded ||
                                    row.resolution === 0
                                    ? null
                                    : row.resolution ?? null,
                        ),
                        customdata,
                        connectgaps: true,
                        hovertemplate,
                        marker: { size: 6 },
                        line: {
                            width: 2,
                            color: "#22c55e",
                        },
                        yaxis: "y2",
                    },
                ];


                const excludedRows =
                    chartRows.filter(
                        (row) => row.excluded,
                    );

                if (excludedRows.length) {
                    traces.push({
                        type: "scatter",
                        mode: "markers",
                        name: "Excluded",
                        x: excludedRows.map(
                            (row) =>
                                Number(row.position) + 1,
                        ),
                        y: excludedRows.map(
                            (row) =>
                                row.defocusU ?? null,
                        ),
                        customdata:
                            excludedRows.map(
                                (row) => [
                                    String(row.ctfId),
                                    row.micrographName,
                                    row.defocusU,
                                    row.defocusV,
                                    row.resolution,
                                ],
                            ),
                        hovertemplate,
                        marker: {
                            size: 7,
                            color: "#6b7280",
                            symbol: "x",
                        },
                        yaxis: "y",
                    });
                }


                if (selectedChartRow) {
                    const selectedCustomData = [[
                        String(selectedChartRow.ctfId),
                        selectedChartRow.micrographName,
                        selectedChartRow.defocusU,
                        selectedChartRow.defocusV,
                        selectedChartRow.resolution,
                    ]];

                    const selectedMarker = {
                        size: 11,
                        color: "rgba(250,204,21,0.95)",
                        line: {
                            color: "#111827",
                            width: 2,
                        },
                    };

                    if (
                        selectedChartRow.defocusU != null
                    ) {
                        traces.push({
                            type: "scatter",
                            mode: "markers",
                            x: [
                                Number(
                                    selectedChartRow.position,
                                ) + 1,
                            ],
                            y: [
                                selectedChartRow.defocusU,
                            ],
                            customdata:
                                selectedCustomData,
                            hovertemplate,
                            marker: selectedMarker,
                            yaxis: "y",
                            showlegend: false,
                        });
                    }

                    if (
                        selectedChartRow.defocusV != null
                    ) {
                        traces.push({
                            type: "scatter",
                            mode: "markers",
                            x: [
                                Number(
                                    selectedChartRow.position,
                                ) + 1,
                            ],
                            y: [
                                selectedChartRow.defocusV,
                            ],
                            customdata:
                                selectedCustomData,
                            hovertemplate,
                            marker: selectedMarker,
                            yaxis: "y",
                            showlegend: false,
                        });
                    }

                    if (
                        selectedChartRow.resolution != null &&
                        selectedChartRow.resolution !== 0
                    ) {
                        traces.push({
                            type: "scatter",
                            mode: "markers",
                            x: [
                                Number(
                                    selectedChartRow.position,
                                ) + 1,
                            ],
                            y: [
                                selectedChartRow.resolution,
                            ],
                            customdata:
                                selectedCustomData,
                            hovertemplate,
                            marker: selectedMarker,
                            yaxis: "y2",
                            showlegend: false,
                        });
                    }
                }

                return traces;
            },
            [
                chartRows,
                selectedChartRow,
            ],
        );


    const plotLayout =
        useMemo(
            () => ({
                autosize: true,
                margin: {
                    t: 36,
                    r: 58,
                    b: 44,
                    l: 62,
                },
                hovermode: "closest",
                legend: {
                    orientation: "h",
                    x: 0,
                    y: 1.12,
                },
                xaxis: {
                    title: "Micrograph",
                    zeroline: false,
                },
                yaxis: {
                    title: "Defocus (Å)",
                    tickformat: ".2f",
                    zeroline: false,
                },
                yaxis2: {
                    title: "Resolution (Å)",
                    tickformat: ".2f",
                    overlaying: "y",
                    side: "right",
                    zeroline: false,
                },
            }),
            [],
        );


    const plotConfig =
        useMemo(
            () => ({
                responsive: true,
                displayModeBar: true,
                displaylogo: false,
                scrollZoom: true,
            }),
            [],
        );


    const activePlotData =
        useMemo(() => {
            switch (plotMode) {
                case "quality":
                    return qualityPlotData;

                case "distribution":
                    return distributionPlotData;

                case "trends":
                default:
                    return plotData;
            }
        }, [
            plotMode,
            plotData,
            qualityPlotData,
            distributionPlotData,
        ]);


    const activePlotLayout =
        useMemo(() => {
            switch (plotMode) {
                case "quality":
                    return qualityPlotLayout;

                case "distribution":
                    return distributionPlotLayout;

                case "trends":
                default:
                    return plotLayout;
            }
        }, [
            plotMode,
            plotLayout,
            qualityPlotLayout,
            distributionPlotLayout,
        ]);


    const plotModeTitle =
        plotMode === "quality"
            ? "CTF quality map"
            : plotMode === "distribution"
                ? "CTF distributions"
                : "CTF trends";


    const plotModeDescription =
        plotMode === "quality"
            ? "Mean defocus · Astigmatism · Resolution"
            : plotMode === "distribution"
                ? distributionLabel
                : "Defocus U/V · Resolution · FAILED CTFs omitted";

    const handleSelectCtf =
        useCallback(
            (
                ctfId: Id,
                scrollToRow = false,
            ) => {
                setSelectedCtfId(ctfId);

                if (
                    !scrollToRow ||
                    typeof requestAnimationFrame !==
                    "function"
                ) {
                    return;
                }

                requestAnimationFrame(() => {
                    rowRefs.current[
                        String(ctfId)
                    ]?.scrollIntoView?.({
                        block: "nearest",
                    });
                });
            },
            [],
        );


    const handlePlotClick = (
        event: any,
    ) => {
        const mouseButton =
            event?.event?.button;

        if (
            mouseButton != null &&
            mouseButton !== 0
        ) {
            return;
        }

        const ctfId =
            event?.points?.[0]
                ?.customdata?.[0];

        if (ctfId == null) {
            return;
        }

        handleSelectCtf(
            String(ctfId),
            true,
        );
    };


    const columnWidths = {
        micrograph: { width: "21%" },
        defocusU: { width: "11%" },
        defocusV: { width: "11%" },
        astigmatism: { width: "12%" },
        angle: { width: "10%" },
        resolution: { width: "10%" },
        fitQuality: { width: "9%" },
        phaseShift: { width: "9%" },
        status: { width: "7%" },
    } as const;


    if (mainMode === "metadata") {
        return (
            <Box
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    width: "100%",
                    height: "100%",
                    minWidth: 0,
                    minHeight: 0,
                    overflow: "hidden",
                    bgcolor: "background.paper",
                }}
            >
                <Paper
                    square
                    elevation={0}
                    sx={{
                        p: 0.75,
                        flexShrink: 0,
                        borderBottom:
                            "1px solid #e5e7eb",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 1,
                    }}
                >
                    <Tooltip title="Show CTF viewer">
                        <span>
                            <Button
                                size="small"
                                variant="outlined"
                                startIcon={
                                    <ArrowBack fontSize="small" />
                                }
                                disabled={!canOpenMetadata}
                                onClick={() =>
                                    setMainMode("viewer")
                                }
                                sx={{
                                    textTransform: "none",
                                }}
                            >
                                CTF viewer
                            </Button>
                        </span>
                    </Tooltip>

                    <Typography
                        variant="caption"
                        color="text.secondary"
                        noWrap
                        sx={{
                            fontSize: "0.7rem",
                        }}
                    >
                        {outputName}
                    </Typography>
                </Paper>

                <Box
                    sx={{
                        flex: 1,
                        minHeight: 0,
                        overflow: "hidden",
                    }}
                >
                    <MetadataViewer
                        projectId={projectIdNum}
                        protocolId={protocolIdNum}
                        outputName={outputName}
                        embedded
                        onClose={() =>
                            setMainMode("viewer")
                        }
                    />
                </Box>
            </Box>
        );
    }


    return (
        <Box
            sx={{
                display: "flex",
                width: "100%",
                height: "100%",
                minWidth: 0,
                minHeight: 0,
                overflow: "hidden",
            }}
        >
            {/* CTF table */}
            <Box
                sx={{
                    flex: 1.45,
                    minWidth: 0,
                    minHeight: 0,
                    display: "flex",
                    flexDirection: "column",
                    borderRight:
                        "1px solid #e5e7eb",
                }}
            >
                <Paper
                    square
                    elevation={0}
                    sx={{
                        p: 0.75,
                        flexShrink: 0,
                        borderBottom:
                            "1px solid #e5e7eb",
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                    }}
                >
                    <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                            fontSize: "0.75rem",
                            whiteSpace: "nowrap",
                        }}
                    >
                        Filter
                    </Typography>

                    <TextField
                        size="small"
                        value={filterText}
                        onChange={(event) =>
                            setFilterText(
                                event.target.value,
                            )
                        }
                        placeholder="Filter micrograph or CTF values"
                        sx={{
                            maxWidth: 280,
                            "& .MuiInputBase-input": {
                                py: 0.5,
                                fontSize: "0.75rem",
                            },
                            "& input::placeholder": {
                                fontSize: "0.7rem",
                            },
                        }}
                    />

                    <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                            ml: "auto",
                            fontSize: "0.72rem",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {rows.length} CTFs
                        {failedCount
                            ? ` · ${failedCount} failed`
                            : ""}
                    </Typography>

                    {!hideMetadataAction ? (
                        <Tooltip title="Show metadata viewer">
                            <span>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={
                                        <MetadataIcon fontSize="small" />
                                    }
                                    disabled={!canOpenMetadata}
                                    onClick={() =>
                                        setMainMode("metadata")
                                    }
                                    sx={{
                                        textTransform: "none",
                                    }}
                                >
                                    Metadata
                                </Button>
                            </span>
                        </Tooltip>
                    ) : null}
                </Paper>

                <Box
                    sx={{
                        flex: 1,
                        minHeight: 0,
                        overflowY: "auto",
                        overflowX: "hidden",
                    }}
                >
                    {rowsLoading ? (
                        <Box
                            sx={{
                                p: 2,
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                            }}
                        >
                            <CircularProgress size={18} />

                            <Typography
                                variant="body2"
                                color="text.secondary"
                            >
                                Loading CTFs…
                            </Typography>
                        </Box>
                    ) : rowsError ? (
                        <Box sx={{ p: 2 }}>
                            <Typography
                                variant="body2"
                                color="error"
                            >
                                {rowsError}
                            </Typography>
                        </Box>
                    ) : !rows.length ? (
                        <Box sx={{ p: 2 }}>
                            <Typography
                                variant="body2"
                                color="text.secondary"
                            >
                                No CTFs available for this output.
                            </Typography>
                        </Box>
                    ) : (
                        <Table
                            size="small"
                            stickyHeader
                            sx={{
                                tableLayout: "fixed",
                                width: "100%",
                                "& th": {
                                    whiteSpace: "normal",
                                    lineHeight: 1.15,
                                    fontSize: "0.72rem",
                                    fontWeight: 600,
                                    py: 0.6,
                                },
                                "& td": {
                                    fontSize: "0.75rem",
                                    py: 0.35,
                                },
                            }}
                        >
                            <TableHead>
                                <TableRow>
                                    <TableCell
                                        sx={columnWidths.micrograph}
                                    >
                                        Micrograph
                                    </TableCell>

                                    <TableCell
                                        sx={columnWidths.defocusU}
                                    >
                                        DefocusU (Å)
                                    </TableCell>

                                    <TableCell
                                        sx={columnWidths.defocusV}
                                    >
                                        DefocusV (Å)
                                    </TableCell>

                                    <TableCell
                                        sx={columnWidths.astigmatism}
                                    >
                                        Astigmatism (Å)
                                    </TableCell>

                                    <TableCell
                                        sx={columnWidths.angle}
                                    >
                                        Angle (°)
                                    </TableCell>

                                    <TableCell
                                        sx={columnWidths.resolution}
                                    >
                                        Resolution (Å)
                                    </TableCell>

                                    <TableCell
                                        sx={columnWidths.fitQuality}
                                    >
                                        Fit quality
                                    </TableCell>

                                    <TableCell
                                        sx={columnWidths.phaseShift}
                                    >
                                        Phase shift
                                    </TableCell>

                                    <TableCell
                                        sx={columnWidths.status}
                                    >
                                        Status
                                    </TableCell>
                                </TableRow>
                            </TableHead>

                            <TableBody>
                                {filteredRows.map(
                                    (row) => {
                                        const selected =
                                            selectedCtfId != null &&
                                            String(
                                                selectedCtfId,
                                            ) ===
                                            String(
                                                row.ctfId,
                                            );

                                        return (
                                            <TableRow
                                                key={String(
                                                    row.ctfId,
                                                )}
                                                ref={(element) => {
                                                    rowRefs.current[
                                                        String(row.ctfId)
                                                    ] = element;
                                                }}
                                                hover
                                                selected={selected}
                                                onClick={() =>
                                                    handleSelectCtf(
                                                        row.ctfId,
                                                    )
                                                }
                                                sx={{
                                                    cursor: "pointer",

                                                    ...(row.failed && {
                                                        backgroundColor:
                                                            "rgba(248,113,113,0.16)",

                                                        "&:hover": {
                                                            backgroundColor:
                                                                "rgba(248,113,113,0.24)",
                                                        },

                                                        "&.Mui-selected": {
                                                            backgroundColor:
                                                                "rgba(248,113,113,0.30)",
                                                        },

                                                        "&.Mui-selected:hover":
                                                        {
                                                            backgroundColor:
                                                                "rgba(248,113,113,0.36)",
                                                        },
                                                    }),

                                                    ...(
                                                        !row.failed &&
                                                        row.excluded && {
                                                            opacity: 0.62,
                                                        }
                                                    ),
                                                }}
                                            >
                                                <TableCell
                                                    sx={
                                                        columnWidths.micrograph
                                                    }
                                                >
                                                    <Typography
                                                        variant="body2"
                                                        noWrap
                                                        title={
                                                            row.micrographName
                                                        }
                                                        sx={{
                                                            fontSize:
                                                                "0.75rem",
                                                            fontWeight:
                                                                selected
                                                                    ? 600
                                                                    : 400,
                                                        }}
                                                    >
                                                        {
                                                            row.micrographName
                                                        }
                                                    </Typography>
                                                </TableCell>

                                                <TableCell
                                                    sx={
                                                        columnWidths.defocusU
                                                    }
                                                >
                                                    {row.failed
                                                        ? ""
                                                        : formatNumber(
                                                            row.defocusU,
                                                        )}
                                                </TableCell>

                                                <TableCell
                                                    sx={
                                                        columnWidths.defocusV
                                                    }
                                                >
                                                    {row.failed
                                                        ? ""
                                                        : formatNumber(
                                                            row.defocusV,
                                                        )}
                                                </TableCell>

                                                <TableCell
                                                    sx={
                                                        columnWidths.astigmatism
                                                    }
                                                >
                                                    {row.failed
                                                        ? ""
                                                        : formatNumber(
                                                            row.astigmatism,
                                                        )}
                                                </TableCell>

                                                <TableCell
                                                    sx={
                                                        columnWidths.angle
                                                    }
                                                >
                                                    {formatNumber(
                                                        row.defocusAngle,
                                                    )}
                                                </TableCell>

                                                <TableCell
                                                    sx={
                                                        columnWidths.resolution
                                                    }
                                                >
                                                    {formatNumber(
                                                        row.resolution,
                                                    )}
                                                </TableCell>

                                                <TableCell
                                                    sx={
                                                        columnWidths.fitQuality
                                                    }
                                                >
                                                    {formatNumber(
                                                        row.fitQuality,
                                                        3,
                                                    )}
                                                </TableCell>

                                                <TableCell
                                                    sx={
                                                        columnWidths.phaseShift
                                                    }
                                                >
                                                    {formatNumber(
                                                        row.phaseShift,
                                                        3,
                                                    )}
                                                </TableCell>

                                                <TableCell
                                                    sx={
                                                        columnWidths.status
                                                    }
                                                >
                                                    <Typography
                                                        variant="caption"
                                                        sx={{
                                                            fontSize:
                                                                "0.68rem",
                                                            fontWeight:
                                                                row.failed
                                                                    ? 700
                                                                    : 500,

                                                            color:
                                                                row.failed
                                                                    ? "error.main"
                                                                    : row.excluded
                                                                        ? "text.secondary"
                                                                        : "success.main",
                                                        }}
                                                    >
                                                        {getStatus(
                                                            row,
                                                        )}
                                                    </Typography>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    },
                                )}
                            </TableBody>
                        </Table>
                    )}
                </Box>
            </Box>

            {/* Plot + previews */}
            <Box
                sx={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                    p: 1,
                    bgcolor: "background.default",
                }}
            >
                <Paper
                    elevation={0}
                    sx={{
                        flex: 1.35,
                        minHeight: 0,
                        display: "flex",
                        flexDirection: "column",
                        border: "1px solid #e5e7eb",
                        borderRadius: 1.5,
                        overflow: "hidden",
                        bgcolor: "background.paper",
                    }}
                >
                    <Box
                        sx={{
                            px: 1,
                            py: 0.5,
                            borderBottom:
                                "1px solid #e5e7eb",
                            display: "flex",
                            alignItems: "center",
                            justifyContent:
                                "space-between",
                            gap: 1,
                        }}
                    >
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 0.75,
                                minWidth: 0,
                            }}
                        >
                            <Typography
                                variant="caption"
                                sx={{
                                    fontWeight: 700,
                                    fontSize: "0.72rem",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {plotModeTitle}
                            </Typography>

                            <Typography
                                variant="caption"
                                color="text.secondary"
                                noWrap
                                sx={{
                                    fontSize: "0.68rem",
                                }}
                            >
                                {plotModeDescription}
                            </Typography>
                        </Box>

                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 0.5,
                            }}
                        >
                            {([
                                ["trends", "Trends"],
                                ["quality", "Quality map"],
                                ["distribution", "Distributions"],
                            ] as Array<[CtfPlotMode, string]>).map(
                                ([mode, label]) => (
                                    <Button
                                        key={mode}
                                        size="small"
                                        variant={
                                            plotMode === mode
                                                ? "contained"
                                                : "outlined"
                                        }
                                        onClick={() => setPlotMode(mode)}
                                        sx={{
                                            minWidth: 0,
                                            px: 1,
                                            py: 0.25,
                                            fontSize: "0.68rem",
                                            lineHeight: 1.4,
                                            textTransform: "none",
                                            boxShadow: "none",
                                        }}
                                    >
                                        {label}
                                    </Button>
                                ),
                            )}
                        </Box>

                    </Box>

                    <Box
                        sx={{
                            px: 1.25,
                            py: 0.65,
                            display: "grid",
                            gridTemplateColumns:
                                "0.65fr 0.65fr 1.15fr 1.2fr 1.3fr",
                            gap: 1.25,
                            borderBottom: "1px solid #e5e7eb",
                            bgcolor: "#fafafa",
                            flexShrink: 0,
                        }}
                    >
                        <Box sx={{ minWidth: 0 }}>
                            <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: "block", fontSize: "0.64rem" }}
                            >
                                CTFs
                            </Typography>
                            <Typography
                                variant="caption"
                                sx={{ fontWeight: 700, fontSize: "0.72rem" }}
                            >
                                {statistics.total}
                            </Typography>
                        </Box>

                        <Box sx={{ minWidth: 0 }}>
                            <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: "block", fontSize: "0.64rem" }}
                            >
                                Failed
                            </Typography>
                            <Typography
                                variant="caption"
                                sx={{
                                    fontWeight: 700,
                                    fontSize: "0.72rem",
                                    color:
                                        statistics.failed > 0
                                            ? "error.main"
                                            : "text.primary",
                                }}
                            >
                                {statistics.failed}
                            </Typography>
                        </Box>

                        <Box sx={{ minWidth: 0 }}>
                            <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: "block", fontSize: "0.64rem" }}
                            >
                                Median defocus
                            </Typography>
                            <Typography
                                variant="caption"
                                noWrap
                                sx={{ fontWeight: 700, fontSize: "0.72rem" }}
                            >
                                {statistics.medianMeanDefocus != null
                                    ? `${(statistics.medianMeanDefocus / 10000).toFixed(3)} µm`
                                    : "-"}
                            </Typography>
                        </Box>

                        <Box sx={{ minWidth: 0 }}>
                            <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: "block", fontSize: "0.64rem" }}
                            >
                                Median resolution
                            </Typography>
                            <Typography
                                variant="caption"
                                noWrap
                                sx={{ fontWeight: 700, fontSize: "0.72rem" }}
                            >
                                {statistics.medianResolution != null
                                    ? `${statistics.medianResolution.toFixed(2)} Å`
                                    : "-"}
                            </Typography>
                        </Box>

                        <Box sx={{ minWidth: 0 }}>
                            <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: "block", fontSize: "0.64rem" }}
                            >
                                Median astigmatism
                            </Typography>
                            <Typography
                                variant="caption"
                                noWrap
                                sx={{ fontWeight: 700, fontSize: "0.72rem" }}
                            >
                                {statistics.medianAstigmatism != null
                                    ? `${statistics.medianAstigmatism.toFixed(2)} Å`
                                    : "-"}
                            </Typography>
                        </Box>
                    </Box>

                    {plotMode === "distribution" ? (
                        <Box
                            sx={{
                                px: 1.25,
                                py: 0.55,
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                                borderBottom: "1px solid #e5e7eb",
                                bgcolor: "background.paper",
                                flexShrink: 0,
                            }}
                        >
                            <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{
                                    fontSize: "0.68rem",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                Distribution
                            </Typography>

                            <TextField
                                select
                                size="small"
                                value={distributionMetric}
                                onChange={(event) =>
                                    setDistributionMetric(
                                        event.target.value as CtfDistributionMetric,
                                    )
                                }
                                sx={{
                                    width: 190,
                                    "& .MuiInputBase-input": {
                                        py: 0.45,
                                        fontSize: "0.7rem",
                                    },
                                }}
                            >
                                {distributionMetrics.map((metric) => (
                                    <MenuItem
                                        key={metric.value}
                                        value={metric.value}
                                        sx={{ fontSize: "0.75rem" }}
                                    >
                                        {metric.label}
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Box>
                    ) : null}

                    <Box
                        sx={{
                            flex: 1,
                            minHeight: 0,
                            p: 0.5,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >


                        {!activePlotData.length ? (
                            <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{
                                    fontSize: "0.8rem",
                                }}
                            >
                                No CTF trend data available.
                            </Typography>
                        ) : (
                            <Plot
                                data={activePlotData as any}
                                layout={activePlotLayout as any}
                                config={plotConfig as any}
                                style={{
                                    width: "100%",
                                    height: "100%",
                                }}
                                useResizeHandler
                                onClick={
                                    plotMode === "distribution"
                                        ? undefined
                                        : handlePlotClick as any
                                }
                            />
                        )}
                    </Box>
                </Paper>

                <Box
                    sx={{
                        flex: 0.82,
                        minHeight: 0,
                        display: "grid",
                        gridTemplateColumns:
                            "minmax(0, 1fr) minmax(0, 1fr)",
                        gap: 1,
                    }}
                >
                    <PreviewPanel
                        title="Micrograph"
                        subtitle={
                            selectedRow?.micrographName
                        }
                        loading={micrographLoading}
                        error={micrographError}
                        imageUrl={micrographImageUrl}
                        alt="Selected CTF micrograph"
                        emptyText={
                            selectedRow
                                ? "Micrograph preview is not available."
                                : "Select a CTF to preview its micrograph."
                        }
                    />

                    <PreviewPanel
                        title="PSD"
                        subtitle={
                            selectedRow?.micrographName
                        }
                        loading={psdLoading}
                        error={psdError}
                        imageUrl={psdImageUrl}
                        alt="Selected CTF PSD"
                        emptyText={
                            !selectedRow
                                ? "Select a CTF to preview its PSD."
                                : !selectedRow.psdFile
                                    ? "No PSD is available for this CTF."
                                    : "PSD preview is not available."
                        }
                    />
                </Box>
            </Box>
        </Box>
    );
}