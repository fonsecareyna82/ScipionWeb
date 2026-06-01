// src/utils/project-list-request-guard.ts

let installed = false;
let cachedProjectListBody: string | null = null;
let cachedProjectListHeaders: Headers | null = null;

function isProjectWorkspaceRoute(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname.startsWith("/project/load/");
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) {
    return String(input.method || "GET").toUpperCase();
  }
  return "GET";
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (typeof URL !== "undefined" && input instanceof URL) return input.toString();
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return String(input);
}

function isProjectListRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  if (getRequestMethod(input, init) !== "GET") return false;

  try {
    const url = new URL(getRequestUrl(input), window.location.origin);
    return url.pathname.replace(/\/+$/, "") === "/projects";
  } catch {
    return false;
  }
}

function makeProjectListResponse(): Response {
  const headers = cachedProjectListHeaders ? new Headers(cachedProjectListHeaders) : new Headers();
  headers.set("Content-Type", headers.get("Content-Type") || "application/json");

  return new Response(cachedProjectListBody ?? "[]", {
    status: 200,
    statusText: "OK",
    headers,
  });
}

async function cacheProjectListResponse(response: Response): Promise<void> {
  if (!response.ok) return;

  try {
    cachedProjectListHeaders = new Headers(response.headers);
    cachedProjectListBody = await response.clone().text();
  } catch {
    // noOp
  }
}

export function installProjectListRequestGuard(): void {
  if (installed) return;
  if (typeof window === "undefined") return;
  if (typeof window.fetch !== "function") return;

  installed = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (isProjectListRequest(input, init) && isProjectWorkspaceRoute()) {
      return makeProjectListResponse();
    }

    const response = await originalFetch(input, init);

    if (isProjectListRequest(input, init)) {
      void cacheProjectListResponse(response);
    }

    return response;
  };
}
