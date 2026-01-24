// src/entry-protocoldetail-umd.tsx
import "./index.css";

import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import ProtocolForm from "./components/protocol/ProtocolForm";


// ---- Tipos básicos para el servicio que inyecta el host ----
type Id = string | number;
type ProjectService = {
  fetchProtocolDetails?: (projectId: Id, protocolId: Id) => Promise<any>;
  loadProtocols?: (projectId: Id) => Promise<any[] | Record<string, any>>;
};

// ---- Utilidades ------------------------------------------------------
function ensureDomRoots() {
  ["modal-root", "drawer-root", "toast-root", "portal-root", "app", "root"].forEach((id) => {
    if (!document.getElementById(id)) {
      const d = document.createElement("div");
      d.id = id;
      document.body.appendChild(d);
    }
  });
}

// Mapea nombres alternativos del servicio a los esperados
function normalizeServiceAPI(srv?: ProjectService): Required<ProjectService> {
  const fallbackFetchProtocolDetails = async (projectId: Id, protocolId: Id) => {
    const r = await fetch(`/api/projects/${projectId}/protocols/${protocolId}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };
  const fallbackLoadProtocols = async (projectId: Id) => {
    const r = await fetch(`/api/projects/${projectId}/protocols`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object") return Object.values(data);
    return [];
  };

  const n: any = { ...(srv || {}) };

  const mapFn = (to: string, ...alts: string[]) => {
    if (typeof n[to] === "function") return;
    for (const a of alts) {
      if (typeof n[a] === "function") {
        n[to] = n[a].bind(n);
        return;
      }
    }
  };

  mapFn("fetchProtocolDetails", "getProtocol", "getProtocolDetails", "fetchProtocol");
  mapFn("loadProtocols", "listProtocols", "fetchProtocols", "getProtocols");
  mapFn(
    "resolveAnalyzeViewer",
    "resolveAnalyzeViewer",
    "resolveAnalyzeOutputViewer",
    "resolveAnalyzeViewerDecision",
    "analyzeViewerResolve",
  );

  if (typeof n.fetchProtocolDetails !== "function") n.fetchProtocolDetails = fallbackFetchProtocolDetails;
  if (typeof n.loadProtocols !== "function") n.loadProtocols = fallbackLoadProtocols;

  return n as Required<ProjectService>;
}

// ErrorBoundary para mostrar fallos legibles en el host
class WidgetErrorBoundary extends React.Component<{ children: React.ReactNode }, { err: any }> {
  state = { err: null as any };
  static getDerivedStateFromError(err: any) { return { err }; }
  componentDidCatch(err: any, info: any) {
    // eslint-disable-next-line no-console
    console.error("[ProtocolDetailWidget] error:", err, info);
  }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <pre
        style={{
          color: "#b91c1c",
          background: "#fee2e2",
          padding: 12,
          borderRadius: 8,
          whiteSpace: "pre-wrap",
          lineHeight: 1.35,
          fontSize: 13,
        }}
      >
        ProtocolDetailWidget error:
        {"\n"}
        {String(this.state.err?.stack || this.state.err)}
      </pre>
    );
  }
}

// ---- Wrapper que trae datos una sola vez y monta el Form --------------------
function ProtocolDetailWrapper({
  service,
  projectId,
  protocolId,
  initialProtocol,
  onCloseHost,
}: {
  service: Required<ProjectService>;
  projectId: Id;
  protocolId: Id;
  initialProtocol?: any;
  onCloseHost?: () => void;
}) {
  const [detail, setDetail] = useState<any | null>(initialProtocol ?? null);
  const [protocols, setProtocols] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(!initialProtocol);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const [d, p] = await Promise.all([
          initialProtocol ? Promise.resolve(initialProtocol) : service.fetchProtocolDetails(projectId, protocolId),
          service.loadProtocols(projectId),
        ]);
        if (cancelled) return;

        setDetail(d);
        const arr = Array.isArray(p) ? p : (p && typeof p === "object" ? Object.values(p) : []);
        setProtocols(arr);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load protocol detail");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [projectId, protocolId, service, initialProtocol]);

  const onClose = useMemo(() => {
    return () => {
      if (typeof onCloseHost === "function") onCloseHost();
      else {
        try { history.back(); } catch {}
      }
    };
  }, [onCloseHost]);

  if (loading) {
    return <div style={{ padding: 16, fontFamily: "system-ui" }}>Loading protocol…</div>;
  }
  if (error || !detail) {
    return (
      <div style={{ padding: 16, color: "#b91c1c", fontFamily: "system-ui" }}>
        {error || "Failed to load protocol."}
      </div>
    );
  }

  return (
    <ProtocolForm
      data={detail}
      projectProtocols={protocols}
      onClose={onClose}
      variant="docked"
    />
  );
}

// ---- API pública del UMD ----------------------------------------------------
// ✅ Exporta el tipo que tu index.tsx quiere re-exportar
export type ProtocolDetailInitialProps = {
  /** Si el host ya precargó el detalle, podemos recibirlo aquí */
  initialProtocol?: any;
  /** Callback opcional para cerrar (el Close del form) */
  onClose?: () => void;
};

export type ProtocolDetailMountOptions = {
  container: string | HTMLElement;
  service?: ProjectService;
  projectId: Id;
  protocolId: Id;
  props?: ProtocolDetailInitialProps;
};

export function mountProtocolDetailWidget({
  container,
  service,
  projectId,
  protocolId,
  props,
}: ProtocolDetailMountOptions) {
  const target = typeof container === "string" ? document.querySelector(container) : container;
  if (!target) throw new Error(`ProtocolDetailWidget: container '${container}' not found`);

  ensureDomRoots();
  const svc = normalizeServiceAPI(service);

  const root = ReactDOM.createRoot(target as HTMLElement);
  root.render(
    <WidgetErrorBoundary>
      <ProtocolDetailWrapper
        service={svc}
        projectId={projectId}
        protocolId={protocolId}
        initialProtocol={props?.initialProtocol}
        onCloseHost={props?.onClose}
      />
    </WidgetErrorBoundary>
  );

  return {
    unmount() { root.unmount(); },
    root,
  };
}

// ---- Exponer en window para uso UMD ----------------------------------------
if (typeof window !== "undefined") {
  (window as any).ProtocolDetailWidget = { mountProtocolDetailWidget };

  const prev: any = (window as any).MyProjectsWidget || {};
  (window as any).MyProjectsWidget = {
    ...prev,
    mountProtocolDetailWidget,
  };

  // eslint-disable-next-line no-console
  console.log("ProtocolDetailWidget (ProtocolForm): ready under window.ProtocolDetailWidget & window.MyProjectsWidget");
}
