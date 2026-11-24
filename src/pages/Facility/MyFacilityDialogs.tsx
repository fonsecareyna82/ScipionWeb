// What a user may open in My sessions, to look at only: one of their samples with its boxes and grids, and one DATA
// of a session with what its movies say.
import { Box, Stack, Typography } from "@mui/material";
import {
    Activity, AlertTriangle, Aperture, Camera, Clock, Film, FlaskConical, Gauge, Hash, Images, Layers, Microscope, Package,
    Ruler, Sun, Timer, UserRound, UsersRound, Zap,
} from "lucide-react";

import { useIsDark } from "@/context/ThemeContext";
import { sectionTint } from "@/pages/Settings/SettingsSection";
import type { MyFacility, SessionDataset, UserSession } from "@/api/facility";
import { DialogPart, FactGrid, ViewDialog } from "./DialogParts";
import { FACILITY_TEXT } from "./facilityStyles";
import ImageStrip from "./ImageStrip";
import NavigationReport from "./NavigationReport";
import { GRID_STATUS_COLORS, GRID_STATUS_LABELS, StatusLegend } from "./SamplesPanel";
import { DatasetProjectLinks, WATCH_COLORS, WATCH_LABELS, formatBytes } from "./SessionsPanel";

type Colors = { border: string; text: string; muted: string; surface: string; hover: string };
export type MySample = MyFacility["samples"][number];
export type MyDataset = UserSession["datasets"][number];

function plural(count: number, one: string, many = `${one}s`): string {
    return `${count} ${count === 1 ? one : many}`;
}

function formatDay(value: string | null | undefined): string {
    if (!value) return "";
    const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatMoment(value: string | null | undefined): string {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value
        : date.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function round(value: number | null | undefined, digits: number): string {
    return value == null ? "" : String(Number(value.toFixed(digits)));
}

function Pill({ color, children }: { color: string; children: string }) {
    return (
        <Box component="span" sx={{ px: 1, borderRadius: 10, flexShrink: 0, lineHeight: 1.7, fontSize: FACILITY_TEXT.badge,
                                    fontWeight: 700, color, bgcolor: `${color}1f`, whiteSpace: "nowrap" }}>
            {children}
        </Box>
    );
}

/** One of the user's samples: its boxes, each grid in its place with its state, and their images. Read only. */
export function SampleView({ sample, colors, showOwner, onClose }: {
    sample: MySample;
    colors: Colors;
    showOwner: boolean;
    onClose: () => void;
}) {
    const tint = sectionTint(useIsDark());
    const grids = sample.boxes.flatMap((box) => box.grids);
    return (
        <ViewDialog icon={<FlaskConical size={20} color="white" />} title={sample.code}
                    subtitle={sample.description || undefined} onClose={onClose}>
            <DialogPart icon={<FlaskConical size={18} />} title="The sample" tint={tint} colors={colors}>
                <FactGrid colors={colors} columns={3} facts={[
                    [<UserRound size={15} />, "Owner", showOwner ? sample.ownerName || sample.ownerEmail : null],
                    [<UsersRound size={15} />, "Group", sample.groupName],
                    [<Package size={15} />, "Boxes", plural(sample.boxes.length, "box", "boxes")],
                    [<Layers size={15} />, "Grids", plural(grids.length, "grid")],
                    [<Clock size={15} />, "Registered", formatDay(sample.createdAt)],
                ]} />
                {(sample.images?.length ?? 0) > 0 && (
                    <Box>
                        <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, mb: 0.75 }}>Its images</Typography>
                        <ImageStrip images={sample.images ?? []} size={72} colors={colors} />
                    </Box>
                )}
            </DialogPart>

            <DialogPart icon={<Package size={18} />} title="Boxes and grids" tint={tint} colors={colors}
                        subtitle="Each grid in its place in the box, and what became of it."
                        action={<StatusLegend colors={colors} />}>
                {sample.boxes.length === 0 && (
                    <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>No boxes recorded yet.</Typography>
                )}
                {sample.boxes.map((box) => (
                    <Box key={box.id ?? box.label} role="group" aria-label={`Box ${box.label}`}
                         sx={{ border: `1px solid ${colors.border}`, borderRadius: 2, overflow: "hidden" }}>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} alignItems={{ sm: "center" }}
                               sx={{ bgcolor: colors.hover, px: 1.5, py: 1, borderBottom: `1px solid ${colors.border}` }}>
                            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
                                <Package size={16} style={{ color: colors.muted, flexShrink: 0 }} />
                                <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 800, color: colors.text }}>Box {box.label}</Typography>
                                <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>
                                    {[box.vitrificationCode, box.vitrifiedOn && `vitrified ${formatDay(box.vitrifiedOn)}`].filter(Boolean).join(" · ")}
                                </Typography>
                            </Stack>
                            {(box.images?.length ?? 0) > 0 && <ImageStrip images={box.images ?? []} size={40} colors={colors} />}
                        </Stack>
                        {box.grids.length === 0 && (
                            <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, px: 1.5, py: 1 }}>No grids in it.</Typography>
                        )}
                        {[...box.grids].sort((a, b) => a.position - b.position).map((grid, index) => (
                            <Stack key={grid.id ?? grid.position} direction={{ xs: "column", md: "row" }} spacing={1.25}
                                   alignItems={{ md: "center" }}
                                   sx={{ px: 1.5, py: 0.9, borderTop: index ? `1px solid ${colors.border}` : "none",
                                         borderLeft: `3px solid ${GRID_STATUS_COLORS[grid.status]}` }}>
                                <Box sx={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center",
                                           bgcolor: `${GRID_STATUS_COLORS[grid.status]}1f`, color: GRID_STATUS_COLORS[grid.status],
                                           fontWeight: 800, fontSize: FACILITY_TEXT.itemLine }}
                                     aria-label={`Place ${grid.position}`}>
                                    {grid.position}
                                </Box>
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                    <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                                        <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 700, color: colors.text }}>
                                            {grid.gridNumber != null ? `Grid #${grid.gridNumber}` : `Place ${grid.position}`}
                                        </Typography>
                                        <Pill color={GRID_STATUS_COLORS[grid.status]}>{GRID_STATUS_LABELS[grid.status]}</Pill>
                                    </Stack>
                                    <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>
                                        {[grid.gridType, grid.concentration && `${grid.concentration} mg/ml`, grid.specimen]
                                            .filter(Boolean).join(" · ") || "—"}
                                    </Typography>
                                </Box>
                                {(grid.images?.length ?? 0) > 0 && <ImageStrip images={grid.images ?? []} size={40} colors={colors} />}
                            </Stack>
                        ))}
                    </Box>
                ))}
            </DialogPart>
        </ViewDialog>
    );
}

/** One DATA of a session: its grid, how its acquisition goes, what its movies say, and its processing. Read only. */
export function DatasetView({ dataset, sessionName, colors, onClose }: {
    dataset: MyDataset | SessionDataset;
    sessionName: string;
    colors: Colors;
    onClose: () => void;
}) {
    const tint = sectionTint(useIsDark());
    const acquisition = dataset.acquisition;
    const grid = dataset.grid;
    const watch = dataset.watch && dataset.watch !== "idle" ? dataset.watch : null;
    const pixel = acquisition?.pixelSize ?? acquisition?.nominalPixelSize;
    const gainName = acquisition?.gainFile ? acquisition.gainFile.split("/").pop() : acquisition?.gain;
    return (
        <ViewDialog icon={<Film size={20} color="white" />} title={dataset.folder} subtitle={`A grid of ${sessionName}`} onClose={onClose}>
            <DialogPart icon={<Layers size={18} />} title="The grid" tint={tint} colors={colors}>
                {grid ? (
                    <FactGrid colors={colors} columns={3} facts={[
                        [<FlaskConical size={15} />, "Sample", grid.sampleCode],
                        [<Package size={15} />, "Box and place", `box ${grid.boxLabel}, place ${grid.position}`],
                        [<Hash size={15} />, "Grid", grid.gridNumber != null ? `#${grid.gridNumber}` : null],
                        [<Layers size={15} />, "Type", grid.gridType],
                        [<FlaskConical size={15} />, "Specimen", grid.specimen],
                        [<Activity size={15} />, "Grid state", <Pill color={GRID_STATUS_COLORS[grid.status]}>{GRID_STATUS_LABELS[grid.status]}</Pill>],
                    ]} />
                ) : (
                    <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>The facility gave it no grid.</Typography>
                )}
            </DialogPart>

            <DialogPart icon={<Film size={18} />} title="Acquisition" tint={tint} colors={colors}
                        action={watch ? <Pill color={WATCH_COLORS[watch]}>{WATCH_LABELS[watch]}</Pill> : undefined}>
                <FactGrid colors={colors} columns={3} facts={[
                    [<Film size={15} />, "Movies", dataset.movieCount ? plural(dataset.movieCount, "movie") : "None yet"],
                    [<Gauge size={15} />, "Size", dataset.movieBytes ? formatBytes(dataset.movieBytes) : null],
                    [<Clock size={15} />, "First movie", formatMoment(dataset.firstMovieAt)],
                    [<Clock size={15} />, "Last movie", formatMoment(dataset.lastMovieAt)],
                ]} />
            </DialogPart>

            <DialogPart icon={<Microscope size={18} />} title="What the movies say" tint={tint} colors={colors}
                        subtitle="Read from the first movie's metadata; the pixel size is the facility's calibrated one when it has it.">
                {!acquisition && (
                    <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>Nothing yet: it is read when the first movie arrives.</Typography>
                )}
                {acquisition?.error && (
                    <Box sx={{ borderRadius: 2, border: "1px solid rgba(220,38,38,0.35)", bgcolor: "rgba(220,38,38,0.06)", px: 1.5, py: 1 }}>
                        <Typography sx={{ fontSize: FACILITY_TEXT.note, color: "#dc2626" }}>
                            Its metadata could not be read: {acquisition.error}
                        </Typography>
                    </Box>
                )}
                {acquisition && !acquisition.error && (
                    <FactGrid colors={colors} columns={3} facts={[
                        [<Camera size={15} />, "Detector", acquisition.detectorName || acquisition.cameraName || dataset.detectorName],
                        [<Microscope size={15} />, "Instrument", acquisition.instrument],
                        [<Zap size={15} />, "Voltage", acquisition.voltageKv != null ? `${acquisition.voltageKv} kV` : null],
                        [<Aperture size={15} />, "Magnification", acquisition.magnification != null ? `${acquisition.magnification.toLocaleString("en-US")}×` : null],
                        [<Ruler size={15} />, "Pixel size", pixel != null
                            ? `${round(pixel, 4)} Å${acquisition.pixelCalibrated ? " (calibrated)" : ""}` : null],
                        [<Layers size={15} />, "Frames", acquisition.frames != null ? String(acquisition.frames) : null],
                        [<Timer size={15} />, "Exposure", acquisition.exposureSeconds != null ? `${round(acquisition.exposureSeconds, 3)} s` : null],
                        [<Sun size={15} />, "Total dose", acquisition.totalDose != null ? `${round(acquisition.totalDose, 2)} e⁻/Å²` : null],
                        [<Sun size={15} />, "Dose per frame", acquisition.dosePerFrame != null ? `${round(acquisition.dosePerFrame, 3)} e⁻/Å²` : null],
                        [<Images size={15} />, "Gain reference", gainName],
                        [<Clock size={15} />, "Taken", formatMoment(acquisition.acquiredAt)],
                    ]} />
                )}
                {(acquisition?.warnings?.length ?? 0) > 0 && (
                    <Box sx={{ borderRadius: 2, border: "1px solid rgba(217,119,6,0.35)", bgcolor: "rgba(217,119,6,0.07)", px: 1.5, py: 1 }}>
                        {acquisition!.warnings!.map((warning) => (
                            <Stack key={warning} direction="row" spacing={0.75} alignItems="flex-start" sx={{ color: "#b45309" }}>
                                <AlertTriangle size={14} style={{ marginTop: 3, flexShrink: 0 }} />
                                <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.text }}>{warning}</Typography>
                            </Stack>
                        ))}
                    </Box>
                )}
            </DialogPart>

            <DialogPart icon={<Activity size={18} />} title="Processing" tint={tint} colors={colors}
                        subtitle={dataset.projectId != null ? "The facility processes it in its own project, which you can open."
                            : "The facility has not made its project yet."}>
                {(dataset.projectId != null || dataset.navigation?.state === "done") && (
                    <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                        <DatasetProjectLinks dataset={dataset} colors={colors} readOnly />
                        {dataset.navigation?.state === "done" && <NavigationReport dataset={dataset} canMake={false} />}
                    </Stack>
                )}
            </DialogPart>

            {(dataset.images?.length ?? 0) > 0 && (
                <DialogPart icon={<Images size={18} />} title="Images" tint={tint} colors={colors}>
                    <ImageStrip images={dataset.images ?? []} size={72} colors={colors} />
                </DialogPart>
            )}
        </ViewDialog>
    );
}

