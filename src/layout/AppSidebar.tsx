import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import {
  BoxCubeIcon,
  CalenderIcon,
  FolderIcon,
  GridIcon,
  HorizontaLDots,
  ListIcon,
  PageIcon,
  PieChartIcon,
  PlugInIcon,
  TableIcon,
  TreeIcon,
  UserCircleIcon,
} from "../icons";
import { useSidebar } from "../context/SidebarContext";
import SidebarWidget from "./SidebarWidget";
import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { FolderKanban, LucideSettings2, TreesIcon} from "lucide-react";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;
export const TooltipContent = TooltipPrimitive.Content;

type NavItem = {
  name?: string;
  icon?: React.ReactNode;
  path?: string;
  separator?: boolean;
  subItems?: { name: string; path: string; pro?: boolean; new?: boolean }[];
};

const navItems: NavItem[] = [
  { icon: <GridIcon />, name: "Home", path: "/home" },
  { icon: <FolderKanban />, name: "Projects", path: "/projects" },
  { icon: <TreeIcon />, name: "Workflows", path: "/workflows" },
  { icon: <PlugInIcon />, name: "Plugins", path: "/plugins" },
  { separator: true },
  { icon: <UserCircleIcon />, name: "User profile", path: "/profile"},  
  { icon: <LucideSettings2/>, name: "Settings", path: "/settings",}
  
];

const othersItems: NavItem[] = [
  {
    icon: <CalenderIcon />,
    name: "Calendar",
    path: "/calendar",
  },
  {
    icon: <UserCircleIcon />,
    name: "User profile",
    path: "/profile",
  },
  {
    name: "Forms",
    icon: <ListIcon />,
    subItems: [{ name: "Form Elements", path: "/form-elements", pro: false }],
  },
  {
    name: "Tables",
    icon: <TableIcon />,
    subItems: [{ name: "Basic Tables", path: "/basic-tables", pro: false }],
  },
  {
    name: "Pages",
    icon: <PageIcon />,
    subItems: [
      { name: "Blank Page", path: "/blank", pro: false },
      { name: "404 Error", path: "/error-404", pro: false },
    ],
  },
  {
    icon: <PieChartIcon />,
    name: "Charts",
    subItems: [
      { name: "Line Chart", path: "/line-chart", pro: false },
      { name: "Bar Chart", path: "/bar-chart", pro: false },
    ],
  },
  { icon: <CalenderIcon />,   name: "Calendar", path: "/calendar",},
  {
    icon: <BoxCubeIcon />,
    name: "UI Elements",
    subItems: [
      { name: "Alerts", path: "/alerts", pro: false },
      { name: "Avatar", path: "/avatars", pro: false },
      { name: "Badge", path: "/badge", pro: false },
      { name: "Buttons", path: "/buttons", pro: false },
      { name: "Images", path: "/images", pro: false },
      { name: "Videos", path: "/videos", pro: false },
    ],
  },
  {
    icon: <PlugInIcon />,
    name: "Authentication",
    subItems: [
      { name: "Sign In", path: "/signin", pro: false },
      { name: "Sign Up", path: "/signup", pro: false },
    ],
  },
];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen } = useSidebar();
  const location = useLocation();

  const [openSubmenu, setOpenSubmenu] = useState<{ type: "main" | "others"; index: number } | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>({});
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isActive = useCallback((path: string) => location.pathname === path, [location.pathname]);

  useEffect(() => {
    let submenuMatched = false;
    ["main", "others"].forEach((menuType) => {
      const items = menuType === "main" ? navItems : othersItems;
      items.forEach((nav, index) => {
        if (nav.subItems) {
          nav.subItems.forEach((subItem) => {
            if (isActive(subItem.path)) {
              setOpenSubmenu({ type: menuType as "main" | "others", index });
              submenuMatched = true;
            }
          });
        }
      });
    });
    if (!submenuMatched) setOpenSubmenu(null);
  }, [location, isActive]);

  useEffect(() => {
    if (openSubmenu !== null) {
      const key = `${openSubmenu.type}-${openSubmenu.index}`;
      if (subMenuRefs.current[key]) {
        setSubMenuHeight((prev) => ({
          ...prev,
          [key]: subMenuRefs.current[key]?.scrollHeight || 0,
        }));
      }
    }
  }, [openSubmenu]);

  const handleSubmenuToggle = (index: number, menuType: "main" | "others") => {
    setOpenSubmenu((prev) => {
      if (prev && prev.type === menuType && prev.index === index) return null;
      return { type: menuType, index };
    });
  };

  const renderMenuItems = (items: NavItem[], menuType: "main" | "others") => (
    <ul className="flex flex-col gap-4">
      {items.map((nav, index) => {
        // Separador
        if (nav.separator) {
          return (
            <li key={`separator-${index}`}>
              <div className="w-full border-t border-gray-300 dark:border-gray-700 my-2" />
            </li>
          );
        }
  
        return (
          <li key={nav.name}>
            <TooltipProvider>
              {nav.subItems ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => handleSubmenuToggle(index, menuType)}
                      className={`menu-item ${openSubmenu?.type === menuType && openSubmenu?.index === index
                        ? "menu-item-active"
                        : "menu-item-inactive"
                        }`}
                    >
                      <span
                        className={`menu-item-icon-size ${openSubmenu?.type === menuType && openSubmenu?.index === index
                          ? "menu-item-icon-active"
                          : "menu-item-icon-inactive"
                          }`}
                      >
                        {nav.icon}
                      </span>
                      {(isExpanded || isMobileOpen) && (
                        <span className="menu-item-text">{nav.name}</span>
                      )}
                    </button>
                  </TooltipTrigger>
                  {!isExpanded && !isMobileOpen && (
                    <TooltipContent
                      side="right"
                      className="bg-black text-white text-sm px-2 py-1 rounded shadow-lg z-50 whitespace-nowrap"
                    >
                      {nav.name}
                    </TooltipContent>
                  )}
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to={nav.path!}
                      className={`menu-item ${isActive(nav.path!) ? "menu-item-active" : "menu-item-inactive"}`}
                    >
                      <span
                        className={`menu-item-icon-size ${isActive(nav.path!)
                          ? "menu-item-icon-active"
                          : "menu-item-icon-inactive"
                          }`}
                      >
                        {nav.icon}
                      </span>
                      {(isExpanded || isMobileOpen) && <span className="menu-item-text">{nav.name}</span>}
                    </Link>
                  </TooltipTrigger>
                  {!isExpanded && !isMobileOpen && (
                    <TooltipContent
                      side="right"
                      className="bg-black text-white text-sm px-2 py-1 rounded shadow-lg z-50 whitespace-nowrap"
                    >
                      {nav.name}
                    </TooltipContent>
                  )}
                </Tooltip>
              )}
  
              {/* Subitems */}
              {nav.subItems && (isExpanded || isMobileOpen) && (
                <div
                  ref={(el) => {
                    subMenuRefs.current[`${menuType}-${index}`] = el;
                  }}
                  className="overflow-hidden transition-all duration-300"
                  style={{
                    height:
                      openSubmenu?.type === menuType && openSubmenu?.index === index
                        ? `${subMenuHeight[`${menuType}-${index}`]}px`
                        : "0px",
                  }}
                >
                  <ul className="mt-2 space-y-1 ml-9">
                    {nav.subItems.map((subItem) => (
                      <li key={subItem.name}>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Link
                                to={subItem.path}
                                className={`menu-dropdown-item ${isActive(subItem.path)
                                  ? "menu-dropdown-item-active"
                                  : "menu-dropdown-item-inactive"
                                  }`}
                              >
                                {subItem.name}
                              </Link>
                            </TooltipTrigger>
                            {!isExpanded && !isMobileOpen && (
                              <TooltipContent
                                side="right"
                                className="bg-black text-white text-sm px-2 py-1 rounded shadow-lg z-50 whitespace-nowrap"
                              >
                                {subItem.name}
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </TooltipProvider>
          </li>
        );
      })}
    </ul>
  );

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-4 left-0 bg-gray-100 dark:bg-gray-900 
                  dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out 
                  z-50 border-r border-gray-200 
        ${isExpanded || isMobileOpen ? "w-[280px]" : "w-[70px]"}
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
    >
      <div className={`py-8 flex ${!isExpanded ? "lg:justify-center" : "justify-start"}`}>
        <Link to="/">
          {isExpanded || isMobileOpen ? (
            <>
              <div className="flex items-center">
                <img
                  className="dark:hidden"
                  src="/images/logo/scipion_icon.png"
                  alt="Logo"
                  width={60}
                  height={40}
                />
              </div>
              <img
                className="hidden dark:block"
                src="/images/logo/scipion_icon_white.png"
                alt="Logo"
                width={60}
                height={40}
              />
            </>
          ) : (
            <>
              <div className="flex items-center">
                <img
                  className="dark:hidden"
                  src="/images/logo/scipion_icon.png"
                  alt="Logo"
                  width={32}
                  height={32}
                />
              </div>
              <img
                className="hidden dark:block"
                src="/images/logo/scipion_icon_white.png"
                alt="Logo"
                width={32}
                height={32}
              />
            </>
          )}
        </Link>
      </div>

      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <h2
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${!isExpanded
                  ? "lg:justify-center"
                  : "justify-start"
                  }`}
              >
                {isExpanded || isMobileOpen ? "Menu" : <HorizontaLDots className="size-6" />}
              </h2>
              {renderMenuItems(navItems, "main")}
            </div>
             {/* Separator */}
            <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
             {/*<div className="">
              <h2
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${!isExpanded && !isHovered
                    ? "lg:justify-center"
                    : "justify-start"
                  }`}
              >
                
                {isExpanded || isHovered || isMobileOpen ? (
                  "Others"
                ) : (
                  <HorizontaLDots />
                )}
              </h2>
               {renderMenuItems(othersItems, "others")}
            </div>
            */}
          </div>
        </nav>

        {isExpanded || isMobileOpen ? <SidebarWidget /> : null}
      </div>
    </aside>
  );
};

export default AppSidebar;
