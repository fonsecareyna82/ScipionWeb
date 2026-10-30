import { useIsDark } from "@/context/ThemeContext";
import { useSettingsStyles, type SettingsFontSizes } from "@/pages/Settings/useSettingsStyles";

// The facility pages read bigger than Settings: forms, notes and lists
const FACILITY_FONT_SIZES: SettingsFontSizes = { field: 15.5, helper: 13.5, button: 13.5 };

/** Text sizes of the facility pages, for what the shared styles do not cover. */
export const FACILITY_TEXT = {
  // A list item's name, and its lines
  itemTitle: 16,
  itemLine: 14,
  // A note or hint under or beside a field
  note: 13.5,
  // The title of a part of a form
  sectionTitle: 15,
  // A badge beside a name (a status)
  badge: 13,
} as const;

export function useFacilityStyles() {
  return useSettingsStyles(useIsDark(), FACILITY_FONT_SIZES);
}
