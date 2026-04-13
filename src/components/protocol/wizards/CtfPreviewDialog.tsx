import * as React from "react";
import {
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    List,
    ListItemButton,
    ListItemText,
    Slider,
    TextField,
    Typography,
} from "@mui/material";
import { CloseIcon } from "@/icons";

import type { MaskRadiusDialogItem } from "./protocol_wizard_types";

type CtfPreviewDialogProps = {
    open: boolean;
    title: string;
    message: string;

    items: MaskRadiusDialogItem[];
    selectedIndex: number;
    onSelectedIndexChange: (value: number) => void;

    micrographPreviewUrl: string | null;
    psdPreviewUrl: string | null;
    previewLoading: boolean;

    downsample: number;
    downsampleMin: number;
    downsampleMax: number;
    downsampleStep: number;
    autoDownsampling: boolean;
    autoDownsampleValue: number | null;

    lowFreq: number;
    lowFreqMin: number;
    lowFreqMax: number;

    highFreq: number;
    highFreqMin: number;
    highFreqMax: number;

    freqStep: number;
    samplingRate: number | null;
    showInAngstroms: boolean;

    downsampleParamName: string;
    lowFreqParamName: string;
    highFreqParamName: string;

    onClose: () => void;
    onConfirm: () => void;

    onDownsampleChange: (value: number) => void;
    onDownsampleCommit?: (value: number) => void;

    onLowFreqChange: (value: number) => void;
    onLowFreqCommit?: (value: number) => void;

    onHighFreqChange: (value: number) => void;
    onHighFreqCommit?: (value: number) => void;
};

const wizardDialogPaperSx = {
    borderRadius: "22px",
    overflow: "hidden",
    border: "1px solid rgba(51, 61, 73, 0.14)",
    boxShadow: "0 24px 70px rgba(15, 23, 42, 0.24)",
    backgroundImage: "none",
};

const wizardDialogTitleSx = {
    m: 0,
    px: 2.5,
    py: 2,
    background: "linear-gradient(135deg, #333d49 0%, #3d4957 55%, #465567 100%)",
    color: "#ffffff",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const wizardDialogContentSx = {
    px: 2.5,
    py: 2.5,
    background: "linear-gradient(180deg, #f8fafc 0%, #f4f7fb 100%)",
    borderColor: "rgba(15,23,42,0.08)",
};

const wizardDialogActionsSx = {
    px: 2.5,
    py: 2,
    backgroundColor: "#ffffff",
    borderTop: "1px solid rgba(15,23,42,0.08)",
    justifyContent: "flex-end",
    gap: 1.25,
};

function hasText(value: string | null | undefined): boolean {
    return Boolean(String(value ?? "").trim());
}

function formatFrequencyValue(
    value: number,
    samplingRate: number | null,
    showInAngstroms: boolean,
): { digitalText: string; angstromText: string } {
    const safeValue = Number.isFinite(value) ? value : 0;
    const digitalText = `${safeValue.toFixed(2)} rad/Å`;

    if (!showInAngstroms || !samplingRate || samplingRate <= 0 || safeValue <= 0) {
        return {
            digitalText,
            angstromText: "—",
        };
    }

    return {
        digitalText,
        angstromText: `${safeValue.toFixed(1)} Å`,
    };
}

export default function CtfPreviewDialog({
    open,
    title,
    message,
    items,
    selectedIndex,
    onSelectedIndexChange,
    micrographPreviewUrl,
    psdPreviewUrl,
    previewLoading,
    downsample,
    downsampleMin,
    downsampleMax,
    downsampleStep,
    autoDownsampling,
    autoDownsampleValue,
    lowFreq,
    lowFreqMin,
    lowFreqMax,
    highFreq,
    highFreqMin,
    highFreqMax,
    freqStep,
    samplingRate,
    showInAngstroms,
    downsampleParamName,
    lowFreqParamName,
    highFreqParamName,
    onClose,
    onConfirm,
    onDownsampleChange,
    onDownsampleCommit,
    onLowFreqChange,
    onLowFreqCommit,
    onHighFreqChange,
    onHighFreqCommit,
}: CtfPreviewDialogProps) {
    const [localDownsample, setLocalDownsample] = React.useState(downsample);
    const [localDownsampleText, setLocalDownsampleText] = React.useState(String(downsample));
    const [localLowFreq, setLocalLowFreq] = React.useState(lowFreq);
    const [localHighFreq, setLocalHighFreq] = React.useState(highFreq);

    const [micrographLoaded, setMicrographLoaded] = React.useState(false);
    const [psdLoaded, setPsdLoaded] = React.useState(false);
    const psdImageRef = React.useRef<HTMLImageElement | null>(null);
    const [psdRenderSize, setPsdRenderSize] = React.useState({ width: 0, height: 0 });

    React.useEffect(() => {
        setLocalDownsample(downsample);
        setLocalDownsampleText(String(downsample));
    }, [downsample]);

    React.useEffect(() => {
        setLocalLowFreq(lowFreq);
    }, [lowFreq]);

    React.useEffect(() => {
        setLocalHighFreq(highFreq);
    }, [highFreq]);

    React.useEffect(() => {
        if (!micrographPreviewUrl) {
            setMicrographLoaded(false);
            return;
        }
        setMicrographLoaded(false);
    }, [micrographPreviewUrl]);

    React.useEffect(() => {
        if (!psdPreviewUrl) {
            setPsdLoaded(false);
            return;
        }
        setPsdLoaded(false);
    }, [psdPreviewUrl]);

    const updatePsdRenderSize = React.useCallback(() => {
        const node = psdImageRef.current;
        if (!node) return;

        const rect = node.getBoundingClientRect();
        setPsdRenderSize({
            width: rect.width,
            height: rect.height,
        });
    }, []);

    React.useLayoutEffect(() => {
        updatePsdRenderSize();

        const node = psdImageRef.current;
        if (!node || typeof ResizeObserver === "undefined") return;

        const observer = new ResizeObserver(() => updatePsdRenderSize());
        observer.observe(node);

        return () => observer.disconnect();
    }, [psdPreviewUrl, updatePsdRenderSize]);


    const commitDownsample = React.useCallback(
        (value: number) => {
            const nextValue = Math.max(downsampleMin, Math.min(value, downsampleMax));
            setLocalDownsample(nextValue);
            setLocalDownsampleText(String(nextValue));
            onDownsampleChange(nextValue);

            if (Math.abs(nextValue - downsample) > 1e-9) {
                onDownsampleCommit?.(nextValue);
            }
        },
        [
            downsample,
            downsampleMin,
            downsampleMax,
            onDownsampleChange,
            onDownsampleCommit,
        ],
    );

    const commitLowFreq = React.useCallback(
        (value: number) => {
            const nextValue = Math.max(lowFreqMin, Math.min(value, lowFreqMax));
            setLocalLowFreq(nextValue);
            onLowFreqChange(nextValue);
            onLowFreqCommit?.(nextValue);
        },
        [lowFreqMin, lowFreqMax, onLowFreqChange, onLowFreqCommit],
    );

    const commitHighFreq = React.useCallback(
        (value: number) => {
            const nextValue = Math.max(highFreqMin, Math.min(value, highFreqMax));
            setLocalHighFreq(nextValue);
            onHighFreqChange(nextValue);
            onHighFreqCommit?.(nextValue);
        },
        [highFreqMin, highFreqMax, onHighFreqChange, onHighFreqCommit],
    );

    const lowFreqLabel = formatFrequencyValue(localLowFreq, samplingRate, showInAngstroms);
    const highFreqLabel = formatFrequencyValue(localHighFreq, samplingRate, showInAngstroms);

    const psdMinSize = Math.min(psdRenderSize.width, psdRenderSize.height);
    const psdHalfSize = psdMinSize / 2;

    const frequencyAxisMax = Math.max(
        lowFreqMax,
        highFreqMax,
        localLowFreq,
        localHighFreq,
        0.5,
    );

    const lowRingRadius = Math.max(
        0,
        Math.min((localLowFreq / frequencyAxisMax) * psdHalfSize, psdHalfSize),
    );

    const highRingRadius = Math.max(
        0,
        Math.min((localHighFreq / frequencyAxisMax) * psdHalfSize, psdHalfSize),
    );

    const showLoadingOverlay = previewLoading;
    const loadingLabel = "Updating preview...";

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="lg"
            fullWidth
            PaperProps={{
                sx: {
                    ...wizardDialogPaperSx,
                    maxHeight: "90vh",
                },
            }}
        >
            <DialogTitle sx={wizardDialogTitleSx}>
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 2,
                    }}
                >
                    <Typography
                        component="span"
                        sx={{
                            fontSize: "1rem",
                            fontWeight: 700,
                            color: "inherit",
                        }}
                    >
                        {title || "Wizard"}
                    </Typography>

                    <IconButton
                        onClick={onClose}
                        size="small"
                        sx={{
                            color: "#e5e7eb",
                            border: "1px solid rgba(255,255,255,0.14)",
                            backgroundColor: "rgba(255,255,255,0.06)",
                            "&:hover": {
                                backgroundColor: "rgba(255,255,255,0.12)",
                                borderColor: "rgba(255,255,255,0.22)",
                            },
                        }}
                    >
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Box>
            </DialogTitle>

            <DialogContent
                dividers
                sx={{
                    ...wizardDialogContentSx,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                }}
            >
                {hasText(message) && (
                    <Typography
                        variant="body2"
                        sx={{
                            color: "text.secondary",
                            lineHeight: 1.6,
                        }}
                    >
                        {message}
                    </Typography>
                )}

                <Box
                    sx={{
                        position: "relative",
                        display: "grid",
                        gridTemplateColumns: {
                            xs: "1fr",
                            md: "170px minmax(0, 1fr)",
                        },
                        gap: 2,
                        minHeight: 0,
                    }}
                >
                    {showLoadingOverlay && (
                        <Box
                            sx={{
                                position: "absolute",
                                inset: 0,
                                zIndex: 5,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                borderRadius: "18px",
                                backgroundColor: "rgba(248, 250, 252, 0.72)",
                                backdropFilter: "blur(2px)",
                            }}
                        >
                            <Box
                                sx={{
                                    px: 2.5,
                                    py: 1.75,
                                    borderRadius: "16px",
                                    backgroundColor: "rgba(255,255,255,0.94)",
                                    border: "1px solid rgba(15,23,42,0.08)",
                                    boxShadow: "0 10px 30px rgba(15,23,42,0.10)",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1.25,
                                }}
                            >
                                <CircularProgress size={20} />
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                    {loadingLabel}
                                </Typography>
                            </Box>
                        </Box>
                    )}

                    <Box
                        sx={{
                            borderRadius: "16px",
                            border: "1px solid rgba(15,23,42,0.10)",
                            backgroundColor: "#ffffff",
                            overflow: "hidden",
                            minHeight: 0,
                        }}
                    >
                        <Box
                            sx={{
                                px: 1.5,
                                py: 1,
                                borderBottom: "1px solid rgba(15,23,42,0.08)",
                                backgroundColor: "rgba(248,250,252,0.9)",
                            }}
                        >
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                Object
                            </Typography>
                        </Box>

                        <List
                            dense
                            sx={{
                                maxHeight: 420,
                                overflowY: "auto",
                                py: 0.5,
                            }}
                        >
                            {items.map((item) => (
                                <ListItemButton
                                    key={item.id}
                                    selected={item.index === selectedIndex}
                                    onClick={() => {
                                        if (item.index === selectedIndex) return;
                                        onSelectedIndexChange(item.index);
                                    }}
                                    sx={{
                                        mx: 0.75,
                                        my: 0.25,
                                        borderRadius: "10px",
                                        "&.Mui-selected": {
                                            backgroundColor: "rgba(51, 61, 73, 0.10)",
                                        },
                                        "&.Mui-selected:hover": {
                                            backgroundColor: "rgba(51, 61, 73, 0.16)",
                                        },
                                    }}
                                >
                                    <ListItemText
                                        primary={item.label}
                                        primaryTypographyProps={{
                                            fontSize: "0.82rem",
                                            fontWeight: item.index === selectedIndex ? 700 : 500,
                                        }}
                                    />
                                </ListItemButton>
                            ))}
                        </List>
                    </Box>

                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 1.5,
                            minWidth: 0,
                        }}
                    >
                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: {
                                    xs: "1fr",
                                    md: "1fr 1fr",
                                },
                                gap: 2,
                                alignItems: "stretch",
                            }}
                        >
                            <Box
                                sx={{
                                    borderRadius: "16px",
                                    border: "1px solid rgba(15,23,42,0.10)",
                                    backgroundColor: "#d7d7d7",
                                    overflow: "hidden",
                                    p: 1,
                                    minHeight: 320,
                                    display: "flex",
                                    flexDirection: "column",
                                    justifyContent: "center",
                                }}
                            >
                                {micrographPreviewUrl ? (
                                    <Box
                                        component="img"
                                        src={micrographPreviewUrl}
                                        alt="Micrograph preview"
                                        onLoad={() => setMicrographLoaded(true)}
                                        sx={{
                                            display: "block",
                                            width: "100%",
                                            maxHeight: 320,
                                            objectFit: "contain",
                                            userSelect: "none",
                                        }}
                                    />
                                ) : (
                                    <Typography variant="body2" sx={{ color: "text.secondary", textAlign: "center" }}>
                                        Micrograph preview not available.
                                    </Typography>
                                )}

                                <Typography
                                    variant="body2"
                                    sx={{
                                        textAlign: "center",
                                        mt: 1,
                                        fontWeight: 600,
                                    }}
                                >
                                    Micrograph
                                </Typography>
                            </Box>

                            <Box
                                sx={{
                                    borderRadius: "16px",
                                    border: "1px solid rgba(15,23,42,0.10)",
                                    backgroundColor: "#d7d7d7",
                                    overflow: "hidden",
                                    p: 1,
                                    minHeight: 320,
                                    display: "flex",
                                    flexDirection: "column",
                                    justifyContent: "center",
                                }}
                            >
                                {psdPreviewUrl ? (
                                    <Box
                                        sx={{
                                            position: "relative",
                                            display: "inline-block",
                                            lineHeight: 0,
                                            width: "100%",
                                        }}
                                    >
                                        <Box
                                            component="img"
                                            ref={psdImageRef}
                                            src={psdPreviewUrl}
                                            alt="PSD preview"
                                            onLoad={() => {
                                                setPsdLoaded(true);
                                                updatePsdRenderSize();
                                            }}
                                            sx={{
                                                display: "block",
                                                width: "100%",
                                                maxHeight: 320,
                                                objectFit: "contain",
                                                userSelect: "none",
                                            }}
                                        />

                                        {psdRenderSize.width > 0 && psdRenderSize.height > 0 && (
                                            <Box
                                                component="svg"
                                                viewBox={`0 0 ${psdRenderSize.width} ${psdRenderSize.height}`}
                                                sx={{
                                                    position: "absolute",
                                                    inset: 0,
                                                    width: "100%",
                                                    height: "100%",
                                                    pointerEvents: "none",
                                                    overflow: "visible",
                                                }}
                                            >
                                                <circle
                                                    cx={psdRenderSize.width / 2}
                                                    cy={psdRenderSize.height / 2}
                                                    r={lowRingRadius}
                                                    fill="none"
                                                    stroke="rgba(255,255,255,0.42)"
                                                    strokeWidth="6"
                                                />
                                                <circle
                                                    cx={psdRenderSize.width / 2}
                                                    cy={psdRenderSize.height / 2}
                                                    r={lowRingRadius}
                                                    fill="none"
                                                    stroke="rgb(0, 255, 255)"
                                                    strokeWidth="2.8"
                                                />

                                                <circle
                                                    cx={psdRenderSize.width / 2}
                                                    cy={psdRenderSize.height / 2}
                                                    r={highRingRadius}
                                                    fill="none"
                                                    stroke="rgba(255,255,255,0.42)"
                                                    strokeWidth="6"
                                                />
                                                <circle
                                                    cx={psdRenderSize.width / 2}
                                                    cy={psdRenderSize.height / 2}
                                                    r={highRingRadius}
                                                    fill="none"
                                                    stroke="rgb(0, 255, 255)"
                                                    strokeWidth="2.8"
                                                />
                                            </Box>
                                        )}
                                    </Box>
                                ) : (
                                    <Typography variant="body2" sx={{ color: "text.secondary", textAlign: "center" }}>
                                        PSD preview not available.
                                    </Typography>
                                )}

                                <Typography
                                    variant="body2"
                                    sx={{
                                        textAlign: "center",
                                        mt: 1,
                                        fontWeight: 600,
                                    }}
                                >
                                    PSD
                                </Typography>
                            </Box>
                        </Box>

                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: {
                                    xs: "1fr",
                                    md: "160px minmax(0, 1fr)",
                                },
                                gap: 2,
                                alignItems: "start",
                            }}
                        >
                            <Box>
                                <Typography
                                    variant="body2"
                                    sx={{
                                        mb: 0.8,
                                        fontWeight: 600,
                                    }}
                                >
                                    {downsampleParamName || "Downsample"}
                                </Typography>

                                <TextField
                                    size="small"
                                    fullWidth
                                    value={localDownsampleText}
                                    onChange={(e) => {
                                        setLocalDownsampleText(e.target.value);
                                    }}
                                    onBlur={() => {
                                        const parsed = Number(localDownsampleText);
                                        if (Number.isFinite(parsed)) {
                                            commitDownsample(parsed);
                                        } else {
                                            setLocalDownsampleText(String(localDownsample));
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            const parsed = Number(localDownsampleText);
                                            if (Number.isFinite(parsed)) {
                                                commitDownsample(parsed);
                                            } else {
                                                setLocalDownsampleText(String(localDownsample));
                                            }
                                        }
                                    }}
                                />
                            </Box>

                            <Box
                                sx={{
                                    borderRadius: "16px",
                                    border: "1px solid rgba(15,23,42,0.10)",
                                    backgroundColor: "#ffffff",
                                    px: 2,
                                    py: 1.5,
                                }}
                            >
                                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                                    Frequencies
                                </Typography>

                                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                    <Box
                                        sx={{
                                            display: "grid",
                                            gridTemplateColumns: {
                                                xs: "1fr",
                                                md: "90px minmax(0, 1fr) 180px",
                                            },
                                            gap: 1.5,
                                            alignItems: "center",
                                        }}
                                    >
                                        <Typography variant="body2">
                                            {lowFreqParamName || "Low freq"}
                                        </Typography>

                                        <Slider
                                            min={lowFreqMin}
                                            max={lowFreqMax}
                                            step={freqStep}
                                            value={localLowFreq}
                                            onChange={(_, value) => setLocalLowFreq(Number(value))}
                                            onChangeCommitted={(_, value) => commitLowFreq(Number(value))}
                                            valueLabelDisplay="auto"
                                        />

                                        <Typography variant="body2" sx={{ textAlign: { xs: "left", md: "right" } }}>
                                            {lowFreqLabel.digitalText} | {lowFreqLabel.angstromText}
                                        </Typography>
                                    </Box>

                                    <Box
                                        sx={{
                                            display: "grid",
                                            gridTemplateColumns: {
                                                xs: "1fr",
                                                md: "90px minmax(0, 1fr) 180px",
                                            },
                                            gap: 1.5,
                                            alignItems: "center",
                                        }}
                                    >
                                        <Typography variant="body2">
                                            {highFreqParamName || "High freq"}
                                        </Typography>

                                        <Slider
                                            min={highFreqMin}
                                            max={highFreqMax}
                                            step={freqStep}
                                            value={localHighFreq}
                                            onChange={(_, value) => setLocalHighFreq(Number(value))}
                                            onChangeCommitted={(_, value) => commitHighFreq(Number(value))}
                                            valueLabelDisplay="auto"
                                        />

                                        <Typography variant="body2" sx={{ textAlign: { xs: "left", md: "right" } }}>
                                            {highFreqLabel.digitalText} | {highFreqLabel.angstromText}
                                        </Typography>
                                    </Box>

                                    <Box
                                        sx={{
                                            display: "grid",
                                            gridTemplateColumns: {
                                                xs: "1fr",
                                                md: "90px minmax(0, 1fr) 180px",
                                            },
                                            gap: 1.5,
                                            alignItems: "center",
                                        }}
                                    >
                                        <Typography variant="body2">
                                            Auto down
                                        </Typography>

                                        <Slider
                                            min={downsampleMin}
                                            max={downsampleMax}
                                            step={downsampleStep}
                                            value={localDownsample}
                                            onChange={(_, value) => {
                                                const nextValue = Number(value);
                                                setLocalDownsample(nextValue);
                                                setLocalDownsampleText(String(nextValue));
                                            }}
                                            onChangeCommitted={(_, value) => commitDownsample(Number(value))}
                                            valueLabelDisplay="auto"
                                        />

                                        <Typography variant="body2" sx={{ textAlign: { xs: "left", md: "right" } }}>
                                            {autoDownsampling && autoDownsampleValue != null
                                                ? `${autoDownsampleValue.toFixed(3)}`
                                                : "manual"}
                                        </Typography>
                                    </Box>

                                    {samplingRate != null && (
                                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                                            Sampling rate: {samplingRate} Å/pix
                                        </Typography>
                                    )}
                                </Box>
                            </Box>
                        </Box>
                    </Box>
                </Box>
            </DialogContent>

            <DialogActions sx={wizardDialogActionsSx}>
                <Button
                    onClick={onClose}
                    variant="outlined"
                    sx={{
                        textTransform: "none",
                        borderRadius: "12px",
                        px: 2,
                        fontWeight: 600,
                    }}
                >
                    Cancel
                </Button>

                <Button
                    variant="contained"
                    onClick={onConfirm}
                    sx={{
                        textTransform: "none",
                        borderRadius: "12px",
                        px: 2.25,
                        fontWeight: 700,
                    }}
                >
                    Select
                </Button>
            </DialogActions>
        </Dialog>
    );
}