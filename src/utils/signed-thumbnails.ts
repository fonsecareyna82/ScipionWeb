// Thumbnails of graph node outputs from the signed list of a project
// (GET /projects/{id}/thumbnails): one cheap request lists every output with
// the URL of its current image; each image is downloaded once by its URL.
// An output that grows gets a new signature, so its node gets a new image.
import type { MutableRefObject } from "react";
import type {
  Id,
  ProjectService,
  ProjectThumbnailEntry,
  ProtocolOutputThumbnailItem,
} from "@/services/ProjectService";

// The list is asked again after this long (the live refresh runs every
// second while protocols run).
export const SIGNED_THUMBNAIL_LIST_REUSE_MS = 4000;
const IMAGE_CONCURRENCY = 4;

export type SignedThumbnailList = {
  projectId: string;
  fetchedAt: number;
  entries: Map<string, ProjectThumbnailEntry & { protocolId: string }>;
};

export async function loadSignedNodeThumbnails({
  svc,
  projectId,
  nodeOutputs,
  size,
  listRef,
  cache,
  now = Date.now,
}: {
  svc: Pick<ProjectService, "fetchProjectThumbnails" | "fetchThumbnailImageObjectUrl">;
  projectId: Id;
  nodeOutputs: Array<{ protocolId: string; outputName: string }>;
  size: number;
  listRef: MutableRefObject<SignedThumbnailList | null>;
  // Images already shown, by output and signature.
  cache: Map<string, ProtocolOutputThumbnailItem>;
  now?: () => number;
}): Promise<ProtocolOutputThumbnailItem[]> {
  let list = listRef.current;
  if (!list || list.projectId !== String(projectId) || now() - list.fetchedAt > SIGNED_THUMBNAIL_LIST_REUSE_MS) {
    const fetched = await svc.fetchProjectThumbnails!(projectId, { scope: "graph", size });
    list = {
      projectId: String(projectId),
      fetchedAt: now(),
      entries: new Map(fetched.groups.flatMap((group) => group.outputs.map((output) =>
        [`${group.protocolId}|${output.outputName}`, { ...output, protocolId: String(group.protocolId) }] as const))),
    };
    listRef.current = list;
  }

  const items: ProtocolOutputThumbnailItem[] = [];
  const toLoad: Array<{ cacheKey: string; entry: ProjectThumbnailEntry & { protocolId: string } }> = [];
  const seen = new Set<string>();
  for (const { protocolId, outputName } of nodeOutputs) {
    const entry = list.entries.get(`${protocolId}|${outputName}`);
    if (!entry || entry.state === "unavailable") continue;
    const cacheKey = [projectId, protocolId, outputName, size, entry.signature].join("|");
    if (seen.has(cacheKey)) continue;
    seen.add(cacheKey);
    const cached = cache.get(cacheKey);
    if (cached) items.push(cached);
    else toLoad.push({ cacheKey, entry });
  }

  let next = 0;
  const loadNext = async (): Promise<void> => {
    while (next < toLoad.length) {
      const { cacheKey, entry } = toLoad[next++];
      const objectUrl = await svc.fetchThumbnailImageObjectUrl!(entry.url).catch(() => null);
      if (!objectUrl) continue;
      const item: ProtocolOutputThumbnailItem = {
        protocolId: entry.protocolId,
        outputName: entry.outputName,
        outputClassName: entry.outputClassName ?? null,
        exists: true,
        thumbnailUrl: entry.url,
        thumbnailDataUrl: objectUrl,
      };
      cache.set(cacheKey, item);
      items.push(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(IMAGE_CONCURRENCY, toLoad.length) }, loadNext));
  return items;
}
