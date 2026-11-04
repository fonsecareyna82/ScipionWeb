import { BASE_URL } from "@/config";
import { fetchWithAuth } from "./auth";
import { buildApiError, readPayload } from "./users";

// Whether this installation runs a facility, and the facility permissions of the signed-in user
export type FacilityStatus = { enabled: boolean; permissions: string[] };

export type MicroscopeStatus = "operational" | "maintenance" | "out_of_service";
export type GainFlip = "none" | "horizontal" | "vertical";

export type PixelSize = { magnification: number; pixelSize: number };

// A camera of a microscope, with its gain and its calibrated pixel size at each magnification
export type Detector = {
  id: number;
  name: string;
  // How the acquisition metadata names it (EPU: BM-Falcon, EF-CCD...): it tells which detector took a movie
  metadataName: string;
  energyFiltered: boolean;
  gainPath: string;
  gainFlip: GainFlip;
  gainRotation: 0 | 90 | 180 | 270;
  notes: string;
  pixelSizes: PixelSize[];
};

// A detector as a save sends it: without an id it is new
export type DetectorPayload = Omit<Detector, "id"> & { id?: number | null };

export type Microscope = {
  id: number;
  name: string;
  model: string;
  status: MicroscopeStatus;
  energyFilter: string;
  acquisitionSoftware: string;
  voltageKv: number | null;
  csMm: number | null;
  offloadPath: string;
  sessionsEnabled: boolean;
  notes: string;
  // How its sessions name their folders: its short code ({microscope}), its DATA and ATLAS folders' patterns
  // ({session}, {n}, {microscope}; no ATLAS pattern: no atlas) and how many grids its autoloader takes
  code: string;
  dataFolderPattern: string;
  atlasFolderPattern: string;
  gridSlots: number;
  detectors: Detector[];
  // When its photo was last changed; null without a photo
  photoUpdatedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type MicroscopePayload = Omit<Microscope, "id" | "createdAt" | "updatedAt" | "photoUpdatedAt" | "detectors"> & {
  detectors: DetectorPayload[];
};

async function request<T>(path: string, fallback: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(`${BASE_URL}${path}`, init);
  if (!response.ok) throw await buildApiError(response, fallback);
  return (await readPayload(response)) as T;
}

export const getFacilityStatus = () => request<FacilityStatus>("/facility/status", "Failed to read the facility mode");

let statusPromise: Promise<FacilityStatus> | null = null;

/** The facility status, read once per session (it only changes with the installation's settings). */
export function loadFacilityStatusOnce(): Promise<FacilityStatus> {
  if (!statusPromise) {
    statusPromise = getFacilityStatus().catch(() => {
      statusPromise = null;
      return { enabled: false, permissions: [] };
    });
  }
  return statusPromise;
}

export function resetFacilityStatus(): void {
  statusPromise = null;
}

export const listMicroscopes = () => request<Microscope[]>("/facility/microscopes", "Failed to load the microscopes");
export const createMicroscope = (payload: MicroscopePayload) =>
  request<Microscope>("/facility/microscopes", "Failed to create the microscope",
    { method: "POST", body: JSON.stringify(payload) });
export const updateMicroscope = (microscopeId: number, payload: MicroscopePayload) =>
  request<Microscope>(`/facility/microscopes/${microscopeId}`, "Failed to save the microscope",
    { method: "PUT", body: JSON.stringify(payload) });
export const deleteMicroscope = (microscopeId: number) =>
  request<null>(`/facility/microscopes/${microscopeId}`, "Failed to delete the microscope", { method: "DELETE" });

/** The microscope's photo as an object URL (the caller revokes it); the version keeps a changed photo from the cache. */
export async function fetchMicroscopePhotoUrl(microscopeId: number, version: string): Promise<string> {
  const response = await fetchWithAuth(
    `${BASE_URL}/facility/microscopes/${microscopeId}/photo?v=${encodeURIComponent(version)}`,
    { cache: "default" },
  );
  if (!response.ok) throw await buildApiError(response, "Failed to load the photo");
  return URL.createObjectURL(await response.blob());
}

export const uploadMicroscopePhoto = (microscopeId: number, file: Blob) =>
  request<Microscope>(`/facility/microscopes/${microscopeId}/photo`, "Failed to upload the photo",
    { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
export const deleteMicroscopePhoto = (microscopeId: number) =>
  request<Microscope>(`/facility/microscopes/${microscopeId}/photo`, "Failed to remove the photo", { method: "DELETE" });

// Samples (their NZ code), the boxes their grids were vitrified into, and the grids in each box
export type GridStatus = "stored" | "loaded" | "used" | "discarded";

// An image of a sample, box or grid: what it is; its bytes are read with fetchFacilityImageUrl
export type FacilityImage = { id: number; caption: string; createdAt?: string };
export type ImageOwnerKind = "sample" | "box" | "grid";

export type Grid = {
  id?: number | null;
  position: number;
  gridNumber: number | null;
  gridType: string;
  concentration: string;
  specimen: string;
  status: GridStatus;
  notes: string;
  images?: FacilityImage[];
};

export type GridBox = {
  id?: number | null;
  label: string;
  vitrificationCode: string;
  vitrifiedOn: string | null;
  notes: string;
  grids: Grid[];
  images?: FacilityImage[];
};

export type Sample = {
  id: number;
  code: string;
  description: string;
  groupId: number | null;
  groupName?: string | null;
  ownerId: number | null;
  ownerEmail?: string | null;
  ownerName?: string | null;
  accessRoute: string;
  notes: string;
  boxes: GridBox[];
  images?: FacilityImage[];
  createdAt?: string;
  updatedAt?: string;
};

export type SamplePayload = Pick<Sample, "code" | "description" | "groupId" | "ownerId" | "accessRoute" | "notes" | "boxes">;

export const listSamples = (text = "") =>
  request<Sample[]>(`/facility/samples${text ? `?q=${encodeURIComponent(text)}` : ""}`, "Failed to load the samples");
export const createSample = (payload: SamplePayload) =>
  request<Sample>("/facility/samples", "Failed to create the sample", { method: "POST", body: JSON.stringify(payload) });
export const updateSample = (sampleId: number, payload: SamplePayload) =>
  request<Sample>(`/facility/samples/${sampleId}`, "Failed to save the sample",
    { method: "PUT", body: JSON.stringify(payload) });
export const deleteSample = (sampleId: number) =>
  request<null>(`/facility/samples/${sampleId}`, "Failed to delete the sample", { method: "DELETE" });

const IMAGE_OWNER_PATHS: Record<ImageOwnerKind, string> = { sample: "samples", box: "boxes", grid: "grids" };

/** Keep an image (PNG, JPEG or WebP) with a sample, box or grid; answers it and the sample's new tree. */
export const addFacilityImage = (kind: ImageOwnerKind, ownerId: number, file: Blob, caption = "") =>
  request<{ image: FacilityImage; sample: Sample }>(
    `/facility/${IMAGE_OWNER_PATHS[kind]}/${ownerId}/images${caption ? `?caption=${encodeURIComponent(caption)}` : ""}`,
    "Failed to upload the image",
    { method: "POST", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });

/** Remove an image; answers the new tree of the sample (or the session) it was in. */
export const deleteFacilityImage = <T = Sample>(imageId: number) =>
  request<T>(`/facility/images/${imageId}`, "Failed to remove the image", { method: "DELETE" });

// An image never changes: its object URL is kept for the session
const imageUrls = new Map<number, Promise<string>>();

export function fetchFacilityImageUrl(imageId: number): Promise<string> {
  let url = imageUrls.get(imageId);
  if (!url) {
    url = fetchWithAuth(`${BASE_URL}/facility/images/${imageId}`, { cache: "default" }).then(async (response) => {
      if (!response.ok) throw await buildApiError(response, "Failed to load the image");
      return URL.createObjectURL(await response.blob());
    });
    url.catch(() => imageUrls.delete(imageId));
    imageUrls.set(imageId, url);
  }
  return url;
}

// Acquisition sessions: a stay on a microscope, and its datasets (the ATLAS and DATA_NN folders the microscope writes)
export type SessionStatus = "planned" | "acquiring" | "finished" | "archived";
export type SessionTechnique = "spa" | "tomo";
// What the list shows: the sessions to come or under way, all of them, or those in one status
export type SessionFilter = "active" | "all" | SessionStatus;

export type SessionGrid = {
  gridNumber: number | null;
  position: number;
  gridType: string;
  specimen: string;
  status: GridStatus;
  boxLabel: string;
  sampleId: number;
  sampleCode: string;
};

// Where a DATA is in its acquisition, as the watcher of the microscope's folders saw it
export type DatasetWatch = "receiving" | "stalled" | "acquired" | "idle" | "noOffload" | "pending" | "noFolder" | "waiting";

// What the first movie's metadata says (null: not read yet); error when it could not be read
export type DatasetAcquisition = {
  metadataFile?: string;
  error?: string;
  format?: string;
  cameraName?: string | null;
  detectorId?: number | null;
  detectorName?: string | null;
  instrument?: string | null;
  acquiredAt?: string | null;
  voltageKv?: number | null;
  magnification?: number | null;
  nominalPixelSize?: number | null;
  pixelSize?: number | null;
  pixelCalibrated?: boolean;
  frames?: number | null;
  exposureSeconds?: number | null;
  // On the sample, e-/Å² (null when the metadata does not tell it)
  totalDose?: number | null;
  dosePerFrame?: number | null;
  // That reached the camera, e-/Å²
  cameraDose?: number | null;
  gain?: string | null;
  gainFile?: string | null;
  firstMovie?: string;
  warnings?: string[];
};

// How a DATA's project goes: queued (asked for), running (being made), launched, or error (message says why)
export type DatasetProcessing = {
  state: "queued" | "running" | "launched" | "error";
  at?: string;
  message?: string;
  note?: string;
  projectName?: string;
  templateId?: string;
};

export type SessionDataset = {
  id: number;
  kind: "atlas" | "data";
  // 0 for the ATLAS, 1 to 12 for DATA_NN
  number: number;
  gridId: number | null;
  detectorId: number | null;
  detectorName?: string | null;
  notes: string;
  grid?: SessionGrid | null;
  // The folder the microscope writes it to, e.g. <session>_DATA_01
  folder: string;
  watch?: DatasetWatch | null;
  movieCount?: number;
  movieBytes?: number;
  firstMovieAt?: string | null;
  lastMovieAt?: string | null;
  acquisition?: DatasetAcquisition | null;
  projectId?: number | null;
  processing?: DatasetProcessing | null;
  // A tomography DATA's navigation report (tomo5-mapper): the staff also see whether one can be made, and why it failed
  navigation?: NavigationReportState | null;
  images?: FacilityImage[];
};

export type FacilitySession = {
  id: number;
  name: string;
  microscopeId: number;
  microscopeName: string;
  technique: SessionTechnique;
  status: SessionStatus;
  groupId: number | null;
  groupName?: string | null;
  userId: number | null;
  userEmail?: string | null;
  userName?: string | null;
  bookingRef: string;
  scheduledOn: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  notes: string;
  // What the technician tells the session's user (and the group's PI); notes are the staff's
  userNotes?: string;
  // The workflow template (an id of the Workflows list) each DATA's project is made from, and whether by itself
  templateId: string;
  autoProcess: boolean;
  // Every DATA in the session's project (each its own branch) instead of a project per DATA
  oneProject: boolean;
  // Its CTF limits (Å) for its DATA's CTF consensus; null keeps the template's
  ctfMinDefocus?: number | null;
  ctfMaxDefocus?: number | null;
  ctfMaxResolution?: number | null;
  datasets: SessionDataset[];
  images?: FacilityImage[];
  createdAt?: string;
  updatedAt?: string;
};

export type SessionDatasetPayload = {
  id?: number | null;
  kind?: "atlas" | "data";
  number?: number;
  gridId?: number | null;
  detectorId?: number | null;
  notes?: string;
};

export type SessionPayload = Pick<FacilitySession, "microscopeId" | "technique" | "status" | "groupId" | "userId"
  | "bookingRef" | "scheduledOn" | "notes" | "templateId" | "autoProcess" | "oneProject" | "userNotes"
  | "ctfMinDefocus" | "ctfMaxDefocus" | "ctfMaxResolution"> & {
  // Empty: the facility's name, YYYY_MM_DD_<Name-Surname>_<id>
  name: string;
  datasets: SessionDatasetPayload[];
};

export const listSessions = (filter: SessionFilter = "active", text = "") =>
  request<FacilitySession[]>(
    `/facility/sessions?status=${filter}${text ? `&q=${encodeURIComponent(text)}` : ""}`, "Failed to load the sessions");
export const createSession = (payload: SessionPayload) =>
  request<FacilitySession>("/facility/sessions", "Failed to create the session",
    { method: "POST", body: JSON.stringify(payload) });
export const updateSession = (sessionId: number, payload: SessionPayload) =>
  request<FacilitySession>(`/facility/sessions/${sessionId}`, "Failed to save the session",
    { method: "PUT", body: JSON.stringify(payload) });
export const deleteSession = (sessionId: number) =>
  request<null>(`/facility/sessions/${sessionId}`, "Failed to delete the session", { method: "DELETE" });

/** Keep an image with a session or one of its datasets; answers it and the session's new tree. */
export const addSessionImage = (kind: "session" | "dataset", ownerId: number, file: Blob, caption = "") =>
  request<{ image: FacilityImage; session: FacilitySession }>(
    `/facility/${kind === "session" ? "sessions" : "datasets"}/${ownerId}/images${caption ? `?caption=${encodeURIComponent(caption)}` : ""}`,
    "Failed to upload the image",
    { method: "POST", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });

/** A session as a save sends it back, e.g. to change only its status. */
export function sessionPayloadOf(session: FacilitySession): SessionPayload {
  return {
    name: session.name,
    microscopeId: session.microscopeId,
    technique: session.technique,
    status: session.status,
    groupId: session.groupId,
    userId: session.userId,
    bookingRef: session.bookingRef,
    scheduledOn: session.scheduledOn ? session.scheduledOn.slice(0, 10) : null,
    notes: session.notes,
    userNotes: session.userNotes ?? "",
    templateId: session.templateId ?? "",
    autoProcess: session.autoProcess ?? true,
    oneProject: session.oneProject ?? false,
    ctfMinDefocus: session.ctfMinDefocus ?? null,
    ctfMaxDefocus: session.ctfMaxDefocus ?? null,
    ctfMaxResolution: session.ctfMaxResolution ?? null,
    datasets: session.datasets.map((dataset) => ({
      id: dataset.id, kind: dataset.kind, number: dataset.number, gridId: dataset.gridId,
      detectorId: dataset.detectorId, notes: dataset.notes,
    })),
  };
}

/** Make a DATA's project now (again, after a failure); answers the session. */
export const processSessionDataset = (datasetId: number) =>
  request<FacilitySession>(`/facility/datasets/${datasetId}/process`, "Failed to ask for the DATA's project",
    { method: "POST" });

// The facility's own conventions: how it names its sessions (the microscopes name their folders)
export type FacilitySettings = {
  sessionNamePattern: string;
  // Days the data are kept once a session finished (0: not said), and how users take them home
  rawRetentionDays: number;
  processedRetentionDays: number;
  downloadInstructions: string;
  // Policies (the CNB's by default): who owns a DATA's project and how its user and group see it, the tolerance of
  // a detector's calibration against EPU's pixel (%), the minutes a DATA may go without movies, the watcher's seconds
  projectOwner: "staff" | "user";
  projectShareLevel: "view" | "work";
  calibrationTolerancePercent: number;
  stallMinutes: number;
  watchSeconds: number;
  // The CTF limits a new session starts with (Å)
  ctfMinDefocus: number;
  ctfMaxDefocus: number;
  ctfMaxResolution: number;
  // Where the facility is (Europe/Madrid): a booking's session is on the day it starts there
  timezone: string;
};
export type ConventionExamples = { session: string; atlas: string | null; data: string[] };
export type FacilityPreset = {
  id: string;
  label: string;
  settings: Partial<FacilitySettings>;
  microscope: { dataFolderPattern: string; atlasFolderPattern: string; gridSlots: number };
};
export type FacilitySettingsAnswer = {
  settings: FacilitySettings;
  defaults: FacilitySettings;
  examples: ConventionExamples;
  presets: FacilityPreset[];
};

export const getFacilitySettings = () =>
  request<FacilitySettingsAnswer>("/facility/settings", "Failed to load the facility's settings");
export const saveFacilitySettings = (settings: Partial<FacilitySettings>) =>
  request<FacilitySettingsAnswer>("/facility/settings", "Failed to save the facility's settings",
    { method: "PUT", body: JSON.stringify(settings) });

/** What patterns make for an example session; rejects with the reason when a pattern is wrong. */
export const previewConventions = (patterns: {
  sessionNamePattern?: string; dataFolderPattern?: string; atlasFolderPattern?: string; microscopeCode?: string;
}) => request<ConventionExamples>("/facility/settings/preview", "The pattern makes no name",
  { method: "POST", body: JSON.stringify(patterns) });

// Alerts: what went wrong in the sessions (a DATA without new movies, a failed processing or protocol)
export type FacilityAlertKind = "stalled" | "processingFailed" | "protocolFailed";
export type FacilityAlert = {
  id: number;
  kind: FacilityAlertKind;
  sessionId: number;
  sessionName: string;
  datasetId: number;
  folder: string;
  projectId: number | null;
  protocolId: string;
  microscopeName: string;
  message: string;
  openedAt: string;
  resolvedAt: string | null;
  // Who said they are on it, and when
  acknowledgedAt: string | null;
  acknowledgedBy: number | null;
  acknowledgedByName?: string | null;
  acknowledgedByEmail?: string | null;
  emailedAt: string | null;
  emailError: string | null;
};

export const listFacilityAlerts = (all = false) =>
  request<FacilityAlert[]>(`/facility/alerts${all ? "?all=true" : ""}`, "Failed to load the facility's alerts");
export const acknowledgeFacilityAlert = (alertId: number) =>
  request<FacilityAlert>(`/facility/alerts/${alertId}/acknowledge`, "Failed to take the alert", { method: "POST" });

// The mail server that tells the operators of the alerts; the password is never answered, only whether it is set
export type MailSecurity = "starttls" | "ssl" | "none";
export type FacilityMailSettings = {
  host: string;
  port: number;
  security: MailSecurity;
  user: string;
  sender: string;
  recipients: string;
  passwordSet: boolean;
  enabled: boolean;
};
export type FacilityMailPayload = Omit<FacilityMailSettings, "passwordSet" | "enabled"> & {
  // Left out (undefined): the password there is stays; "": it is removed
  password?: string;
};

export const getFacilityMailSettings = () =>
  request<FacilityMailSettings>("/facility/settings/mail", "Failed to load the mail settings");
export const saveFacilityMailSettings = (payload: FacilityMailPayload) =>
  request<FacilityMailSettings>("/facility/settings/mail", "Failed to save the mail settings",
    { method: "PUT", body: JSON.stringify(payload) });
export const sendFacilityTestMail = (to = "") =>
  request<{ sentTo: string[] }>("/facility/settings/mail/test", "The test mail did not go",
    { method: "POST", body: JSON.stringify({ to }) });

// What a user sees of the facility: their sessions and samples (and the group's, for its PI), read only
export type UserSession = Pick<FacilitySession, "id" | "name" | "microscopeName" | "technique" | "status" | "groupName"
  | "userName" | "userEmail" | "bookingRef" | "scheduledOn" | "startedAt" | "finishedAt" | "images"> & {
  userNotes: string;
  // Seen as the PI of its group, not as its user
  asPi: boolean;
  // Until when the facility keeps its data (null: not said, or the session has not finished)
  rawKeptUntil: string | null;
  processedKeptUntil: string | null;
  datasets: (Omit<SessionDataset, "notes" | "detectorId" | "gridId" | "processing"> & {
    processing: { state: DatasetProcessing["state"] } | null;
  })[];
};
export type MyFacility = {
  sessions: UserSession[];
  samples: Pick<Sample, "id" | "code" | "description" | "groupName" | "ownerName" | "ownerEmail" | "boxes" | "images" | "createdAt">[];
  isPi: boolean;
  downloadInstructions: string;
  rawRetentionDays: number;
  processedRetentionDays: number;
};

export const getMyFacility = () => request<MyFacility>("/facility/my-sessions", "Failed to load your sessions");

// The room's screen: each microscope's state and session, opened with its link's token (no signed-in user)
export type RoomState = "acquiring" | "preparing" | "idle" | "maintenance" | "outOfService";
export type RoomSession = {
  name: string;
  technique: SessionTechnique;
  status: SessionStatus;
  scheduledOn: string | null;
  startedAt: string | null;
  technician: string | null;
  user: string | null;
  pi: string | null;
  group: string | null;
  datasets: { number: number; folder: string; watch: DatasetWatch | null; movieCount: number;
              minutesSinceLastMovie: number | null; processing: DatasetProcessing["state"] | null; sample: string | null }[];
  alerts: { kind: FacilityAlertKind; folder: string; taken: boolean }[];
};
export type RoomView = {
  now: string;
  microscopes: { id: number; name: string; code: string; state: RoomState; photoVersion: string | null;
                 session: RoomSession | null }[];
  upcoming: { day: string; microscope: string; name: string; technique: SessionTechnique; user: string | null; pi: string | null }[];
};

/** The screen's view; rejects with status 404 for a link that is not (or no longer) valid. */
export async function getRoomView(token: string): Promise<RoomView> {
  const response = await fetch(`${BASE_URL}/facility/room?token=${encodeURIComponent(token)}`);
  if (!response.ok) {
    const error: Error & { status?: number } = new Error(response.status === 404 ? "This link is not valid" : "The screen could not load");
    error.status = response.status;
    throw error;
  }
  return (await response.json()) as RoomView;
}

export const roomMicroscopePhotoUrl = (microscopeId: number, token: string, version: string) =>
  `${BASE_URL}/facility/room/microscopes/${microscopeId}/photo?token=${encodeURIComponent(token)}&v=${encodeURIComponent(version)}`;

export type RoomScreenLink = { enabled: boolean; token: string | null; createdAt?: string | null };
export const getRoomScreenLink = () =>
  request<RoomScreenLink>("/facility/settings/room-screen", "Failed to load the room screen's link");
export const makeRoomScreenLink = () =>
  request<RoomScreenLink>("/facility/settings/room-screen", "Failed to make a new link", { method: "POST" });
export const turnOffRoomScreen = () =>
  request<RoomScreenLink>("/facility/settings/room-screen", "Failed to turn the room screen off", { method: "DELETE" });

// Bookings: what can be booked (a microscope, a plunger, a confocal…), and the times asked for and given
export type ResourceUnit = "session" | "hour" | "half_hour" | "service";
export type FacilityResource = {
  id: number;
  name: string;
  // A microscope's resource: its confirmed bookings get a planned session when it runs sessions
  microscopeId: number | null;
  microscopeName: string | null;
  runsSessions: boolean;
  color: string;
  unit: ResourceUnit;
  // The shortest and longest a user may ask for (the facility books as it needs)
  minHours: number | null;
  maxHours: number | null;
  // When its day starts (the Talos': 09:00 to 08:59 the next day)
  dayStart: string;
  requiresAuthorization: boolean;
  active: boolean;
  notes: string;
};
export type ResourcePayload = Omit<FacilityResource, "id" | "microscopeName" | "runsSessions">;

export type BookingKind = "booking" | "downtime" | "maintenance" | "special";
export type BookingStatus = "requested" | "confirmed" | "alternative" | "rejected" | "cancelled";
// A booking as the signed-in user may see it: the facility, all of it; a user, theirs (mine) and, of the others',
// only the resource, its kind and its time
export type FacilityBooking = {
  id: number;
  resourceId: number;
  resourceName: string;
  resourceColor: string;
  kind: BookingKind;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  title: string;
  mine: boolean;
  microscopeId?: number | null;
  proposedStartsAt?: string | null;
  proposedEndsAt?: string | null;
  ownerId?: number | null;
  ownerName?: string;
  ownerEmail?: string | null;
  groupId?: number | null;
  groupName?: string | null;
  operatorId?: number | null;
  operatorName?: string;
  technique?: "spa" | "tomo" | null;
  // 0 the facility … 4 external
  priority?: number | null;
  justification?: string;
  notes?: string;
  requestedByName?: string;
  decidedByName?: string;
  decidedAt?: string | null;
  decisionReason?: string;
  sessionId?: number | null;
  sessionName?: string | null;
  sessionStatus?: string | null;
  createdAt?: string;
};
export type BookingPayload = {
  resourceId?: number;
  kind?: BookingKind;
  startsAt?: string;
  endsAt?: string;
  title?: string;
  ownerId?: number | null;
  groupId?: number | null;
  operatorId?: number | null;
  technique?: "spa" | "tomo" | null;
  priority?: number | null;
  justification?: string;
  notes?: string;
};
export type BookingDecision =
  | { action: "confirm" | "reject"; reason?: string; priority?: number | null }
  | { action: "propose"; reason?: string; proposedStartsAt: string; proposedEndsAt: string; priority?: number | null };
export type MyBookings = { bookings: FacilityBooking[]; groups: { id: number; name: string; groupRole: string }[] };

export const listResources = () => request<FacilityResource[]>("/facility/resources", "Failed to load the resources");
export const createResource = (resource: ResourcePayload) =>
  request<FacilityResource>("/facility/resources", "Failed to add the resource",
    { method: "POST", body: JSON.stringify(resource) });
export const updateResource = (resourceId: number, resource: ResourcePayload) =>
  request<FacilityResource>(`/facility/resources/${resourceId}`, "Failed to save the resource",
    { method: "PUT", body: JSON.stringify(resource) });
export const deleteResource = (resourceId: number) =>
  request<void>(`/facility/resources/${resourceId}`, "Failed to delete the resource", { method: "DELETE" });

export function listBookings(range: { start: string; end: string; statuses?: BookingStatus[] }) {
  const query = new URLSearchParams({ start: range.start, end: range.end });
  (range.statuses ?? []).forEach((value) => query.append("status", value));
  return request<FacilityBooking[]>(`/facility/bookings?${query}`, "Failed to load the bookings");
}
export const listOpenBookingRequests = () =>
  request<FacilityBooking[]>("/facility/bookings?status=requested&status=alternative", "Failed to load the requests");
export const getMyBookings = () => request<MyBookings>("/facility/my-bookings", "Failed to load your bookings");
export const createBooking = (booking: BookingPayload) =>
  request<FacilityBooking>("/facility/bookings", "Failed to book", { method: "POST", body: JSON.stringify(booking) });
export const updateBooking = (bookingId: number, booking: BookingPayload) =>
  request<FacilityBooking>(`/facility/bookings/${bookingId}`, "Failed to change the booking",
    { method: "PUT", body: JSON.stringify(booking) });
export const decideBooking = (bookingId: number, decision: BookingDecision) =>
  request<FacilityBooking>(`/facility/bookings/${bookingId}/decision`, "Failed to answer the request",
    { method: "POST", body: JSON.stringify(decision) });
export const answerBooking = (bookingId: number, accept: boolean) =>
  request<FacilityBooking>(`/facility/bookings/${bookingId}/answer`, "Failed to answer",
    { method: "POST", body: JSON.stringify({ accept }) });
export const cancelBooking = (bookingId: number, reason = "") =>
  request<FacilityBooking>(`/facility/bookings/${bookingId}/cancel`, "Failed to cancel the booking",
    { method: "POST", body: JSON.stringify({ reason }) });

// The navigation report of a tomography DATA (atlas, search maps, tomogram positions, tilt series), by tomo5-mapper
export type NavigationReportState = {
  state: "none" | "making" | "done" | "failed";
  startedAt?: string | null;
  finishedAt?: string | null;
  message?: string | null;
  // Whether this installation has tomo5-mapper (the staff's answers only)
  available?: boolean;
  sizeBytes?: number | null;
};

export const getNavigationReport = (datasetId: number) =>
  request<NavigationReportState>(`/facility/datasets/${datasetId}/navigation`, "Failed to load the report's state");
export const makeNavigationReport = (datasetId: number) =>
  request<NavigationReportState>(`/facility/datasets/${datasetId}/navigation`, "Failed to make the report",
    { method: "POST" });

/** The report as a page of this origin (an object URL): it is a self-contained HTML. */
export async function fetchNavigationReportUrl(datasetId: number): Promise<string> {
  const response = await fetchWithAuth(`${BASE_URL}/facility/datasets/${datasetId}/navigation/report`);
  if (!response.ok) throw await buildApiError(response, "Failed to open the report");
  return URL.createObjectURL(new Blob([await response.blob()], { type: "text/html" }));
}

