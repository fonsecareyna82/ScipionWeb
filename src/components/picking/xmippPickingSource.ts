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
  // Per micrograph, the score below which automatic particles are hidden.
  const thresholds = new Map<string, number>();
  return {
    key: `picking:${projectId}:${protocolId}`,
    listMicrographs: () =>
      required(service.fetchPickingSession, "session").call(service, projectId, protocolId),
    fetchCoordinates: async (micId) => {
      const particles = await required(service.fetchPickingParticles, "particles")
        .call(service, projectId, protocolId, micId);
      thresholds.set(String(micId), Number(particles.threshold ?? 0));
      // Session ids (m0, a0...) repeat between micrographs; the viewer needs them unique.
      return particles.coordinates.map((point) => ({ ...point, id: `${micId}:${point.id}` }));
    },
    getThreshold: (micId) => thresholds.get(String(micId)),
    fetchImage: (micId, opts) =>
      required(service.fetchPickingMicrographImageObjectUrl, "image").call(service, projectId, protocolId, micId, opts),
    fetchThumbnail: (micId, opts) =>
      required(service.fetchPickingMicrographImageObjectUrl, "image").call(service, projectId, protocolId, micId, opts),
    createOutput: () =>
      required(service.createPickingCoordinates, "coordinates").call(service, projectId, protocolId),
    saveMicrograph: async (micId, coordinates, threshold) => {
      const prefix = `${micId}:`;
      const sessionPoints = coordinates.map(({ id, x, y }) =>
        (id && id.startsWith(prefix) ? { id: id.slice(prefix.length), x, y } : { x, y }));
      await required(service.savePickingParticles, "save")
        .call(service, projectId, protocolId, micId, sessionPoints, threshold);
      if (threshold !== undefined) thresholds.set(String(micId), threshold);
    },
    saveBoxSize: (boxSize) =>
      required(service.savePickingSettings, "settings").call(service, projectId, protocolId, boxSize),
    supervised: service.trainPickingClassifier && service.correctPickingAndAutopickNext ? {
      train: (micId) => service.trainPickingClassifier!(projectId, protocolId, micId),
      next: (micId, nextMicId) =>
        service.correctPickingAndAutopickNext!(projectId, protocolId, micId, nextMicId),
    } : undefined,
  };
}
