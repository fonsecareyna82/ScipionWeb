import type { Project } from "@/types/project";
import type {
  ImportProjectPayload,
  ProjectPayload,
  ProjectThumbnailGroup,
  ProjectThumbnailOutputItem,
  ShareableUser,
} from "@/services/ProjectService";

export type OutputSelectorTestOutput = {
  paramClass?: string;
  pointerClass?: string;
  _expectedClass?: string;
  value?: string;
  info?: string;
  parentId?: string | number;
  protocol?: string;
  key?: string;
};

let factorySequence = 1;

function nextSeq(): number {
  const value = factorySequence;
  factorySequence += 1;
  return value;
}

export function resetFactories(startAt = 1): void {
  factorySequence = startAt;
}

export function makeProject(overrides: Partial<Project> = {}): Project {
  const seq = nextSeq();
  const id = String(overrides.id ?? seq);

  return {
    id,
    name: `Project ${id}`,
    shortName: `project-${id}`,
    description: `Project ${id} description`,
    createdAt: new Date("2026-04-01T10:00:00Z"),
    updatedAt: new Date("2026-04-02T10:00:00Z"),
    status: "unknown",
    protocolsCount: "0",
    diskUsage: "1 GB",
    protocols: undefined,
    isShared: false,
    isOwner: true,
    permission: "full",
    projectOwnerId: "1",
    thumbnailUrl: null,
    thumbnailRebuildUrl: null,
    thumbnailItemsUrl: null,
    thumbnailVersion: 0,
    ...overrides,
  };
}

export function makeRawProject(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const project = makeProject();

  return {
    id: project.id,
    name: project.name,
    shortName: project.shortName,
    description: project.description,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt?.toISOString(),
    status: project.status,
    protocolsCount: project.protocolsCount,
    diskUsage: project.diskUsage,
    isShared: project.isShared,
    isOwner: project.isOwner,
    permission: project.permission,
    projectOwnerId: project.projectOwnerId,
    thumbnailUrl: project.thumbnailUrl,
    thumbnailRebuildUrl: project.thumbnailRebuildUrl,
    thumbnailItemsUrl: project.thumbnailItemsUrl,
    thumbnailVersion: project.thumbnailVersion,
    ...overrides,
  };
}

export function makeProjectPayload(
  overrides: Partial<ProjectPayload> = {},
): ProjectPayload {
  const seq = nextSeq();

  return {
    name: `Project ${seq}`,
    description: `Project ${seq} description`,
    ...overrides,
  };
}

export function makeImportProjectPayload(
  overrides: Partial<ImportProjectPayload> = {},
): ImportProjectPayload {
  const seq = nextSeq();

  return {
    projectLocation: `/tmp/project-${seq}`,
    projectName: `Imported Project ${seq}`,
    ...overrides,
  };
}

export function makeShareableUser(
  overrides: Partial<ShareableUser> = {},
): ShareableUser {
  const seq = nextSeq();
  const id = overrides.id ?? String(seq);

  return {
    id,
    name: `User ${id}`,
    email: `user${id}@example.com`,
    ...overrides,
  };
}

export function makeProjectThumbnailOutputItem(
  overrides: Partial<ProjectThumbnailOutputItem> = {},
): ProjectThumbnailOutputItem {
  const seq = nextSeq();

  return {
    outputName: `output-${seq}`,
    outputClassName: "SetOfParticles",
    exists: true,
    thumbnailUrl: `/api/thumbnails/output-${seq}.png`,
    thumbnailRebuildUrl: `/api/thumbnails/output-${seq}/rebuild`,
    ...overrides,
  };
}

export function makeProjectThumbnailGroup(
  overrides: Partial<ProjectThumbnailGroup> = {},
): ProjectThumbnailGroup {
  const seq = nextSeq();

  return {
    protocolId: overrides.protocolId ?? seq,
    label: `Protocol ${seq}`,
    status: "done",
    outputs: overrides.outputs ?? [makeProjectThumbnailOutputItem()],
    ...overrides,
  };
}

export function makeOutputSelectorOutput(
  overrides: Partial<OutputSelectorTestOutput> = {},
): OutputSelectorTestOutput {
  const seq = nextSeq();

  return {
    parentId: overrides.parentId ?? seq,
    protocol: overrides.protocol ?? `Protocol ${seq}`,
    pointerClass: overrides.pointerClass ?? "SetOfParticles",
    paramClass: overrides.paramClass ?? "PointerParam",
    info: overrides.info ?? `Output info ${seq}`,
    value: overrides.value ?? `output-${seq}`,
    key: overrides.key ?? `key-${seq}`,
    _expectedClass: overrides._expectedClass,
    ...overrides,
  };
}