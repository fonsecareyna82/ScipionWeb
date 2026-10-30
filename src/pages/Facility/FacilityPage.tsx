import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { Alert, Box, CircularProgress, Divider, Paper, Stack, Tab, Tabs, Typography } from "@mui/material";

import PageMeta from "@/components/common/PageMeta";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { useFacilityTabs, type FacilityTabKey } from "@/layout/facilityNav";
import { useFacilityStyles } from "./facilityStyles";
import MicroscopesPanel from "./MicroscopesPanel";
import SamplesPanel from "./SamplesPanel";
import SessionsPanel from "./SessionsPanel";
import { useFacilityStatus } from "@/hooks/useFacilityStatus";

const wrapperMaxWidth = 1120;

/** The facility in one page: a tab per part (/facility/<tab>), each shown to whom may use it. */
export default function FacilityPage() {
  const { tab: requestedTab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const { loaded, tabs } = useFacilityTabs();
  const { facilityCan } = useFacilityStatus();
  const styles = useFacilityStyles();
  const { colors, dividerSx, tabsSx } = styles;
  const tab = tabs.find((candidate) => candidate.key === requestedTab)?.key ?? tabs[0]?.key;

  // /facility, or a tab the user may not open, goes to the first one they may
  useEffect(() => {
    if (loaded && tab && tab !== requestedTab) navigate(`/facility/${tab}`, { replace: true });
  }, [loaded, navigate, requestedTab, tab]);

  const renderTab = (key: FacilityTabKey) => {
    const keepsSessions = facilityCan("facility.sessions") || facilityCan("facility.manage");
    switch (key) {
      case "sessions":
        return <SessionsPanel {...styles} canEdit={keepsSessions} />;
      case "samples":
        return <SamplesPanel {...styles} canEdit={keepsSessions} />;
      case "microscopes":
        return <MicroscopesPanel {...styles} />;
    }
  };

  const content = !loaded ? (
    <Box sx={{ py: 8, display: "flex", justifyContent: "center" }}>
      <CircularProgress size={30} />
    </Box>
  ) : !tab ? (
    <Alert severity="info">There is nothing for you here: the facility pages are for its users and staff, when this
      installation runs a facility.</Alert>
  ) : (
    renderTab(tab)
  );

  return (
    <>
      <PageMeta title="Scipion | Facility" description="The facility's sessions, microscopes and configuration" />
      <PageBreadcrumb pageTitle="Facility" />

      <div
        className="relative flex h-[calc(100dvh-132px)] min-h-0 flex-col overflow-hidden rounded-2xl border p-5 lg:p-6"
        style={{ maxWidth: wrapperMaxWidth, width: "100%", background: colors.surface, borderColor: colors.border,
                 color: colors.text }}
      >
        <Paper
          variant="outlined"
          sx={{ borderRadius: 2, overflow: "hidden", bgcolor: "transparent", borderColor: colors.border,
                color: colors.text, display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
        >
          <Box sx={{ px: 2, pt: 1.75, pb: 1.25, flexShrink: 0 }}>
            <Typography sx={{ color: colors.muted, fontSize: 14 }}>
              The facility's acquisition sessions, their processing and its microscopes.
            </Typography>
          </Box>
          <Divider sx={dividerSx} />
          {tabs.length > 0 && (
            <>
              <Tabs value={tab ?? false} onChange={(_, value) => navigate(`/facility/${value}`)} variant="scrollable"
                    scrollButtons="auto" sx={{ ...tabsSx, flexShrink: 0 }}>
                {tabs.map(({ key, label, icon: Icon }) => (
                  <Tab key={key} value={key} label={label} icon={<Icon size={16} />} iconPosition="start" />
                ))}
              </Tabs>
              <Divider sx={dividerSx} />
            </>
          )}
          <Stack sx={{ p: 2, minHeight: 0, flex: 1, overflowY: "auto", overscrollBehavior: "contain" }}>
            {content}
          </Stack>
        </Paper>
      </div>
    </>
  );
}
