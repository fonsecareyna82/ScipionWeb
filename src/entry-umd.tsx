// src/entry-projects-umd.tsx
import React from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import Projects from "./pages/Dashboard/projects/Projects";
import { ProjectServiceProvider } from "./ProjectServiceContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ProcessingProvider } from "@/hooks/useProcessingPlugins";
import { DragProvider } from "./components/protocol/DragContext";
import { AppWrapper } from "./components/common/PageMeta";

type MountOptions = {
  container?: HTMLElement | string | null;
  initialPath?: string; // e.g. "/projects"
  service?: any; // inyecta tu adapter (ProjectService)
  provideProviders?: boolean; // default true
};

let root: Root | null = null;
let mountedContainer: HTMLElement | null = null;

function resolveContainer(container?: HTMLElement | string | null) {
  if (typeof container === "string") {
    let el = document.querySelector(container) as HTMLElement | null;
    if (!el) {
      el = document.createElement("div");
      el.id = container.replace(/^#/, "") || "my-projects-widget";
      document.body.appendChild(el);
    }
    return el;
  } else if (container instanceof HTMLElement) {
    return container;
  } else {
    let el = document.getElementById("my-projects-widget");
    if (!el) {
      el = document.createElement("div");
      el.id = "my-projects-widget";
      document.body.appendChild(el);
    }
    return el;
  }
}

export function mountProjectsWidget(opts: MountOptions = {}) {
  const { container = null, initialPath = "/projects", service = undefined, provideProviders = true } = opts;
  const el = resolveContainer(container);

  if (mountedContainer === el && root) {
    console.warn("ProjectsWidget: already mounted into this container");
    return { unmount: () => { if (root) { root.unmount(); root = null; mountedContainer = null; } } };
  }

  mountedContainer = el;
  root = createRoot(el);

  const AppTree = (
    <MemoryRouter initialEntries={[initialPath]}>
      <Projects service={service} />
    </MemoryRouter>
  );

  const WithProviders = provideProviders ? (
    <ProcessingProvider>
      <ThemeProvider>
        <ProjectServiceProvider service={service}>
          <DragProvider>
            <AppWrapper>{AppTree}</AppWrapper>
          </DragProvider>
        </ProjectServiceProvider>
      </ThemeProvider>
    </ProcessingProvider>
  ) : (
    AppTree
  );

  root.render(WithProviders);

  return {
    unmount: () => {
      if (root) {
        root.unmount();
        root = null;
        mountedContainer = null;
      }
    },
  };
}

// UMD export on window
declare global {
  interface Window { MyProjectsWidget?: any; }
}

window.MyProjectsWidget = window.MyProjectsWidget ?? {
  version: "widget-projects-v1",
  mount: mountProjectsWidget,
  unmount: () => {
    if (root) { root.unmount(); root = null; mountedContainer = null; }
  },
};

console.log("ProjectsWidget: entry-projects-umd executed — window.MyProjectsWidget ready");
