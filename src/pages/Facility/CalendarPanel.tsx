import { useCallback, useEffect, useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { DateSelectArg, DatesSetArg, EventClickArg, EventInput } from "@fullcalendar/core";
import {
    Alert, Box, Button, Card, CardContent, CardHeader, Chip, Dialog, FormControl, InputLabel, MenuItem, Select, Stack,
    TextField, Typography,
} from "@mui/material";
import { CalendarPlus, Check, Clock, Settings2, X } from "lucide-react";
import toast from "react-hot-toast";

import SettingsDialog, { ROUNDED_BUTTON_SX } from "@/pages/Settings/SettingsDialog";
import { listGroupNames } from "@/api/access";
import { loadCurrentUserOnce } from "@/api/auth";
import { listUsers } from "@/api/projects";
import {
    answerBooking, cancelBooking, createBooking, decideBooking, getMyBookings, listBookings, listOpenBookingRequests,
    listResources, updateBooking,
    type BookingKind, type BookingPayload, type BookingStatus, type FacilityBooking, type FacilityResource, type MyBookings,
} from "@/api/facility";
import { FACILITY_TEXT } from "./facilityStyles";
import ResourcesDialog, { resourceColor } from "./ResourcesDialog";

type PanelStyles = {
    fieldSx: any;
    cardSx: any;
    cardHeaderSx: any;
    selectSx?: any;
    menuPaperSx?: any;
    actionButtonSx?: any;
    saveButtonSx?: any;
    colors: { border: string; text: string; muted: string; surface: string; hover: string };
};
type Person = { id: number; email: string; firstName?: string | null; lastName?: string | null };
type Named = { id: number; name: string };

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
    requested: "Waiting for the facility",
    alternative: "Another time offered",
    confirmed: "Confirmed",
    rejected: "Not accepted",
    cancelled: "Cancelled",
};
const KIND_LABELS: Record<BookingKind, string> = {
    booking: "Booking",
    downtime: "Downtime",
    maintenance: "Maintenance",
    special: "Special use",
};
// The level of a request (spec of the facility: who has which is the facility's to say)
export const PRIORITY_LABELS: Record<number, string> = {
    0: "0 · Facility",
    1: "1 · Committed (contract, Instruct)",
    2: "2 · Internal",
    3: "3 · Academic",
    4: "4 · External",
};
const TECHNIQUE_LABELS = { spa: "SPA", tomo: "Tomography" } as const;
const BLOCK_COLOR = "#6b7280";
const FILTER_KEY = "scipionweb.facility.calendarResources";

function pad(value: number): string {
    return String(value).padStart(2, "0");
}

/** A moment as a datetime-local field shows it, in the browser's time. */
export function toLocalInput(value: string | Date | null | undefined): string {
    if (!value) return "";
    const date = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A datetime-local value (the browser's time) as the API takes it, with its time zone. */
export function fromLocalInput(value: string): string {
    return new Date(value).toISOString();
}

export function formatWhen(start: string, end: string): string {
    const from = new Date(start);
    const to = new Date(end);
    const day = (date: Date) => date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    const time = (date: Date) => date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const sameDay = from.toDateString() === to.toDateString();
    return sameDay ? `${day(from)}, ${time(from)}–${time(to)}` : `${day(from)} ${time(from)} → ${day(to)} ${time(to)}`;
}

function hoursBetween(start: string, end: string): number {
    return (new Date(end).getTime() - new Date(start).getTime()) / 3600000;
}

function describeHours(hours: number): string {
    if (!Number.isFinite(hours) || hours <= 0) return "";
    if (hours >= 24 && Number.isInteger(hours / 24)) return `${hours / 24} day${hours === 24 ? "" : "s"}`;
    return `${Math.round(hours * 10) / 10} h`;
}

function personName(person: Person): string {
    return `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim() || person.email;
}

function limitsOf(resource: FacilityResource | undefined): string {
    if (!resource) return "";
    const parts: string[] = [];
    if (resource.minHours && resource.maxHours) parts.push(`booked for ${describeHours(resource.minHours)} to ${describeHours(resource.maxHours)}`);
    else if (resource.minHours) parts.push(`booked for ${describeHours(resource.minHours)} at least`);
    else if (resource.maxHours) parts.push(`booked for ${describeHours(resource.maxHours)} at most`);
    if (resource.unit === "session") parts.push(`its day starts at ${resource.dayStart}`);
    return parts.length ? `${resource.name} is ${parts.join("; ")}.` : "";
}

/** The day a selection of whole days starts and ends on, at the time the resource's day starts. */
function atDayStart(date: Date, dayStart: string): Date {
    const [hours, minutes] = dayStart.split(":").map(Number);
    const moved = new Date(date);
    moved.setHours(hours || 0, minutes || 0, 0, 0);
    return moved;
}

function readFilter(): number[] {
    try {
        const stored = JSON.parse(localStorage.getItem(FILTER_KEY) ?? "[]");
        return Array.isArray(stored) ? stored.filter((value) => typeof value === "number") : [];
    } catch {
        return [];
    }
}

function writeFilter(ids: number[]) {
    try {
        localStorage.setItem(FILTER_KEY, JSON.stringify(ids));
    } catch {
        // Only a convenience
    }
}

function StatusChip({ status }: { status: BookingStatus }) {
    const color = status === "confirmed" ? "success" : status === "requested" ? "warning"
        : status === "alternative" ? "info" : "default";
    return <Chip size="small" color={color as any} variant={status === "confirmed" ? "filled" : "outlined"}
                 label={BOOKING_STATUS_LABELS[status]} sx={{ fontSize: FACILITY_TEXT.badge, fontWeight: 600 }} />;
}

/** The facility's calendar: who has which resource when, the requests waiting, and one's own bookings. */
export default function CalendarPanel(props: PanelStyles & { isStaff: boolean; isManager: boolean }) {
    const { cardSx, cardHeaderSx, colors, isStaff, isManager } = props;
    const actionSx = props.actionButtonSx ?? ROUNDED_BUTTON_SX;
    const saveSx = props.saveButtonSx ?? ROUNDED_BUTTON_SX;
    const [resources, setResources] = useState<FacilityResource[]>([]);
    const [shown, setShown] = useState<number[]>(readFilter);
    const [range, setRange] = useState<{ start: string; end: string } | null>(null);
    const [bookings, setBookings] = useState<FacilityBooking[]>([]);
    const [requests, setRequests] = useState<FacilityBooking[]>([]);
    const [mine, setMine] = useState<MyBookings | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<{ booking?: FacilityBooking; initial?: BookingPayload } | null>(null);
    const [deciding, setDeciding] = useState<{ booking: FacilityBooking; action: "confirm" | "propose" | "reject" } | null>(null);
    const [opened, setOpened] = useState<FacilityBooking | null>(null);
    const [managing, setManaging] = useState(false);

    const loadResources = useCallback(() => {
        listResources().then(setResources).catch((e: any) => setError(String(e?.message || "Failed to load the resources")));
    }, []);

    const reload = useCallback(() => {
        if (range) listBookings(range).then(setBookings).catch((e: any) => toast.error(String(e?.message || e)));
        if (isStaff) listOpenBookingRequests().then(setRequests).catch(() => setRequests([]));
        getMyBookings().then(setMine).catch(() => setMine(null));
    }, [range, isStaff]);

    useEffect(() => loadResources(), [loadResources]);
    useEffect(() => reload(), [reload]);

    const byId = useMemo(() => new Map(resources.map((resource) => [resource.id, resource])), [resources]);
    const usable = resources.filter((resource) => resource.active);
    const toggle = (resourceId: number) => {
        setShown((current) => {
            const next = current.includes(resourceId) ? current.filter((id) => id !== resourceId) : [...current, resourceId];
            writeFilter(next);
            return next;
        });
    };
    const visible = (booking: FacilityBooking) => shown.length === 0 || shown.includes(booking.resourceId);

    const events: EventInput[] = useMemo(() => bookings
        .filter((booking) => booking.status !== "rejected" && booking.status !== "cancelled" && visible(booking))
        .flatMap((booking) => {
            const color = booking.kind === "booking" ? resourceColor(byId.get(booking.resourceId)) : BLOCK_COLOR;
            const who = booking.kind !== "booking" ? KIND_LABELS[booking.kind]
                : isStaff ? (booking.ownerName || booking.title || "Booked")
                : booking.mine ? "Yours" : "Booked";
            const firm = booking.status === "confirmed";
            const items: EventInput[] = [{
                id: String(booking.id),
                title: `${booking.resourceName} · ${who}${firm ? "" : ` (${BOOKING_STATUS_LABELS[booking.status].toLowerCase()})`}`,
                start: booking.startsAt,
                end: booking.endsAt,
                backgroundColor: firm ? color : "transparent",
                borderColor: color,
                textColor: firm ? "#ffffff" : color,
                extendedProps: { booking },
            }];
            if (booking.status === "alternative" && booking.proposedStartsAt && booking.proposedEndsAt) {
                items.push({
                    id: `${booking.id}-offered`, title: `${booking.resourceName} · offered instead`,
                    start: booking.proposedStartsAt, end: booking.proposedEndsAt, backgroundColor: "transparent",
                    borderColor: color, textColor: color, extendedProps: { booking },
                });
            }
            return items;
        }), [bookings, byId, isStaff, shown]); // eslint-disable-line react-hooks/exhaustive-deps

    const onSelect = (selection: DateSelectArg) => {
        const resourceId = shown.length === 1 ? shown[0] : usable[0]?.id;
        const resource = resourceId != null ? byId.get(resourceId) : undefined;
        let start = selection.start;
        let end = selection.end;
        if (selection.allDay && resource) {
            start = atDayStart(start, resource.dayStart);
            end = atDayStart(end, resource.dayStart);
        }
        selection.view.calendar.unselect();
        setEditing({ initial: { resourceId, startsAt: start.toISOString(), endsAt: end.toISOString() } });
    };
    const onEventClick = (click: EventClickArg) => {
        const booking = click.event.extendedProps.booking as FacilityBooking;
        if (isStaff || booking.mine) setOpened(booking);
    };
    const onDatesSet = (dates: DatesSetArg) => {
        setRange((current) => (current?.start === dates.start.toISOString() && current?.end === dates.end.toISOString()
            ? current : { start: dates.start.toISOString(), end: dates.end.toISOString() }));
    };
    const done = () => {
        setEditing(null);
        setDeciding(null);
        setOpened(null);
        reload();
    };

    const myOpen = (mine?.bookings ?? []).filter((booking) => booking.status !== "rejected" && booking.status !== "cancelled"
        && new Date(booking.endsAt).getTime() > Date.now());
    const queue = [...requests].sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9)
        || String(a.createdAt).localeCompare(String(b.createdAt)));

    if (error) return <Alert severity="error">{error}</Alert>;

    return (
        <Stack spacing={2}>
            {isStaff && queue.length > 0 && (
                <Card variant="outlined" sx={cardSx}>
                    <CardHeader title={`Requests waiting (${queue.length})`}
                                subheader="Highest priority first, then the oldest. Confirm, offer another time or reject: the user is told by mail when the facility's mail is on."
                                sx={cardHeaderSx} />
                    <CardContent sx={{ pt: 2 }}>
                        <Stack spacing={1.5}>
                            {queue.map((booking) => (
                                <Box key={booking.id} role="group" aria-label={`Request ${booking.id}`}
                                     sx={{ border: `1px solid ${colors.border}`, borderRadius: 2, p: 1.75 }}>
                                    <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }}>
                                        <Box sx={{ minWidth: 0, flex: 1, cursor: "pointer" }} onClick={() => setOpened(booking)}>
                                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                                                <Box sx={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                                                           bgcolor: resourceColor(byId.get(booking.resourceId)) }} />
                                                <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle, fontWeight: 700, color: colors.text }}>
                                                    {booking.resourceName} · {formatWhen(booking.startsAt, booking.endsAt)}
                                                </Typography>
                                                <StatusChip status={booking.status} />
                                            </Stack>
                                            <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.muted }}>
                                                {[booking.ownerName || booking.ownerEmail, booking.groupName && `group ${booking.groupName}`,
                                                  booking.technique && TECHNIQUE_LABELS[booking.technique],
                                                  booking.priority != null && `priority ${booking.priority}`].filter(Boolean).join(" · ")}
                                            </Typography>
                                            {booking.justification && (
                                                <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.text, mt: 0.5 }}>
                                                    “{booking.justification}”
                                                </Typography>
                                            )}
                                        </Box>
                                        {booking.status === "requested" ? (
                                            <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                                                <Button size="small" variant="contained" sx={saveSx} startIcon={<Check size={14} />}
                                                        onClick={() => setDeciding({ booking, action: "confirm" })}>Confirm</Button>
                                                <Button size="small" variant="outlined" sx={actionSx} startIcon={<Clock size={14} />}
                                                        onClick={() => setDeciding({ booking, action: "propose" })}>Other time</Button>
                                                <Button size="small" variant="outlined" sx={{ ...actionSx, color: "error.main" }}
                                                        startIcon={<X size={14} />}
                                                        onClick={() => setDeciding({ booking, action: "reject" })}>Reject</Button>
                                            </Stack>
                                        ) : (
                                            <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, flexShrink: 0 }}>
                                                Waiting for the user's answer
                                            </Typography>
                                        )}
                                    </Stack>
                                </Box>
                            ))}
                        </Stack>
                    </CardContent>
                </Card>
            )}

            {/* A user always sees where their requests go, even before the first one; the staff only when they have some */}
            {mine !== null && (myOpen.length > 0 || !isStaff) && (
                <Card variant="outlined" sx={cardSx}>
                    <CardHeader title="My bookings" sx={cardHeaderSx} />
                    <CardContent sx={{ pt: 2 }}>
                        {myOpen.length === 0 && (
                            <Typography data-testid="my-bookings-empty" sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.muted }}>
                                No bookings to come. Ask for time below: your requests wait here until the facility
                                confirms them or offers another time.
                            </Typography>
                        )}
                        <Stack spacing={1.25}>
                            {myOpen.map((booking) => (
                                <Stack key={booking.id} direction={{ xs: "column", sm: "row" }} spacing={1.5}
                                       alignItems={{ sm: "center" }}
                                       sx={{ border: `1px solid ${colors.border}`, borderRadius: 2, p: 1.5 }}>
                                    <Box sx={{ minWidth: 0, flex: 1, cursor: "pointer" }} onClick={() => setOpened(booking)}>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle, fontWeight: 700, color: colors.text }}>
                                                {booking.resourceName} · {formatWhen(booking.startsAt, booking.endsAt)}
                                            </Typography>
                                            <StatusChip status={booking.status} />
                                        </Stack>
                                        {booking.status === "alternative" && booking.proposedStartsAt && booking.proposedEndsAt && (
                                            <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.text, mt: 0.5 }}>
                                                The facility offers {formatWhen(booking.proposedStartsAt, booking.proposedEndsAt)}
                                                {booking.decisionReason ? `: ${booking.decisionReason}` : ""}
                                            </Typography>
                                        )}
                                    </Box>
                                    {booking.status === "alternative" && (
                                        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                                            <Button size="small" variant="contained" sx={saveSx}
                                                    onClick={() => void answerBooking(booking.id, true)
                                                        .then(() => { toast.success("Booked at the time offered."); reload(); })
                                                        .catch((e: any) => toast.error(String(e?.message || e)))}>
                                                Take it
                                            </Button>
                                            <Button size="small" variant="outlined" sx={actionSx}
                                                    onClick={() => void answerBooking(booking.id, false)
                                                        .then(() => { toast.success("Declined."); reload(); })
                                                        .catch((e: any) => toast.error(String(e?.message || e)))}>
                                                Decline
                                            </Button>
                                        </Stack>
                                    )}
                                </Stack>
                            ))}
                        </Stack>
                    </CardContent>
                </Card>
            )}

            <Card variant="outlined" sx={cardSx}>
                <CardHeader
                    title="Calendar"
                    subheader={isStaff
                        ? "Every resource's bookings and blocks. Drag over a time to book it or block it; click a booking to see it, move it or cancel it."
                        : "When each resource is taken. Drag over a free time (or pick days in the month) to ask for it: the facility confirms it or offers another."}
                    sx={cardHeaderSx}
                    action={
                        <Stack direction="row" spacing={1}>
                            {isManager && (
                                <Button size="small" variant="outlined" sx={actionSx} startIcon={<Settings2 size={15} />}
                                        onClick={() => setManaging(true)}>
                                    Resources
                                </Button>
                            )}
                            <Button size="small" variant="contained" sx={saveSx} startIcon={<CalendarPlus size={15} />}
                                    disabled={usable.length === 0}
                                    onClick={() => setEditing({ initial: { resourceId: shown.length === 1 ? shown[0] : usable[0]?.id } })}>
                                {isStaff ? "New booking" : "Ask for time"}
                            </Button>
                        </Stack>
                    }
                />
                <CardContent sx={{ pt: 2 }}>
                    <Stack spacing={2}>
                        {resources.length === 0 ? (
                            <Alert severity="info">Nothing can be booked yet{isManager ? ": add the resources" : ""}.</Alert>
                        ) : (
                            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" aria-label="Resources shown">
                                {usable.map((resource) => {
                                    const on = shown.length === 0 || shown.includes(resource.id);
                                    return (
                                        <Chip key={resource.id} clickable onClick={() => toggle(resource.id)}
                                              aria-pressed={shown.includes(resource.id)}
                                              label={resource.name} variant={on ? "filled" : "outlined"}
                                              icon={<Box component="span" sx={{ width: 10, height: 10, borderRadius: "50%", ml: "8px !important",
                                                                                bgcolor: resourceColor(resource) }} />}
                                              sx={{ fontSize: FACILITY_TEXT.itemLine, opacity: on ? 1 : 0.6 }} />
                                    );
                                })}
                                {shown.length > 0 && (
                                    <Button size="small" sx={{ textTransform: "none", fontSize: FACILITY_TEXT.note }}
                                            onClick={() => { setShown([]); writeFilter([]); }}>
                                        Show all
                                    </Button>
                                )}
                            </Stack>
                        )}
                        <Box sx={{ "& .fc": { fontSize: 14 }, "& .fc-event": { cursor: "pointer" } }}>
                            <FullCalendar
                                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                                initialView="timeGridWeek"
                                firstDay={1}
                                headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }}
                                buttonText={{ today: "Today", month: "Month", week: "Week", day: "Day" }}
                                nowIndicator
                                selectable
                                selectMirror
                                allDaySlot={false}
                                slotDuration="01:00:00"
                                height="auto"
                                eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
                                slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
                                events={events}
                                select={onSelect}
                                eventClick={onEventClick}
                                datesSet={onDatesSet}
                            />
                        </Box>
                    </Stack>
                </CardContent>
            </Card>

            {editing && (
                <BookingDialog {...props} booking={editing.booking} initial={editing.initial} resources={resources}
                               isStaff={isStaff} myGroups={mine?.groups ?? []} onClose={() => setEditing(null)} onSaved={done} />
            )}
            {deciding && (
                <DecisionDialog {...props} booking={deciding.booking} action={deciding.action}
                                onClose={() => setDeciding(null)} onDone={done} />
            )}
            {opened && (
                <BookingDetails {...props} booking={opened} isStaff={isStaff}
                                onClose={() => setOpened(null)} onChanged={done}
                                onEdit={() => { setEditing({ booking: opened }); setOpened(null); }}
                                onDecide={(action) => { setDeciding({ booking: opened, action }); setOpened(null); }} />
            )}
            {managing && (
                <ResourcesDialog {...props} onClose={() => { setManaging(false); loadResources(); reload(); }} />
            )}
        </Stack>
    );
}

/** Ask for time (a user), or book or block a resource (the facility); also changes one. */
function BookingDialog({ booking, initial, resources, isStaff, myGroups, fieldSx, selectSx, menuPaperSx, colors,
                         actionButtonSx, saveButtonSx, onClose, onSaved }: PanelStyles & {
    booking?: FacilityBooking;
    initial?: BookingPayload;
    resources: FacilityResource[];
    isStaff: boolean;
    myGroups: { id: number; name: string }[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const source: Partial<BookingPayload> = booking ?? initial ?? {};
    const [resourceId, setResourceId] = useState<number | "">((source.resourceId as number) ?? "");
    const [kind, setKind] = useState<BookingKind>((booking?.kind ?? initial?.kind ?? "booking") as BookingKind);
    const [start, setStart] = useState(toLocalInput(source.startsAt ?? null));
    const [end, setEnd] = useState(toLocalInput(source.endsAt ?? null));
    const [technique, setTechnique] = useState<"spa" | "tomo">((booking?.technique ?? "spa") as "spa" | "tomo");
    const [ownerId, setOwnerId] = useState<number | "">(booking?.ownerId ?? "");
    const [groupId, setGroupId] = useState<number | "">(booking?.groupId ?? (isStaff ? "" : myGroups[0]?.id ?? ""));
    const [priority, setPriority] = useState<number | "">(booking?.priority ?? "");
    const [title, setTitle] = useState(booking?.title ?? "");
    const [justification, setJustification] = useState(booking?.justification ?? "");
    const [notes, setNotes] = useState(booking?.notes ?? "");
    const [people, setPeople] = useState<Person[]>([]);
    const [groups, setGroups] = useState<Named[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isStaff) return;
        void Promise.all([listUsers().catch(() => [] as Person[]), listGroupNames().catch(() => [] as Named[]),
                          loadCurrentUserOnce().catch(() => null)])
            .then(([users, loadedGroups, me]) => {
                const everyone = [...(me ? [me as Person] : []), ...(users as Person[])];
                setPeople(everyone.filter((person, index) => everyone.findIndex((other) => other.id === person.id) === index));
                setGroups(loadedGroups);
                if (!booking && me && (initial?.kind ?? "booking") === "booking") setOwnerId((me as Person).id);
            });
    }, [isStaff]); // eslint-disable-line react-hooks/exhaustive-deps

    const resource = resources.find((candidate) => candidate.id === resourceId);
    const choices = resources.filter((candidate) => candidate.active || candidate.id === resourceId);
    const duration = start && end ? hoursBetween(fromLocalInput(start), fromLocalInput(end)) : 0;
    const isBooking = kind === "booking";
    // A user asks for a time to come; the dates are typed in the browser's own order, so say which were read
    const past = !isStaff && start !== "" && new Date(fromLocalInput(start)).getTime() <= Date.now();
    const valid = resourceId !== "" && start !== "" && end !== "" && duration > 0 && !past;

    const save = async () => {
        if (!valid) return;
        const payload: BookingPayload = {
            resourceId: resourceId as number,
            startsAt: fromLocalInput(start),
            endsAt: fromLocalInput(end),
            justification,
            groupId: groupId === "" ? null : groupId,
        };
        if (resource?.microscopeId != null && isBooking) payload.technique = technique;
        if (isStaff) {
            Object.assign(payload, { kind, title, notes, priority: priority === "" ? null : priority,
                                     ownerId: isBooking && ownerId !== "" ? ownerId : null });
        }
        setSaving(true);
        try {
            if (booking) await updateBooking(booking.id, payload);
            else await createBooking(payload);
            toast.success(booking ? "Booking changed." : isStaff ? "Booked." : "Asked: the facility will answer.");
            onSaved();
        } catch (e: any) {
            toast.error(String(e?.message || e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <SettingsDialog
            title={booking ? "Change the booking" : isStaff ? "New booking" : "Ask for time"}
            description={isStaff
                ? "A booking for a user (confirmed at once), or a block of the resource. A microscope's confirmed booking gets its planned session."
                : "Ask the facility for a resource: it confirms your time or offers another, and tells you."}
            icon={<CalendarPlus size={20} color="white" />}
            confirmLabel={booking ? "Save" : isStaff ? "Book" : "Ask"}
            busyLabel="Saving…"
            busy={saving}
            confirmDisabled={!valid}
            maxWidth="md"
            actionButtonSx={actionButtonSx}
            saveButtonSx={saveButtonSx}
            onConfirm={() => void save()}
            onClose={onClose}
        >
            <Stack spacing={2.5} sx={{ pt: 1 }}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <FormControl size="small" fullWidth>
                        <InputLabel id="booking-resource-label">Resource</InputLabel>
                        <Select labelId="booking-resource-label" label="Resource" sx={selectSx} value={resourceId}
                                MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                                onChange={(e) => setResourceId(Number(e.target.value))}>
                            {choices.map((candidate) => (
                                <MenuItem key={candidate.id} value={candidate.id}>{candidate.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    {isStaff && (
                        <FormControl size="small" fullWidth>
                            <InputLabel id="booking-kind-label">Kind</InputLabel>
                            <Select labelId="booking-kind-label" label="Kind" sx={selectSx} value={kind}
                                    MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                                    onChange={(e) => setKind(e.target.value as BookingKind)}>
                                {(Object.keys(KIND_LABELS) as BookingKind[]).map((value) => (
                                    <MenuItem key={value} value={value}>{KIND_LABELS[value]}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    )}
                    {resource?.microscopeId != null && isBooking && (
                        <FormControl size="small" fullWidth>
                            <InputLabel id="booking-technique-label">Technique</InputLabel>
                            <Select labelId="booking-technique-label" label="Technique" sx={selectSx} value={technique}
                                    MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                                    onChange={(e) => setTechnique(e.target.value as "spa" | "tomo")}>
                                <MenuItem value="spa">SPA</MenuItem>
                                <MenuItem value="tomo">Tomography</MenuItem>
                            </Select>
                        </FormControl>
                    )}
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
                    <TextField sx={fieldSx} size="small" fullWidth type="datetime-local" label="From" value={start}
                               InputLabelProps={{ shrink: true }} onChange={(e) => setStart(e.target.value)} />
                    <TextField sx={fieldSx} size="small" fullWidth type="datetime-local" label="To" value={end}
                               InputLabelProps={{ shrink: true }} onChange={(e) => setEnd(e.target.value)} />
                    <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: duration > 0 ? colors.text : "error.main",
                                      minWidth: 90, flexShrink: 0 }}>
                        {start && end ? (duration > 0 ? describeHours(duration) : "Ends before it starts") : ""}
                    </Typography>
                </Stack>
                {start && end && duration > 0 && (
                    <Typography data-testid="booking-when" sx={{ fontSize: FACILITY_TEXT.note, mt: "-8px !important",
                                                                 color: past ? "error.main" : colors.muted }}>
                        {past ? "It starts in the past: " : "Read as "}
                        {formatWhen(fromLocalInput(start), fromLocalInput(end))}
                        {past ? ". Ask for a time still to come." : ""}
                    </Typography>
                )}
                {resource && limitsOf(resource) && (
                    <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, mt: "-8px !important" }}>
                        {limitsOf(resource)}{isStaff ? " The facility may book outside them." : ""}
                    </Typography>
                )}
                {isBooking && (
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                        {isStaff && (
                            <FormControl size="small" fullWidth>
                                <InputLabel id="booking-owner-label">For</InputLabel>
                                <Select labelId="booking-owner-label" label="For" sx={selectSx} value={ownerId}
                                        MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                                        renderValue={(value) => (String(value) === "" ? "Nobody"
                                            : people.find((person) => person.id === value) ? personName(people.find((person) => person.id === value)!)
                                            : booking?.ownerName || `#${value}`)}
                                        onChange={(e) => setOwnerId(String(e.target.value) === "" ? "" : Number(e.target.value))}>
                                    <MenuItem value="">Nobody</MenuItem>
                                    {people.map((person) => (
                                        <MenuItem key={person.id} value={person.id}>{personName(person)} ({person.email})</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}
                        <FormControl size="small" fullWidth>
                            <InputLabel id="booking-group-label">Group</InputLabel>
                            <Select labelId="booking-group-label" label="Group" sx={selectSx} value={groupId}
                                    MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                                    renderValue={(value) => (String(value) === "" ? "None"
                                        : [...groups, ...myGroups].find((group) => group.id === value)?.name ?? booking?.groupName ?? `#${value}`)}
                                    onChange={(e) => setGroupId(String(e.target.value) === "" ? "" : Number(e.target.value))}>
                                <MenuItem value="">None</MenuItem>
                                {(isStaff ? groups : myGroups).map((group) => (
                                    <MenuItem key={group.id} value={group.id}>{group.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        {isStaff && (
                            <FormControl size="small" fullWidth>
                                <InputLabel id="booking-priority-label">Priority</InputLabel>
                                <Select labelId="booking-priority-label" label="Priority" sx={selectSx} value={priority}
                                        MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                                        onChange={(e) => setPriority(String(e.target.value) === "" ? "" : Number(e.target.value))}>
                                    <MenuItem value="">Not set</MenuItem>
                                    {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                                        <MenuItem key={value} value={Number(value)}>{label}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}
                    </Stack>
                )}
                {isStaff && (
                    <TextField sx={fieldSx} size="small" label={isBooking ? "Title (optional)" : "What it is"} value={title}
                               placeholder={isBooking ? "" : "Thermo engineer: column alignment"}
                               onChange={(e) => setTitle(e.target.value)} />
                )}
                {isBooking && (
                    <TextField sx={fieldSx} size="small" multiline minRows={2} label={isStaff ? "The user's reason" : "What it is for"}
                               value={justification} placeholder={isStaff ? "" : "Sample, grids, what you want to get"}
                               onChange={(e) => setJustification(e.target.value)} />
                )}
                {isStaff && (
                    <TextField sx={fieldSx} size="small" multiline minRows={2} label="Staff notes" value={notes}
                               helperText="Only the facility's staff see them" onChange={(e) => setNotes(e.target.value)} />
                )}
            </Stack>
        </SettingsDialog>
    );
}

/** The facility's answer to a request: confirm it, offer another time, or reject it, with a reason. */
function DecisionDialog({ booking, action, fieldSx, selectSx, menuPaperSx, colors, actionButtonSx, saveButtonSx,
                          onClose, onDone }: PanelStyles & {
    booking: FacilityBooking;
    action: "confirm" | "propose" | "reject";
    onClose: () => void;
    onDone: () => void;
}) {
    const [reason, setReason] = useState("");
    const [start, setStart] = useState(toLocalInput(booking.startsAt));
    const [end, setEnd] = useState(toLocalInput(booking.endsAt));
    const [priority, setPriority] = useState<number | "">(booking.priority ?? "");
    const [saving, setSaving] = useState(false);
    const titles = { confirm: "Confirm the request", propose: "Offer another time", reject: "Reject the request" };

    const send = async () => {
        setSaving(true);
        try {
            const level = priority === "" ? null : priority;
            await decideBooking(booking.id, action === "propose"
                ? { action, reason, priority: level, proposedStartsAt: fromLocalInput(start), proposedEndsAt: fromLocalInput(end) }
                : { action, reason, priority: level });
            toast.success(action === "confirm" ? "Confirmed." : action === "propose" ? "Another time offered." : "Rejected.");
            onDone();
        } catch (e: any) {
            toast.error(String(e?.message || e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <SettingsDialog
            title={titles[action]}
            description={`${booking.resourceName}, ${formatWhen(booking.startsAt, booking.endsAt)}, for ${booking.ownerName || booking.ownerEmail || "nobody"}.`}
            icon={<CalendarPlus size={20} color="white" />}
            confirmLabel={action === "confirm" ? "Confirm" : action === "propose" ? "Offer it" : "Reject"}
            destructive={action === "reject"}
            busy={saving}
            confirmDisabled={action === "propose" && !(start && end && hoursBetween(fromLocalInput(start), fromLocalInput(end)) > 0)}
            actionButtonSx={actionButtonSx}
            saveButtonSx={saveButtonSx}
            onConfirm={() => void send()}
            onClose={onClose}
        >
            <Stack spacing={2.5} sx={{ pt: 1 }}>
                {action === "propose" && (
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                        <TextField sx={fieldSx} size="small" fullWidth type="datetime-local" label="From" value={start}
                                   InputLabelProps={{ shrink: true }} onChange={(e) => setStart(e.target.value)} />
                        <TextField sx={fieldSx} size="small" fullWidth type="datetime-local" label="To" value={end}
                                   InputLabelProps={{ shrink: true }} onChange={(e) => setEnd(e.target.value)} />
                    </Stack>
                )}
                <TextField sx={fieldSx} size="small" multiline minRows={2} label="Reason (the user sees it)" value={reason}
                           onChange={(e) => setReason(e.target.value)} />
                <FormControl size="small" fullWidth>
                    <InputLabel id="decision-priority-label">Priority</InputLabel>
                    <Select labelId="decision-priority-label" label="Priority" sx={selectSx} value={priority}
                            MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                            onChange={(e) => setPriority(String(e.target.value) === "" ? "" : Number(e.target.value))}>
                        <MenuItem value="">Not set</MenuItem>
                        {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                            <MenuItem key={value} value={Number(value)}>{label}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
                {booking.justification && (
                    <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.muted }}>
                        The user's reason: “{booking.justification}”
                    </Typography>
                )}
            </Stack>
        </SettingsDialog>
    );
}

/** A booking as its user or the facility sees it, with what each may do with it. */
function BookingDetails({ booking, isStaff, fieldSx, colors, actionButtonSx, saveButtonSx, onClose, onChanged, onEdit,
                          onDecide }: PanelStyles & {
    booking: FacilityBooking;
    isStaff: boolean;
    onClose: () => void;
    onChanged: () => void;
    onEdit: () => void;
    onDecide: (action: "confirm" | "propose" | "reject") => void;
}) {
    const [cancelling, setCancelling] = useState(false);
    const [reason, setReason] = useState("");
    const actionSx = actionButtonSx ?? ROUNDED_BUTTON_SX;
    const saveSx = saveButtonSx ?? ROUNDED_BUTTON_SX;
    const over = booking.status === "rejected" || booking.status === "cancelled";
    const started = new Date(booking.startsAt).getTime() <= Date.now();
    const canCancel = !over && (isStaff || (booking.mine && !started));
    const canEdit = !over && (isStaff || (booking.mine && booking.status === "requested"));
    const lines: [string, string | null | undefined][] = [
        ["When", formatWhen(booking.startsAt, booking.endsAt)],
        ["Kind", booking.kind !== "booking" ? KIND_LABELS[booking.kind] : null],
        ["For", [booking.ownerName || booking.ownerEmail, booking.groupName && `group ${booking.groupName}`].filter(Boolean).join(" · ") || null],
        ["Technique", booking.technique ? TECHNIQUE_LABELS[booking.technique] : null],
        ["Priority", booking.priority != null ? PRIORITY_LABELS[booking.priority] : null],
        ["Reason given", booking.justification || null],
        ["Offered instead", booking.status === "alternative" && booking.proposedStartsAt && booking.proposedEndsAt
            ? formatWhen(booking.proposedStartsAt, booking.proposedEndsAt) : null],
        ["Decided by", booking.decidedByName ? `${booking.decidedByName}${booking.decisionReason ? `: ${booking.decisionReason}` : ""}` : null],
        ["Session", booking.sessionName ? `${booking.sessionName} (${booking.sessionStatus})` : null],
        ["Staff notes", isStaff ? booking.notes || null : null],
    ];

    const cancel = async () => {
        try {
            await cancelBooking(booking.id, reason);
            toast.success("Cancelled.");
            onChanged();
        } catch (e: any) {
            toast.error(String(e?.message || e));
        }
    };
    const answer = async (accept: boolean) => {
        try {
            await answerBooking(booking.id, accept);
            toast.success(accept ? "Booked at the time offered." : "Declined.");
            onChanged();
        } catch (e: any) {
            toast.error(String(e?.message || e));
        }
    };

    return (
        <Dialog open onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="booking-details-title"
                PaperProps={{ sx: { borderRadius: 3 } }}>
            <Box sx={{ bgcolor: "#333d49", color: "white", px: 2.5, py: 2 }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                    <Typography id="booking-details-title" sx={{ fontSize: 17, fontWeight: 600, flex: 1 }}>
                        {booking.resourceName}{booking.title ? ` · ${booking.title}` : ""}
                    </Typography>
                    <StatusChip status={booking.status} />
                </Stack>
            </Box>
            <Box sx={{ px: 2.5, py: 2.5 }}>
                <Stack spacing={1.5}>
                    {lines.filter(([, value]) => value).map(([label, value]) => (
                        <Stack key={label} direction="row" spacing={2}>
                            <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.muted, width: 120, flexShrink: 0 }}>{label}</Typography>
                            <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.text, whiteSpace: "pre-wrap" }}>{value}</Typography>
                        </Stack>
                    ))}
                    {cancelling && (
                        <TextField sx={fieldSx} size="small" multiline minRows={2} autoFocus
                                   label={isStaff ? "Why (the user sees it)" : "Why (optional)"} value={reason}
                                   onChange={(e) => setReason(e.target.value)} />
                    )}
                </Stack>
            </Box>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" justifyContent="flex-end"
                   sx={{ px: 2.5, py: 1.75, borderTop: 1, borderColor: "divider" }}>
                {isStaff && booking.status === "requested" && !cancelling && (
                    <>
                        <Button variant="contained" sx={saveSx} onClick={() => onDecide("confirm")}>Confirm</Button>
                        <Button variant="outlined" sx={actionSx} onClick={() => onDecide("propose")}>Other time</Button>
                        <Button variant="outlined" sx={{ ...actionSx, color: "error.main" }} onClick={() => onDecide("reject")}>Reject</Button>
                    </>
                )}
                {booking.mine && booking.status === "alternative" && !cancelling && (
                    <>
                        <Button variant="contained" sx={saveSx} onClick={() => void answer(true)}>Take the time offered</Button>
                        <Button variant="outlined" sx={actionSx} onClick={() => void answer(false)}>Decline</Button>
                    </>
                )}
                {canEdit && !cancelling && <Button variant="outlined" sx={actionSx} onClick={onEdit}>Change</Button>}
                {canCancel && (cancelling ? (
                    <Button variant="contained" color="error" sx={actionSx} onClick={() => void cancel()}>Cancel the booking</Button>
                ) : (
                    <Button variant="outlined" sx={{ ...actionSx, color: "error.main" }} onClick={() => setCancelling(true)}>
                        Cancel booking…
                    </Button>
                ))}
                <Button variant="outlined" sx={actionSx} onClick={onClose}>Close</Button>
            </Stack>
        </Dialog>
    );
}
