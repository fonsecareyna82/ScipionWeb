// src/layout/AppLayout.tsx
import { SidebarProvider, useSidebar } from "../context/SidebarContext";
import { Outlet } from "react-router";
import AppHeader from "./AppHeader";
import Backdrop from "./Backdrop";
import AppSidebar from "./AppSidebar";

const LayoutContent: React.FC = () => {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();

  // Compute the left margin to compensate for the fixed sidebar width.
  const marginClass =
    isMobileOpen
      ? "ml-0"
      : (isExpanded || isHovered)
      ? "lg:ml-[290px]"
      : "lg:ml-[90px]";

  return (
    // Make the layout fill the viewport and prevent page-level scroll.
    <div className="h-screen w-full overflow-hidden xl:flex">
      {/* Sidebar + overlay/backdrop (likely fixed/absolute inside) */}
      <div>
        <AppSidebar />
        <Backdrop />
      </div>

      {/* Right column: header (no scroll) + content (scrolls) */}
      <div
        className={[
          "flex-1 min-w-0",
          "flex flex-col min-h-0", // allow the content area to shrink and enable child overflow
          "transition-all duration-300 ease-in-out",
          marginClass,
        ].join(" ")}
      >
        {/* Header should not scroll */}
        <AppHeader />

        {/* Content area: the ONLY scroller in the page */}
        <main className="flex-1 min-h-0 overflow-auto p-2 md:p-2">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

const AppLayout: React.FC = () => {
  return (
    <SidebarProvider>
      <LayoutContent />
    </SidebarProvider>
  );
};

export default AppLayout;
