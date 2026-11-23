import { useState } from "react";
import { Stack, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Cpu, HardDrive } from "lucide-react";

import ComputeUsagePanel from "./ComputeUsagePanel";
import DiskUsagePanel from "./DiskUsagePanel";
import { choiceButtonsSx } from "./SettingsSection";
import { useSettingsStyles } from "./useSettingsStyles";

// What the users use: the disk their projects take, and the computing their runs took
export default function UsagePanel() {
    const isDarkMode = useTheme().palette.mode === "dark";
    const { colors } = useSettingsStyles(isDarkMode);
    const [part, setPart] = useState<"disk" | "compute">("disk");
    return (
        <Stack spacing={2}>
            <ToggleButtonGroup exclusive size="small" value={part} aria-label="Usage"
                               onChange={(_, value) => value && setPart(value)}
                               sx={choiceButtonsSx({ ...colors, hover: colors.hover }, isDarkMode)}>
                <ToggleButton value="disk"><HardDrive size={16} />Disk</ToggleButton>
                <ToggleButton value="compute"><Cpu size={16} />Computing</ToggleButton>
            </ToggleButtonGroup>
            {part === "disk" ? <DiskUsagePanel /> : <ComputeUsagePanel />}
        </Stack>
    );
}
