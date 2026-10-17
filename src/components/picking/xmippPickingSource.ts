// The coordinates viewer reading and saving a protocol's Xmipp picking session.
import type { Coords2dDataSource } from "@/components/analyze/coords2d-viewer";
import type { Id, ProjectService } from "@/services/ProjectService";

/** Protocols whose interactive step is Xmipp's particle picker. */
export const XMIPP_PICKING_PROTOCOLS = new Set(["XmippProtParticlePicking"]);

export function isXmippPickingProtocol(className: unknown): boolean {
  return typeof className === "string" && XMIPP_PICKING_PROTOCOLS.has(className);
}

function required<T>(method: T | undefined, name: string): T {
  if (!method) throw new Error(`The picking session is not available (${name}).`);
  return method;
}

export function xmippPickingSource(service: ProjectService, projectId: Id, protocolId: Id): Coords2dDataSource {
  return {
    key: `picking:${projectId}:${protocolId}`,
    listMicrographs: () =>
      required(service.fetchPickingSession, "session").call(service, projectId, protocolId),
    fetchCoordinates: async (micId) =>
      (await required(service.fetchPickingParticles, "particles").call(service, projectId, protocolId, micId)).coordinates,
    fetchImage: (micId, opts) =>
      required(service.fetchPickingMicrographImageObjectUrl, "image").call(service, projectId, protocolId, micId, opts),
    fetchThumbnail: (micId, opts) =>
      required(service.fetchPickingMicrographImageObjectUrl, "image").call(service, projectId, protocolId, micId, opts),
    createOutput: () =>
      required(service.createPickingCoordinates, "coordinates").call(service, projectId, protocolId),
    saveMicrograph: (micId, coordinates) =>
      required(service.savePickingParticles, "save").call(service, projectId, protocolId, micId, coordinates),
    saveBoxSize: (boxSize) =>
      required(service.savePickingSettings, "settings").call(service, projectId, protocolId, boxSize),
  };
}
