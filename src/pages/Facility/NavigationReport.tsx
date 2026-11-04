import { useEffect, useState } from "react";
import { Button, Chip, Tooltip } from "@mui/material";
import { Map as MapIcon, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";

import {
    fetchNavigationReportUrl, getNavigationReport, makeNavigationReport,
    type NavigationReportState, type SessionDataset,
} from "@/api/facility";
import { FACILITY_TEXT } from "./facilityStyles";

// While a report is being made (minutes), its state is asked again this often
const MAKING_REFRESH_MS = 15000;

/** Opens a report in a new tab: the tab opens on the click (no pop-up blocker), the report arrives in it. */
export async function openNavigationReport(datasetId: number): Promise<void> {
    const tab = window.open("", "_blank");
    try {
        const url = await fetchNavigationReportUrl(datasetId);
        if (tab) tab.location.href = url;
        else window.location.href = url;
    } catch (e: any) {
        tab?.close();
        toast.error(String(e?.message || e));
    }
}

/** A tomography DATA's navigation report: open it, see it being made, and (the staff) make it or try again. */
export default function NavigationReport({ dataset, canMake }: { dataset: Pick<SessionDataset, "id" | "folder" | "navigation">; canMake: boolean }) {
    const [state, setState] = useState<NavigationReportState | null | undefined>(dataset.navigation);
    useEffect(() => setState(dataset.navigation), [dataset.navigation]);

    const making = state?.state === "making";
    useEffect(() => {
        if (!making) return;
        const timer = window.setInterval(() => {
            getNavigationReport(dataset.id).then(setState).catch(() => undefined);
        }, MAKING_REFRESH_MS);
        return () => window.clearInterval(timer);
    }, [making, dataset.id]);

    if (!state) return null;
    const make = () => makeNavigationReport(dataset.id).then((made) => {
        setState(made);
        toast.success("Making the navigation report: it takes a few minutes.");
    }).catch((e: any) => toast.error(String(e?.message || e)));
    const sx = { textTransform: "none", fontSize: FACILITY_TEXT.note, py: 0, minHeight: 0 } as const;

    if (state.state === "done") {
        return (
            <Tooltip arrow title="The atlas, the search maps, where each tilt series was taken, and the tilt series: a page of its own">
                <Button size="small" variant="text" sx={sx} startIcon={<MapIcon size={14} />}
                        aria-label={`Navigation report of ${dataset.folder}`} onClick={() => void openNavigationReport(dataset.id)}>
                    Navigation report
                </Button>
            </Tooltip>
        );
    }
    if (making) {
        return <Chip size="small" variant="outlined" label="Making the navigation report…" sx={{ fontSize: FACILITY_TEXT.badge }} />;
    }
    if (!canMake || state.available === false) return null;
    if (state.state === "failed") {
        return (
            <Tooltip arrow title={state.message || "It failed"}>
                <Button size="small" variant="text" color="warning" sx={sx} startIcon={<RefreshCw size={14} />}
                        onClick={() => void make()}>
                    Navigation report failed: try again
                </Button>
            </Tooltip>
        );
    }
    return (
        <Button size="small" variant="text" sx={sx} startIcon={<MapIcon size={14} />} onClick={() => void make()}>
            Make the navigation report
        </Button>
    );
}
