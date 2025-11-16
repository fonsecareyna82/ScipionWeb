// src/layout/AppLayout.tsx
import { SidebarProvider, useSidebar } from "../context/SidebarContext";
import { Outlet, useLocation } from "react-router";
import AppHeader from "./AppHeader";
import Backdrop from "./Backdrop";
import AppSidebar from "./AppSidebar";

const LayoutContent: React.FC = () => {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const location = useLocation();
  const isProjectPage = location.pathname.startsWith("/project/");

  const marginClass =
    isMobileOpen
      ? "ml-0"
      : (isExpanded || isHovered)
      ? "lg:ml-[290px]"
      : "lg:ml-[90px]";

  return (
    <div
      className="min-h-screen w-full overflow-hidden xl:flex"
      style={{ height: "100dvh" }}
    >
      <div>
        <AppSidebar />
        <Backdrop />
      </div>

      <div
        className={[
          "flex-1 min-w-0",
          "flex flex-col min-h-0",
          "transition-all duration-300 ease-in-out",
          marginClass,
        ].join(" ")}
      >
        <AppHeader />

        <main
          className={[
            "flex-1 min-h-0",
            isProjectPage ? "overflow-hidden" : "overflow-auto",
            "p-2 md:p-2",
          ].join(" ")}
        >
          <Outlet />
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
