import { useState } from "react";
import { Stack, ToggleButton, ToggleButtonGroup, type SxProps, type Theme } from "@mui/material";
import { Cpu, HardDrive } from "lucide-react";

import ComputeUsagePanel from "./ComputeUsagePanel";
import DiskUsagePanel from "./DiskUsagePanel";

type PanelStyles = {
    fieldSx: SxProps<Theme>;
    cardSx: SxProps<Theme>;
    cardHeaderSx: SxProps<Theme>;
    actionButtonSx?: SxProps<Theme>;
    colors: { border: string; text: string; muted: string; surface: string; hover: string };
};

// What the users use: the disk their projects take, and the computing their runs took
export default function UsagePanel(props: PanelStyles) {
    const [part, setPart] = useState<"disk" | "compute">("disk");
    return (
        <Stack spacing={1.75}>
            <ToggleButtonGroup exclusive size="small" value={part} aria-label="Usage"
                               onChange={(_, value) => value && setPart(value)}>
                <ToggleButton value="disk" sx={{ fontSize: 14.5, px: 2.25, gap: 1 }}>
                    <HardDrive size={16} /> Disk
                </ToggleButton>
                <ToggleButton value="compute" sx={{ fontSize: 14.5, px: 2.25, gap: 1 }}>
                    <Cpu size={16} /> Computing
                </ToggleButton>
            </ToggleButtonGroup>
            {part === "disk" ? <DiskUsagePanel {...props} /> : <ComputeUsagePanel {...props} />}
        </Stack>
    );
}
