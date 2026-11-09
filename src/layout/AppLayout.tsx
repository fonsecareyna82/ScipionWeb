// src/layout/AppLayout.tsx
import { SidebarProvider, useSidebar } from "../context/SidebarContext";
import { useTheme as useAppTheme } from "../context/ThemeContext";
import { Outlet, useLocation } from "react-router";
import AppHeader from "./AppHeader";
import Backdrop from "./Backdrop";
import AppSidebar from "./AppSidebar";
import FacilityAlertsBanner from "@/components/facility/FacilityAlertsBanner";
import PageErrorBoundary from "@/components/common/PageErrorBoundary";

const LayoutContent: React.FC = () => {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const { theme } = useAppTheme();
  const location = useLocation();
  const isDark = theme === "dark";
  const isProjectPage = location.pathname.startsWith("/project/");

  const marginClass =
    isMobileOpen
      ? "ml-0"
      : (isExpanded || isHovered)
      ? "lg:ml-[290px]"
      : "lg:ml-[90px]";

  const layoutClassName = [
    "min-h-screen w-full overflow-hidden xl:flex ml-[-10px]",
    isDark ? "bg-gray-950 text-gray-100" : "bg-gray-50 text-gray-900",
  ].join(" ");

  const contentClassName = [
    "flex-1 min-w-0",
    "flex flex-col min-h-0",
    "transition-all duration-300 ease-in-out",
    isDark ? "bg-gray-950" : "bg-gray-50",
    marginClass,
  ].join(" ");

  const mainClassName = [
    "flex-1 min-h-0",
    isProjectPage ? "overflow-hidden" : "overflow-auto",
    "p-2 md:p-2",
    isDark ? "bg-gray-950" : "bg-gray-50",
  ].join(" ");

  return (
    <div className={layoutClassName} style={{ height: "100dvh" }}>
      <div>
        <PageErrorBoundary silent label="The menu">
          <AppSidebar />
        </PageErrorBoundary>
        <Backdrop />
      </div>

      <div className={contentClassName}>
        <AppHeader />
        {/* The facility's open alerts, for its staff, over every page (nothing without a facility) */}
        <PageErrorBoundary silent label="The facility's alerts">
          <FacilityAlertsBanner />
        </PageErrorBoundary>

        <main className={mainClassName}>
          {/* An error in a page shows its message there; the menu and the header go on, and another page starts clean */}
          <PageErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </PageErrorBoundary>
        </main>
      </div>
    </div>
  );
};

const AppLayout: React.FC = () => (
  <SidebarProvider>
    <LayoutContent />
  </SidebarProvider>
);

export default AppLayout;
