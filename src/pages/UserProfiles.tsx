import { FormEvent, ReactNode, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { BadgeCheck, Building2, Cpu, HardDrive, Mail, MapPin, Pencil, ShieldCheck } from "lucide-react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import UserPasswordCard from "../components/UserProfile/UserPasswordCard";
import { Modal } from "../components/ui/modal";
import Button from "../components/ui/button/Button";
import Input from "../components/form/input/InputField";
import Label from "../components/form/Label";
import { useModal } from "../hooks/useModal";
import { getUserProfile, updateUserProfile } from "@/api/auth";
import { myStorageQuotas, type StorageQuota } from "@/api/storage";
import { formatHours, getOwnComputeUsage, type OwnCompute } from "@/api/usage";
import type { UserProfile } from "@/types/user";

// The fields a user may change about themselves
const EDITABLE = ["firstName", "lastName", "institution", "position", "phone", "country", "city",
  "postalCode"] as const;
type Editable = (typeof EDITABLE)[number];
type Draft = Record<Editable, string>;

function classNames(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}

function fullName(user: UserProfile): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
}

function initials(user: UserProfile): string {
  const letters = [user.firstName, user.lastName].filter(Boolean).map((part) => part!.trim()[0] ?? "");
  return (letters.join("") || user.email[0] || "?").toUpperCase();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB", "PB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toLocaleString(undefined, { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`;
}

function formatDate(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function draftOf(user: UserProfile): Draft {
  return Object.fromEntries(EDITABLE.map((key) => [key, (user[key] as string | undefined) ?? ""])) as Draft;
}

function Section(props: { title: string; subtitle?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[10px] border border-gray-300/85 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-4 border-b border-gray-200/90 bg-gray-50 px-5 py-4 dark:border-gray-700 dark:bg-gray-800/40 lg:px-6">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white/90">{props.title}</h2>
          {props.subtitle ? (
            <p className="mt-1 text-[13.5px] text-gray-500 dark:text-gray-400">{props.subtitle}</p>
          ) : null}
        </div>
        {props.right}
      </div>
      <div className="px-5 py-5 lg:px-6">{props.children}</div>
    </section>
  );
}

function Field(props: { label: string; value?: string | null; wide?: boolean }) {
  const value = props.value?.trim();
  return (
    <div className={props.wide ? "sm:col-span-2" : undefined}>
      <dt className="text-[13.5px] text-gray-500 dark:text-gray-400">{props.label}</dt>
      <dd
        className={classNames(
          "mt-1 text-[15.5px] break-words",
          value ? "font-medium text-gray-900 dark:text-white/90" : "text-gray-400 dark:text-gray-500",
        )}
      >
        {value || "Not set"}
      </dd>
    </div>
  );
}

function EditButton(props: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-[14px] font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.05]"
    >
      <Pencil className="h-4 w-4" />
      {props.label ?? "Edit"}
    </button>
  );
}

function Meter(props: { percent: number; full: boolean }) {
  const percent = Math.max(0, Math.min(100, props.percent));
  const tone = props.full || percent >= 95 ? "bg-error-500" : percent >= 80 ? "bg-amber-500" : "bg-brand-500";
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
      <div className={classNames("h-full rounded-full", tone)} style={{ width: `${percent}%` }} />
    </div>
  );
}

function ProfileHeader(props: { user: UserProfile; onEdit: () => void }) {
  const { user } = props;
  const since = formatDate(user.createdAt);
  const subtitle = [user.position, user.institution].map((x) => x?.trim()).filter(Boolean).join(" · ");
  const place = [user.city, user.country].map((x) => x?.trim()).filter(Boolean).join(", ");
  return (
    <section className="rounded-[10px] border border-gray-300/85 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] dark:border-gray-700 dark:bg-gray-900 lg:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div
            aria-hidden="true"
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[22px] font-semibold text-brand-600 ring-1 ring-brand-200 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-800"
          >
            {initials(user)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[20px] font-semibold text-gray-900 dark:text-white/90">{fullName(user)}</h1>
              {user.isSystemAdmin ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[13.5px] font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-800">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Administrator
                </span>
              ) : null}
            </div>
            {subtitle ? <p className="mt-0.5 text-[15px] text-gray-600 dark:text-gray-300">{subtitle}</p> : null}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px] text-gray-500 dark:text-gray-400">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-4 w-4" />
                {user.email}
              </span>
              {place ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {place}
                </span>
              ) : null}
              {since ? <span>Member since {since}</span> : null}
            </div>
          </div>
        </div>
        <EditButton onClick={props.onEdit} label="Edit profile" />
      </div>
    </section>
  );
}

function UsageSection() {
  const [quotas, setQuotas] = useState<StorageQuota[] | null>(null);
  const [compute, setCompute] = useState<OwnCompute | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    myStorageQuotas()
      .then((rows) => alive && setQuotas(rows))
      .catch(() => alive && setQuotas([]));
    getOwnComputeUsage()
      .then((totals) => alive && setCompute(totals))
      .catch(() => alive && setCompute(null));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Section title="Your usage" subtitle="Disk used by your projects and computing this month">
      <div className="space-y-5">
        <div>
          <div className="flex items-center gap-2 text-[14px] font-medium text-gray-700 dark:text-gray-300">
            <HardDrive className="h-4 w-4 text-gray-500" />
            Disk
          </div>
          {quotas === null ? (
            <p className="mt-2 text-[13.5px] text-gray-400">Loading…</p>
          ) : quotas.length === 0 ? (
            <p className="mt-2 text-[13.5px] text-gray-500 dark:text-gray-400">No disk limit is set for you.</p>
          ) : (
            <ul className="mt-2 space-y-3">
              {quotas.map((quota) => (
                <li key={`${quota.kind}-${quota.targetId}`}>
                  <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                    <span className="text-gray-600 dark:text-gray-300">
                      {quota.kind === "user" ? "Your quota" : `Group ${quota.name ?? quota.targetId}`}
                    </span>
                    <span className="font-medium text-gray-900 tabular-nums dark:text-white/90">
                      {formatBytes(quota.usedBytes)} of {formatBytes(quota.limitBytes)}
                    </span>
                  </div>
                  <Meter percent={quota.percent ?? 0} full={quota.full} />
                  {quota.full ? (
                    <p className="mt-1.5 text-[13.5px] text-error-600 dark:text-error-400">
                      Full: nothing new can run until space is freed.
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-gray-200 pt-5 dark:border-gray-800">
          <div className="flex items-center gap-2 text-[14px] font-medium text-gray-700 dark:text-gray-300">
            <Cpu className="h-4 w-4 text-gray-500" />
            Computing this month
          </div>
          {compute === undefined ? (
            <p className="mt-2 text-[13.5px] text-gray-400">Loading…</p>
          ) : compute === null ? (
            <p className="mt-2 text-[13.5px] text-gray-500 dark:text-gray-400">Not available.</p>
          ) : (
            <dl className="mt-3 grid grid-cols-3 gap-3">
              {[
                ["Runs", compute.runs.toLocaleString()],
                ["Hours", formatHours(compute.hours)],
                ["GPU hours", formatHours(compute.gpuHours)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-gray-50 px-3 py-2.5 dark:bg-gray-800/60">
                  <dt className="text-[13.5px] text-gray-500 dark:text-gray-400">{label}</dt>
                  <dd className="mt-0.5 text-[17px] font-semibold text-gray-900 tabular-nums dark:text-white/90">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </Section>
  );
}

function EditProfileModal(props: {
  user: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (user: UserProfile) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(props.user));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (props.isOpen) {
      setDraft(draftOf(props.user));
      setError("");
    }
  }, [props.isOpen, props.user]);

  const set = (key: Editable) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.firstName.trim()) {
      setError("The first name cannot be empty.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = Object.fromEntries(EDITABLE.map((key) => [key, draft[key].trim()]));
      const saved = await updateUserProfile(payload);
      props.onSaved({ ...props.user, ...saved });
      toast.success("Profile saved.");
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The profile could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const field = (key: Editable, label: string, wide = false) => (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <Label htmlFor={`profile-${key}`}>{label}</Label>
      <Input id={`profile-${key}`} type="text" value={draft[key]} onChange={set(key)} disabled={saving} />
    </div>
  );

  return (
    <Modal isOpen={props.isOpen} onClose={() => !saving && props.onClose()} className="m-4 max-w-[680px]">
      <form onSubmit={submit} className="w-full rounded-3xl bg-white p-6 dark:bg-gray-900 lg:p-8">
        <h3 className="text-[20px] font-semibold text-gray-900 dark:text-white/90">Edit profile</h3>
        <p className="mt-1 text-[14px] text-gray-500 dark:text-gray-400">
          Your email cannot be changed here.
        </p>

        <h4 className="mt-6 mb-3 text-[15px] font-semibold text-gray-800 dark:text-white/90">About you</h4>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {field("firstName", "First name")}
          {field("lastName", "Last name")}
          {field("position", "Position")}
          {field("institution", "Institution")}
          {field("phone", "Phone", true)}
        </div>

        <h4 className="mt-6 mb-3 text-[15px] font-semibold text-gray-800 dark:text-white/90">Address</h4>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {field("country", "Country")}
          {field("city", "City")}
          {field("postalCode", "Postal code")}
        </div>

        {error ? <p className="mt-4 text-[14px] text-error-600 dark:text-error-400">{error}</p> : null}

        <div className="mt-7 flex justify-end gap-3">
          <Button size="sm" variant="outline" onClick={props.onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function UserProfiles() {
  const { isOpen, openModal, closeModal } = useModal();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    getUserProfile()
      .then((data: UserProfile) => alive && setUser(data))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <PageMeta title="Profile" description="Your profile" />
      <PageBreadcrumb pageTitle="Profile" />
      {!user ? (
        <div className="rounded-[10px] border border-gray-300/85 bg-white p-6 text-[15px] text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
          {failed ? "Your profile could not be loaded. Try again in a moment." : "Loading your profile…"}
        </div>
      ) : (
        <div className="space-y-6">
          <ProfileHeader user={user} onEdit={openModal} />

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
            <div className="space-y-6 xl:col-span-3">
              <Section title="Personal information" right={<EditButton onClick={openModal} />}>
                <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                  <Field label="First name" value={user.firstName} />
                  <Field label="Last name" value={user.lastName} />
                  <Field label="Position" value={user.position} />
                  <Field label="Institution" value={user.institution} />
                  <Field label="Email" value={user.email} />
                  <Field label="Phone" value={user.phone} />
                </dl>
              </Section>

              <Section title="Address" right={<EditButton onClick={openModal} />}>
                <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-3">
                  <Field label="Country" value={user.country} />
                  <Field label="City" value={user.city} />
                  <Field label="Postal code" value={user.postalCode} />
                </dl>
              </Section>
            </div>

            <div className="space-y-6 xl:col-span-2">
              <Section title="Account">
                <dl className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[13.5px] text-gray-500 dark:text-gray-400">Email</dt>
                    <dd className="inline-flex items-center gap-1.5 text-[14px] font-medium text-gray-900 dark:text-white/90">
                      {user.isVerified ? (
                        <>
                          <BadgeCheck className="h-4 w-4 text-success-600" />
                          Verified
                        </>
                      ) : (
                        "Not verified"
                      )}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[13.5px] text-gray-500 dark:text-gray-400">Access</dt>
                    <dd className="inline-flex items-center gap-1.5 text-[14px] font-medium text-gray-900 dark:text-white/90">
                      {user.isSystemAdmin ? (
                        <>
                          <ShieldCheck className="h-4 w-4 text-amber-600" />
                          Administrator
                        </>
                      ) : (
                        <>
                          <Building2 className="h-4 w-4 text-gray-500" />
                          Member
                        </>
                      )}
                    </dd>
                  </div>
                  {formatDate(user.createdAt) ? (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-[13.5px] text-gray-500 dark:text-gray-400">Member since</dt>
                      <dd className="text-[14px] font-medium text-gray-900 dark:text-white/90">
                        {formatDate(user.createdAt)}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </Section>

              <UsageSection />

              <UserPasswordCard />
            </div>
          </div>

          <EditProfileModal user={user} isOpen={isOpen} onClose={closeModal} onSaved={setUser} />
        </div>
      )}
    </>
  );
}
