import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { DateSelectArg, DatesSetArg, EventClickArg, EventInput } from "@fullcalendar/core";
import {
    Alert, Autocomplete, Box, Button, Dialog, FormControl, IconButton, InputLabel, MenuItem, Select, Stack, TextField,
    ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import {
    Boxes, CalendarCheck, CalendarClock, CalendarDays, CalendarPlus, Check, Clock, Flag, Hourglass, Inbox, Info, Layers,
    MessageSquare, Microscope, Pencil, Settings2, Trash2, UserRound, UsersRound, X,
} from "lucide-react";
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
import { useIsDark } from "@/context/ThemeContext";
import { SettingsSection, choiceButtonsSx, sectionTint } from "@/pages/Settings/SettingsSection";
import { DialogPart } from "./DialogParts";
import { FACILITY_TEXT, useFacilityStyles } from "./facilityStyles";
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

const STATUS_COLORS: Record<BookingStatus, string> = {
    requested: "#b45309",
    alternative: "#2563eb",
    confirmed: "#16a34a",
    rejected: "#64748b",
    cancelled: "#64748b",
};

function StatusChip({ status }: { status: BookingStatus }) {
    const color = STATUS_COLORS[status];
    return (
        <Box component="span" sx={{ px: 1, borderRadius: 10, flexShrink: 0, lineHeight: 1.7, fontSize: FACILITY_TEXT.badge,
                                    fontWeight: 700, whiteSpace: "nowrap", color, bgcolor: `${color}1f` }}>
            {BOOKING_STATUS_LABELS[status]}
        </Box>
    );
}

/** One booking in a list: the band of its resource's colour, what and when, and its actions. */
function BookingRow({ color, colors, card, title, status, onOpen, children, actions, label }: {
    color: string;
    colors: PanelStyles["colors"];
    card: string;
    title: string;
    status: BookingStatus;
    onOpen: () => void;
    children?: ReactNode;
    actions?: ReactNode;
    label?: string;
}) {
    return (
        <Box role={label ? "group" : undefined} aria-label={label}
             sx={{ border: `1px solid ${colors.border}`, borderLeft: `4px solid ${color}`, borderRadius: 2.5, bgcolor: card,
                   px: 2, py: 1.5 }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }}>
                <Box sx={{ minWidth: 0, flex: 1, cursor: "pointer" }} onClick={onOpen}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: children ? 0.5 : 0, flexWrap: "wrap", rowGap: 0.5 }}>
                        <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle, fontWeight: 700, color: colors.text }}>{title}</Typography>
                        <StatusChip status={status} />
                    </Stack>
                    {children}
                </Box>
                {actions && <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>{actions}</Stack>}
            </Stack>
        </Box>
    );
}

/** The facility's calendar: who has which resource when, the requests waiting, and one's own bookings. */
export default function CalendarPanel(props: PanelStyles & { isStaff: boolean; isManager: boolean }) {
    const { colors, isStaff, isManager } = props;
    const actionSx = props.actionButtonSx ?? ROUNDED_BUTTON_SX;
    const saveSx = props.saveButtonSx ?? ROUNDED_BUTTON_SX;
    const isDark = useIsDark();
    const sectionColors = { ...useFacilityStyles().colors, ...colors };
    // The calendar in the look of the page: its buttons, lines, today and the hours
    const calendarSx = {
        "& .fc": { fontSize: 14, "--fc-border-color": colors.border, "--fc-page-bg-color": sectionColors.card,
                   "--fc-today-bg-color": sectionTint(isDark), "--fc-now-indicator-color": "#dc2626",
                   "--fc-neutral-bg-color": colors.hover, color: colors.text },
        "& .fc .fc-toolbar-title": { fontSize: 18, fontWeight: 800 },
        "& .fc .fc-button": { textTransform: "none", fontSize: 13.5, fontWeight: 600, borderRadius: "8px", boxShadow: "none",
                              bgcolor: "transparent", color: colors.text, borderColor: colors.border, px: 1.5, py: 0.6 },
        "& .fc .fc-button:hover": { bgcolor: colors.hover, color: colors.text, borderColor: colors.border },
        "& .fc .fc-button:focus": { boxShadow: "none" },
        "& .fc .fc-button-primary:not(:disabled).fc-button-active, & .fc .fc-button-primary:not(:disabled):active": {
            bgcolor: sectionTint(isDark), color: sectionColors.primary, borderColor: sectionColors.primary },
        "& .fc .fc-button:disabled": { opacity: 0.5 },
        "& .fc .fc-button-group > .fc-button": { borderRadius: 0 },
        "& .fc .fc-button-group > .fc-button:first-of-type": { borderTopLeftRadius: "8px", borderBottomLeftRadius: "8px" },
        "& .fc .fc-button-group > .fc-button:last-of-type": { borderTopRightRadius: "8px", borderBottomRightRadius: "8px" },
        "& .fc .fc-col-header-cell-cushion, & .fc .fc-daygrid-day-number": { color: colors.text, textDecoration: "none", fontWeight: 600 },
        "& .fc .fc-timegrid-slot-label-cushion": { color: colors.muted, fontSize: 13 },
        "& .fc .fc-scrollgrid": { borderRadius: "10px", overflow: "hidden" },
        "& .fc-event": { cursor: "pointer", borderRadius: "6px", fontWeight: 600 },
    } as const;
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
                <SettingsSection plain icon={<Inbox size={19} />} title={`Requests waiting (${queue.length})`}
                                 subtitle="Highest priority first, then the oldest. The user is told by mail when the facility's mail is on."
                                 colors={sectionColors} isDarkMode={isDark}>
                    <Stack spacing={1.25}>
                        {queue.map((booking) => (
                            <BookingRow key={booking.id} label={`Request ${booking.id}`} colors={colors} card={sectionColors.card}
                                        color={resourceColor(byId.get(booking.resourceId))} status={booking.status}
                                        title={`${booking.resourceName} · ${formatWhen(booking.startsAt, booking.endsAt)}`}
                                        onOpen={() => setOpened(booking)}
                                        actions={booking.status === "requested" ? (
                                            <>
                                                <Button size="small" variant="contained" sx={saveSx} startIcon={<Check size={14} />}
                                                        onClick={() => setDeciding({ booking, action: "confirm" })}>Confirm</Button>
                                                <Button size="small" variant="outlined" sx={actionSx} startIcon={<Clock size={14} />}
                                                        onClick={() => setDeciding({ booking, action: "propose" })}>Other time</Button>
                                                <Button size="small" variant="outlined" sx={{ ...actionSx, color: "#dc2626" }}
                                                        startIcon={<X size={14} />}
                                                        onClick={() => setDeciding({ booking, action: "reject" })}>Reject</Button>
                                            </>
                                        ) : (
                                            <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>
                                                Waiting for the user's answer
                                            </Typography>
                                        )}>
                                <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.muted }}>
                                    {[booking.ownerName || booking.ownerEmail, booking.groupName && `group ${booking.groupName}`,
                                      booking.technique && TECHNIQUE_LABELS[booking.technique],
                                      booking.priority != null && `priority ${booking.priority}`].filter(Boolean).join(" · ")}
                                </Typography>
                                {booking.justification && (
                                    <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.text, mt: 0.75, px: 1.25, py: 0.5,
                                                      borderLeft: `3px solid ${colors.border}`, fontStyle: "italic" }}>
                                        “{booking.justification}”
                                    </Typography>
                                )}
                            </BookingRow>
                        ))}
                    </Stack>
                </SettingsSection>
            )}

            {/* A user always sees where their requests go, even before the first one; the staff only when they have some */}
            {mine !== null && (myOpen.length > 0 || !isStaff) && (
                <SettingsSection plain icon={<CalendarCheck size={19} />} title="My bookings" colors={sectionColors} isDarkMode={isDark}
                                 subtitle="Your bookings to come and your requests, until the facility answers them.">
                    {myOpen.length === 0 && (
                        <Box data-testid="my-bookings-empty"
                             sx={{ border: `1px dashed ${colors.border}`, borderRadius: 2, px: 2, py: 2.5, textAlign: "center" }}>
                            <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle, fontWeight: 700, color: colors.text }}>
                                No bookings to come.
                            </Typography>
                            <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, mt: 0.5 }}>
                                Ask for time below: your requests wait here until the facility confirms them or offers another time.
                            </Typography>
                        </Box>
                    )}
                    <Stack spacing={1.25}>
                        {myOpen.map((booking) => (
                            <BookingRow key={booking.id} colors={colors} card={sectionColors.card}
                                        color={resourceColor(byId.get(booking.resourceId))} status={booking.status}
                                        title={`${booking.resourceName} · ${formatWhen(booking.startsAt, booking.endsAt)}`}
                                        onOpen={() => setOpened(booking)}
                                        actions={booking.status === "alternative" ? (
                                            <>
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
                                            </>
                                        ) : undefined}>
                                {booking.status === "alternative" && booking.proposedStartsAt && booking.proposedEndsAt && (
                                    <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.text }}>
                                        The facility offers {formatWhen(booking.proposedStartsAt, booking.proposedEndsAt)}
                                        {booking.decisionReason ? `: ${booking.decisionReason}` : ""}
                                    </Typography>
                                )}
                            </BookingRow>
                        ))}
                    </Stack>
                </SettingsSection>
            )}

            <SettingsSection
                plain
                icon={<CalendarDays size={19} />}
                title="Calendar"
                subtitle={isStaff
                    ? "Every resource's bookings and blocks. Drag over a time to book or block it; click a booking to see, move or cancel it."
                    : "When each resource is taken. Drag over a free time (or pick days in the month) to ask for it."}
                colors={sectionColors}
                isDarkMode={isDark}
                actions={
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
            >
                <Stack spacing={2}>
                    {resources.length === 0 ? (
                        <Box sx={{ border: `1px dashed ${colors.border}`, borderRadius: 2, px: 2, py: 2.5, textAlign: "center" }}>
                            <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle, fontWeight: 700, color: colors.text }}>
                                Nothing can be booked yet{isManager ? ": add the resources" : ""}.
                            </Typography>
                        </Box>
                    ) : (
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" aria-label="Resources shown">
                            {usable.map((resource) => {
                                const on = shown.length === 0 || shown.includes(resource.id);
                                const color = resourceColor(resource);
                                return (
                                    <Box key={resource.id} component="button" type="button" onClick={() => toggle(resource.id)}
                                         aria-pressed={shown.includes(resource.id)}
                                         sx={{ display: "inline-flex", alignItems: "center", gap: 1, px: 1.5, py: 0.6, borderRadius: 10,
                                               cursor: "pointer", font: "inherit", fontSize: FACILITY_TEXT.itemLine, fontWeight: 600,
                                               color: on ? colors.text : colors.muted, opacity: on ? 1 : 0.65,
                                               border: `1px solid ${on ? color : colors.border}`,
                                               bgcolor: on ? `${color}1a` : "transparent", "&:hover": { bgcolor: `${color}26` } }}>
                                        <Box component="span" sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: color }} />
                                        {resource.name}
                                    </Box>
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
                    <Box sx={calendarSx}>
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
            </SettingsSection>

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

/** A resource's name after its colour. */
function Dot({ color, label }: { color: string; label: string }) {
    return (
        <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
            <Box component="span" sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: color, flexShrink: 0 }} />
            {label}
        </Box>
    );
}

/** A choice with its name on the left. */
function ChoiceRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
            <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 700, minWidth: 90 }}>{label}</Typography>
            {children}
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
    const isDark = useIsDark();
    const tint = sectionTint(isDark);
    const choiceSx = choiceButtonsSx({ ...colors, card: "", primary: useFacilityStyles().colors.primary }, isDark);
    const owner = ownerId === "" ? null : people.find((person) => person.id === ownerId)
        ?? { id: ownerId, email: "", firstName: booking?.ownerName || `#${ownerId}`, lastName: "" };
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
            closeButton
            actionButtonSx={actionButtonSx}
            saveButtonSx={saveButtonSx}
            onConfirm={() => void save()}
            onClose={onClose}
        >
            <Stack spacing={2}>
                <DialogPart icon={<Boxes size={18} />} title="What" tint={tint} colors={colors}
                            subtitle={isStaff ? "The resource, and whether it is a user's booking or a block of it." : "The resource you need."}>
                    <FormControl size="small" fullWidth>
                        <InputLabel id="booking-resource-label">Resource</InputLabel>
                        <Select labelId="booking-resource-label" label="Resource" sx={selectSx} value={resourceId}
                                MenuProps={{ PaperProps: { sx: menuPaperSx } }}
                                renderValue={(value) => {
                                    const chosen = resources.find((candidate) => candidate.id === value);
                                    return chosen ? <Dot color={resourceColor(chosen)} label={chosen.name} /> : "";
                                }}
                                onChange={(e) => setResourceId(Number(e.target.value))}>
                            {choices.map((candidate) => (
                                <MenuItem key={candidate.id} value={candidate.id}>
                                    <Dot color={resourceColor(candidate)} label={candidate.name} />
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    {isStaff && (
                        <ChoiceRow label="Kind">
                            <ToggleButtonGroup exclusive size="small" value={kind} aria-label="Kind"
                                               onChange={(_, value) => value && setKind(value as BookingKind)} sx={choiceSx}>
                                {(Object.keys(KIND_LABELS) as BookingKind[]).map((value) => (
                                    <ToggleButton key={value} value={value}>{KIND_LABELS[value]}</ToggleButton>
                                ))}
                            </ToggleButtonGroup>
                        </ChoiceRow>
                    )}
                    {resource?.microscopeId != null && isBooking && (
                        <ChoiceRow label="Technique">
                            <ToggleButtonGroup exclusive size="small" value={technique} aria-label="Technique"
                                               onChange={(_, value) => value && setTechnique(value as "spa" | "tomo")} sx={choiceSx}>
                                <ToggleButton value="spa">SPA</ToggleButton>
                                <ToggleButton value="tomo">Tomography</ToggleButton>
                            </ToggleButtonGroup>
                        </ChoiceRow>
                    )}
                </DialogPart>

                <DialogPart icon={<CalendarDays size={18} />} title="When" tint={tint} colors={colors}
                            subtitle={resource && limitsOf(resource) ? undefined : "From when to when."}>
                    {resource && limitsOf(resource) && (
                        <Stack direction="row" spacing={1} alignItems="flex-start"
                               sx={{ mt: "-8px !important", px: 1.5, py: 1, borderRadius: 2, bgcolor: tint }}>
                            <Box sx={{ pt: 0.2, display: "flex", color: "primary.main" }}><Info size={16} /></Box>
                            <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.text }}>
                                {limitsOf(resource)}{isStaff ? " The facility may book outside them." : ""}
                            </Typography>
                        </Stack>
                    )}
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
                        <TextField sx={fieldSx} size="small" fullWidth type="datetime-local" label="From" value={start}
                                   InputLabelProps={{ shrink: true }} onChange={(e) => setStart(e.target.value)} />
                        <TextField sx={fieldSx} size="small" fullWidth type="datetime-local" label="To" value={end}
                                   InputLabelProps={{ shrink: true }} onChange={(e) => setEnd(e.target.value)} />
                        {start && end && (
                            <Box component="span" sx={{ px: 1.25, py: 0.4, borderRadius: 10, flexShrink: 0, whiteSpace: "nowrap",
                                                        fontSize: FACILITY_TEXT.itemLine, fontWeight: 700,
                                                        color: duration > 0 ? "primary.main" : "#dc2626",
                                                        bgcolor: duration > 0 ? tint : "rgba(220,38,38,0.1)" }}>
                                {duration > 0 ? describeHours(duration) : "Ends before it starts"}
                            </Box>
                        )}
                    </Stack>
                    {start && end && duration > 0 && (
                        <Typography data-testid="booking-when" sx={{ fontSize: FACILITY_TEXT.note, mt: "-6px !important",
                                                                     color: past ? "#dc2626" : colors.muted }}>
                            {past ? "It starts in the past: " : "Read as "}
                            {formatWhen(fromLocalInput(start), fromLocalInput(end))}
                            {past ? ". Ask for a time still to come." : ""}
                        </Typography>
                    )}
                </DialogPart>

                {isBooking && (
                    <DialogPart icon={<UsersRound size={18} />} title="Who" tint={tint} colors={colors}
                                subtitle={isStaff ? "Whom it is for, their group and the request's priority." : "The group the time is for."}>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                            {isStaff && (
                                <Autocomplete
                                    size="small"
                                    fullWidth
                                    options={people}
                                    value={owner}
                                    getOptionLabel={(option) => personName(option)}
                                    isOptionEqualToValue={(option, value) => option.id === value.id}
                                    onChange={(_, option) => setOwnerId(option ? option.id : "")}
                                    slotProps={{ paper: { sx: menuPaperSx } }}
                                    renderOption={(props, option) => (
                                        <Box component="li" {...props} key={option.id}>
                                            <Box>
                                                <Box sx={{ fontSize: FACILITY_TEXT.itemLine }}>{personName(option)}</Box>
                                                <Box sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>{option.email}</Box>
                                            </Box>
                                        </Box>
                                    )}
                                    filterOptions={(options, { inputValue }) => {
                                        const words = inputValue.trim().toLowerCase();
                                        return options.filter((option) => `${personName(option)} ${option.email}`.toLowerCase().includes(words));
                                    }}
                                    renderInput={(params) => <TextField {...params} sx={fieldSx} label="For" placeholder="Search by name or email" />}
                                />
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
                    </DialogPart>
                )}

                <DialogPart icon={<MessageSquare size={18} />} title="Details" tint={tint} colors={colors}
                            subtitle={isStaff ? "What the user wants it for, and notes only the staff see." : "Tell the facility what you will do."}>
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
                </DialogPart>
            </Stack>
        </SettingsDialog>
    );
}

const DECISIONS = {
    confirm: { title: "Confirm the request", label: "Confirm", icon: Check, color: "#16a34a",
               reasonHint: "Optional: anything the user should know." },
    propose: { title: "Offer another time", label: "Offer it", icon: Clock, color: "#2563eb",
               reasonHint: "Why this time instead: the user reads it before answering." },
    reject: { title: "Reject the request", label: "Reject", icon: X, color: "#dc2626",
              reasonHint: "Why it cannot be: the user reads it." },
} as const;

// A priority's short name, for its button (the whole label is its tooltip)
const PRIORITY_SHORT: Record<number, string> = { 0: "Facility", 1: "Committed", 2: "Internal", 3: "Academic", 4: "External" };

function bookingColor(booking: FacilityBooking): string {
    return booking.resourceColor || resourceColor({ id: booking.resourceId, color: "" });
}

/** A booking at a glance: its resource's colour, what and when, for whom, and its state. */
function BookingSummary({ booking, colors, showNotes }: {
    booking: FacilityBooking;
    colors: PanelStyles["colors"];
    showNotes?: boolean;
}) {
    const hours = hoursBetween(booking.startsAt, booking.endsAt);
    const facts: [ReactNode, string, string | null | undefined][] = [
        [<CalendarDays size={15} />, "When", formatWhen(booking.startsAt, booking.endsAt)],
        [<Clock size={15} />, "How long", hours > 0 ? describeHours(hours) : null],
        [<UserRound size={15} />, "For", [booking.ownerName || booking.ownerEmail, booking.groupName && `group ${booking.groupName}`]
            .filter(Boolean).join(" · ") || null],
        [<Layers size={15} />, "Technique", booking.technique ? TECHNIQUE_LABELS[booking.technique] : null],
        [<Settings2 size={15} />, "Kind", booking.kind !== "booking" ? KIND_LABELS[booking.kind] : null],
        [<Flag size={15} />, "Priority", booking.priority != null ? PRIORITY_LABELS[booking.priority] : null],
        [<Microscope size={15} />, "Session", booking.sessionName ? `${booking.sessionName} (${booking.sessionStatus})` : null],
    ];
    return (
        <Box sx={{ border: `1px solid ${colors.border}`, borderLeft: `4px solid ${bookingColor(booking)}`, borderRadius: 2.5,
                   overflow: "hidden" }}>
            <Box sx={{ px: 2, pt: 1.5, pb: 1.25 }}>
                <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 1.25 }}>
                    <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle + 0.5, fontWeight: 800, color: colors.text }}>
                        {booking.resourceName}
                    </Typography>
                    {booking.title && (
                        <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.muted }}>{booking.title}</Typography>
                    )}
                    <StatusChip status={booking.status} />
                </Stack>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, columnGap: 2.5, rowGap: 1.25 }}>
                    {facts.filter(([, , value]) => value).map(([icon, label, value]) => (
                        <Stack key={label} direction="row" spacing={1} alignItems="flex-start" sx={{ minWidth: 0 }}>
                            <Box sx={{ color: colors.muted, mt: 0.25, flexShrink: 0, display: "flex" }}>{icon}</Box>
                            <Box sx={{ minWidth: 0 }}>
                                <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, lineHeight: 1.3 }}>{label}</Typography>
                                <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.text, wordBreak: "break-word" }}>{value}</Typography>
                            </Box>
                        </Stack>
                    ))}
                </Box>
            </Box>
            {(booking.justification || (showNotes && booking.notes)) && (
                <Stack spacing={1} sx={{ borderTop: `1px solid ${colors.border}`, bgcolor: colors.hover, px: 2, py: 1.25 }}>
                    {booking.justification && (
                        <Box>
                            <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>The user's reason</Typography>
                            <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.text, fontStyle: "italic", whiteSpace: "pre-wrap" }}>
                                “{booking.justification}”
                            </Typography>
                        </Box>
                    )}
                    {showNotes && booking.notes && (
                        <Box>
                            <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted }}>Staff notes</Typography>
                            <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, color: colors.text, whiteSpace: "pre-wrap" }}>{booking.notes}</Typography>
                        </Box>
                    )}
                </Stack>
            )}
        </Box>
    );
}

/** A coloured box saying where a booking stands, and what its user or the facility may do now. */
function StandingBox({ color, icon, title, children }: { color: string; icon: ReactNode; title: string; children?: ReactNode }) {
    return (
        <Box sx={{ borderRadius: 2.5, border: `1px solid ${color}55`, bgcolor: `${color}12`, px: 2, py: 1.5 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ color }}>
                {icon}
                <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 700, color }}>{title}</Typography>
            </Stack>
            {children && <Box sx={{ mt: 0.75 }}>{children}</Box>}
        </Box>
    );
}

/** The facility's answer to a request: confirm it, offer another time, or reject it, with a reason. */
function DecisionDialog({ booking, action, fieldSx, colors, actionButtonSx, saveButtonSx, onClose, onDone }: PanelStyles & {
    booking: FacilityBooking;
    action: "confirm" | "propose" | "reject";
    onClose: () => void;
    onDone: () => void;
}) {
    const isDark = useIsDark();
    const primary = useFacilityStyles().colors.primary;
    const tint = sectionTint(isDark);
    const [reason, setReason] = useState("");
    const [start, setStart] = useState(toLocalInput(booking.startsAt));
    const [end, setEnd] = useState(toLocalInput(booking.endsAt));
    const [priority, setPriority] = useState<number | "">(booking.priority ?? "");
    const [saving, setSaving] = useState(false);
    const decision = DECISIONS[action];
    const Icon = decision.icon;
    const offered = start && end ? hoursBetween(fromLocalInput(start), fromLocalInput(end)) : 0;

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
            title={decision.title}
            description={`The user is told${action === "propose" ? " and chooses whether to take it" : ""}, by mail when the facility's mail is on.`}
            icon={<Icon size={20} color={action === "confirm" ? "#86efac" : action === "propose" ? "#93c5fd" : "#fca5a5"} />}
            confirmLabel={decision.label}
            destructive={action === "reject"}
            busy={saving}
            confirmDisabled={action === "propose" && !(offered > 0)}
            actionButtonSx={actionButtonSx}
            saveButtonSx={saveButtonSx}
            closeButton
            onConfirm={() => void send()}
            onClose={onClose}
        >
            <Stack spacing={2}>
                <BookingSummary booking={booking} colors={colors} />
                {action === "propose" && (
                    <DialogPart icon={<CalendarClock size={18} />} title="The time offered" tint={tint} colors={colors}
                                subtitle="It starts as the time asked: move it where it fits.">
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
                            <TextField sx={fieldSx} size="small" fullWidth type="datetime-local" label="From" value={start}
                                       InputLabelProps={{ shrink: true }} onChange={(e) => setStart(e.target.value)} />
                            <TextField sx={fieldSx} size="small" fullWidth type="datetime-local" label="To" value={end}
                                       InputLabelProps={{ shrink: true }} onChange={(e) => setEnd(e.target.value)} />
                            <Box component="span" sx={{ px: 1.25, borderRadius: 10, flexShrink: 0, lineHeight: 1.9, fontSize: FACILITY_TEXT.badge,
                                                        fontWeight: 700, whiteSpace: "nowrap",
                                                        color: offered > 0 ? primary : "#dc2626",
                                                        bgcolor: offered > 0 ? tint : "rgba(220,38,38,0.1)" }}>
                                {offered > 0 ? describeHours(offered) : "Ends before it starts"}
                            </Box>
                        </Stack>
                    </DialogPart>
                )}
                <DialogPart icon={<MessageSquare size={18} />} title="The answer" tint={tint} colors={colors}
                            subtitle={decision.reasonHint}>
                    <TextField sx={fieldSx} size="small" multiline minRows={2} label="Reason (the user sees it)" value={reason}
                               onChange={(e) => setReason(e.target.value)} />
                    <Box>
                        <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 700, color: colors.text }}>Priority</Typography>
                        <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, mb: 1 }}>
                            Kept with the booking: the queue of requests is ordered by it.
                        </Typography>
                        <ToggleButtonGroup exclusive size="small" value={priority} aria-label="Priority"
                                           onChange={(_, value) => value !== null && setPriority(value)}
                                           sx={choiceButtonsSx({ ...colors, card: "", primary }, isDark)}>
                            <ToggleButton value="">Not set</ToggleButton>
                            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                                <Tooltip key={value} arrow title={label}>
                                    <ToggleButton value={Number(value)} aria-label={label}>
                                        {value} · {PRIORITY_SHORT[Number(value)]}
                                    </ToggleButton>
                                </Tooltip>
                            ))}
                        </ToggleButtonGroup>
                    </Box>
                </DialogPart>
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
    const [busy, setBusy] = useState(false);
    const actionSx = actionButtonSx ?? ROUNDED_BUTTON_SX;
    const saveSx = saveButtonSx ?? ROUNDED_BUTTON_SX;
    const over = booking.status === "rejected" || booking.status === "cancelled";
    const started = new Date(booking.startsAt).getTime() <= Date.now();
    const canCancel = !over && (isStaff || (booking.mine && !started));
    const canEdit = !over && (isStaff || (booking.mine && booking.status === "requested"));
    const decided = booking.decidedByName
        ? `${booking.decidedByName}${booking.decidedAt
            ? `, ${new Date(booking.decidedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}`
        : "";

    const run = async (work: () => Promise<unknown>, done: string) => {
        setBusy(true);
        try {
            await work();
            toast.success(done);
            onChanged();
        } catch (e: any) {
            toast.error(String(e?.message || e));
        } finally {
            setBusy(false);
        }
    };

    const standing = (() => {
        switch (booking.status) {
            case "requested":
                return (
                    <StandingBox color={STATUS_COLORS.requested} icon={<Hourglass size={16} />} title="Not answered yet">
                        <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.text }}>
                            {isStaff ? "Confirm it, offer another time, or reject it." : "You are told when the facility answers."}
                        </Typography>
                    </StandingBox>
                );
            case "alternative":
                return (
                    <StandingBox color={STATUS_COLORS.alternative} icon={<Clock size={16} />} title="The facility offers another time">
                        {booking.proposedStartsAt && booking.proposedEndsAt && (
                            <Typography sx={{ fontSize: FACILITY_TEXT.itemTitle, fontWeight: 700, color: colors.text }}>
                                {formatWhen(booking.proposedStartsAt, booking.proposedEndsAt)}
                            </Typography>
                        )}
                        {booking.decisionReason && (
                            <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.text, fontStyle: "italic" }}>
                                “{booking.decisionReason}”{decided ? ` · ${decided}` : ""}
                            </Typography>
                        )}
                        {booking.mine && !cancelling && (
                            <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
                                <Button size="small" variant="contained" sx={saveSx} startIcon={<Check size={14} />} disabled={busy}
                                        onClick={() => void run(() => answerBooking(booking.id, true), "Booked at the time offered.")}>
                                    Take the time offered
                                </Button>
                                <Button size="small" variant="outlined" sx={actionSx} disabled={busy}
                                        onClick={() => void run(() => answerBooking(booking.id, false), "Declined.")}>
                                    Decline
                                </Button>
                            </Stack>
                        )}
                        {!booking.mine && (
                            <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.muted, mt: 0.5 }}>Waiting for the user's answer.</Typography>
                        )}
                    </StandingBox>
                );
            case "confirmed":
                return decided ? (
                    <StandingBox color={STATUS_COLORS.confirmed} icon={<CalendarCheck size={16} />} title={`Confirmed by ${decided}`}>
                        {booking.decisionReason && (
                            <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.text, fontStyle: "italic" }}>“{booking.decisionReason}”</Typography>
                        )}
                    </StandingBox>
                ) : null;
            default:
                return (
                    <StandingBox color={STATUS_COLORS[booking.status]} icon={<X size={16} />}
                                 title={booking.status === "rejected" ? `Not accepted${decided ? ` · ${decided}` : ""}` : "Cancelled"}>
                        {booking.decisionReason && (
                            <Typography sx={{ fontSize: FACILITY_TEXT.note, color: colors.text, fontStyle: "italic" }}>“{booking.decisionReason}”</Typography>
                        )}
                    </StandingBox>
                );
        }
    })();

    return (
        <Dialog open onClose={() => !busy && onClose()} maxWidth="sm" fullWidth aria-labelledby="booking-details-title"
                PaperProps={{ sx: { borderRadius: 3, overflow: "hidden", boxShadow: 12, display: "flex", flexDirection: "column",
                                    maxHeight: "calc(100% - 48px)" } }}>
            <Box sx={{ bgcolor: "#333d49", color: "white", px: 2, py: 1.75, flexShrink: 0 }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box sx={{ width: 36, height: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                               borderRadius: 2, bgcolor: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}>
                        <CalendarDays size={20} color="white" />
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography id="booking-details-title" sx={{ fontSize: 16, fontWeight: 600, lineHeight: 1.5 }}>
                            {booking.kind === "booking" ? "Booking" : KIND_LABELS[booking.kind]} of {booking.resourceName}
                        </Typography>
                        <Typography sx={{ fontSize: 14, color: "rgb(229,231,235)" }}>
                            {booking.requestedByName ? `Asked by ${booking.requestedByName}` : formatWhen(booking.startsAt, booking.endsAt)}
                        </Typography>
                    </Box>
                    <Tooltip arrow title="Close">
                        <IconButton aria-label="Close" onClick={onClose}
                                    sx={{ color: "rgb(229,231,235)", "&:hover": { bgcolor: "rgba(255,255,255,0.1)" } }}>
                            <X size={20} />
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Box>
            <Box sx={{ px: 2.5, py: 2.5, flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}>
                <Stack spacing={2}>
                    <BookingSummary booking={booking} colors={colors} showNotes={isStaff} />
                    {standing}
                    {cancelling && (
                        <Box sx={{ borderRadius: 2.5, border: "1px solid rgba(220,38,38,0.35)", bgcolor: "rgba(220,38,38,0.05)", p: 2 }}>
                            <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 700, color: "#dc2626", mb: 1.25 }}>
                                Cancel this booking?
                            </Typography>
                            <TextField sx={fieldSx} size="small" fullWidth multiline minRows={2} autoFocus
                                       label={isStaff ? "Why (the user sees it)" : "Why (optional)"} value={reason}
                                       onChange={(e) => setReason(e.target.value)} />
                            <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 1.25 }}>
                                <Button size="small" variant="outlined" sx={actionSx} disabled={busy} onClick={() => setCancelling(false)}>
                                    Keep it
                                </Button>
                                <Button size="small" variant="contained" color="error" disabled={busy}
                                        sx={{ ...actionSx, boxShadow: "none" }} startIcon={<Trash2 size={14} />}
                                        onClick={() => void run(() => cancelBooking(booking.id, reason), "Cancelled.")}>
                                    Cancel the booking
                                </Button>
                            </Stack>
                        </Box>
                    )}
                </Stack>
            </Box>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center"
                   sx={{ px: 2.5, py: 1.75, borderTop: 1, borderColor: "divider", flexShrink: 0 }}>
                {canCancel && !cancelling && (
                    <Button variant="text" sx={{ ...actionSx, color: "#dc2626" }} startIcon={<Trash2 size={15} />}
                            onClick={() => setCancelling(true)}>
                        Cancel booking…
                    </Button>
                )}
                <Box sx={{ flex: 1 }} />
                {canEdit && !cancelling && (
                    <Button variant="outlined" sx={actionSx} startIcon={<Pencil size={15} />} onClick={onEdit}>Change</Button>
                )}
                {isStaff && booking.status === "requested" && !cancelling && (
                    <>
                        <Button variant="outlined" sx={{ ...actionSx, color: "#dc2626" }} startIcon={<X size={15} />}
                                onClick={() => onDecide("reject")}>Reject</Button>
                        <Button variant="outlined" sx={actionSx} startIcon={<Clock size={15} />}
                                onClick={() => onDecide("propose")}>Other time</Button>
                        <Button variant="contained" sx={saveSx} startIcon={<Check size={15} />}
                                onClick={() => onDecide("confirm")}>Confirm</Button>
                    </>
                )}
                {!(isStaff && booking.status === "requested") && (
                    <Button variant="outlined" sx={actionSx} onClick={onClose}>Close</Button>
                )}
            </Stack>
        </Dialog>
    );
}
