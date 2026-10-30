import type { ReactNode } from "react";
import { Microscope } from "lucide-react";

import { useFacilityStatus } from "@/hooks/useFacilityStatus";

// The tabs of the Facility page, in their order; each one shows to whom holds one of its permissions.
// Sessions, calendar, samples and grids, the monitor and reports come here as they are built.
export const FACILITY_TABS = [
  { key: "microscopes", label: "Microscopes", icon: Microscope, permissions: ["facility.manage"] },
] as const;

export type FacilityTabKey = (typeof FACILITY_TABS)[number]["key"];
export type FacilityTab = (typeof FACILITY_TABS)[number];

/** The Facility tabs the signed-in user may open: none when this installation runs no facility. */
export function useFacilityTabs(): { loaded: boolean; tabs: FacilityTab[] } {
  const { loaded, facilityCan } = useFacilityStatus();
  const tabs = FACILITY_TABS.filter((tab) => tab.permissions.some((permission) => facilityCan(permission)));
  return { loaded, tabs };
}

export type FacilityNavItem = { name: string; path: string; icon: ReactNode };

/** The Facility entry of the menu, or null when the user has no Facility tab (or there is no facility). */
export function useFacilityNavItem(): FacilityNavItem | null {
  const { tabs } = useFacilityTabs();
  return tabs.length ? { icon: <Microscope />, name: "Facility", path: "/facility" } : null;
}
