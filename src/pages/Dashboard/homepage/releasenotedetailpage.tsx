// src/pages/releasenotedetailpage.tsx
import { Link, useParams } from "react-router-dom";

import PageMeta from "@/components/common/PageMeta";
import {
  ArrowLeft,
  ChevronRight,
  Download,
  ExternalLink,
} from "lucide-react";

export type ReleaseBadge = "beta" | "stable" | "major";
export type ReleaseItemKind = "note" | "fixed" | "improved" | "added" | "changed";

export type ReleaseItem = {
  kind: ReleaseItemKind;
  text: string;
};

export type ReleaseEntry = {
  version: string;
  title: string;
  date: string;
  major: string;
  series: string;
  badges: ReleaseBadge[];
  downloadUrl: string;
  instructionsUrl: string;
  items: ReleaseItem[];
};

function classNames(...xs: Array<string | false | null | undefined>): string {
  // classNames
  return xs.filter(Boolean).join(" ");
}

export function getReleasePath(version: string): string {
  // getReleasePath
  return `/release-notes/${encodeURIComponent(version)}`;
}

export function formatReleaseDate(raw: string): string {
  // formatReleaseDate
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;

  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(d);
  } catch {
    return raw;
  }
}

export function getReleaseBadgeClasses(badge: ReleaseBadge): string {
  // getReleaseBadgeClasses
  switch (badge) {
    case "beta":
      return classNames(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        "bg-emerald-100 text-emerald-700",
        "dark:bg-emerald-950/40 dark:text-emerald-300",
      );
    case "major":
      return classNames(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        "bg-violet-100 text-violet-700",
        "dark:bg-violet-950/40 dark:text-violet-300",
      );
    case "stable":
      return classNames(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        "bg-gray-100 text-gray-700",
        "dark:bg-slate-800 dark:text-gray-300",
      );
    default:
      return classNames(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        "bg-gray-100 text-gray-700",
        "dark:bg-slate-800 dark:text-gray-300",
      );
  }
}

function getChangeTypeClasses(kind: ReleaseItemKind): string {
  // getChangeTypeClasses
  switch (kind) {
    case "note":
      return classNames(
        "border-gray-300 bg-white text-gray-700",
        "dark:border-gray-600 dark:bg-slate-900 dark:text-gray-300",
      );
    case "fixed":
      return classNames(
        "border-orange-300 bg-orange-50 text-orange-700",
        "dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300",
      );
    case "improved":
      return classNames(
        "border-blue-300 bg-blue-50 text-blue-700",
        "dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300",
      );
    case "added":
      return classNames(
        "border-emerald-300 bg-emerald-50 text-emerald-700",
        "dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300",
      );
    case "changed":
      return classNames(
        "border-violet-300 bg-violet-50 text-violet-700",
        "dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300",
      );
    default:
      return classNames(
        "border-gray-300 bg-white text-gray-700",
        "dark:border-gray-600 dark:bg-slate-900 dark:text-gray-300",
      );
  }
}

export const releaseEntries: ReleaseEntry[] = [
  {
    version: "v4.0.0",
    title: "ScipionWeb v4.0.0",
    date: "2026-06-01",
    major: "v4",
    series: "v4.0",
    badges: ["major", "beta"],
    downloadUrl: "https://fonsecareyna82.github.io/scipion-docs/latest/installation/download-bundles/",
    instructionsUrl: "https://fonsecareyna82.github.io/scipion-docs/latest/installation/upgrade/",
    items: [
      {
        kind: "note",
        text: "This entry defines the initial baseline for ScipionWeb release notes and the first public versioning structure for the web interface.",
      },
      {
        kind: "added",
        text: "Added a dedicated release notes area with index and detail pages for tracking web updates.",
      },
      {
        kind: "added",
        text: "Added a cleaner Home integration so release notes are accessible directly from the main workspace.",
      },
      {
        kind: "improved",
        text: "Improved the visual structure of update communication with a simpler and more documentation-oriented layout.",
      },
      {
        kind: "changed",
        text: "Established the first release-note baseline for ScipionWeb as part of the broader Scipion v4 ecosystem.",
      },
    ],
  },
];

function getReleaseByVersion(version: string): ReleaseEntry | undefined {
  // getReleaseByVersion
  return releaseEntries.find((release) => release.version.toLowerCase() === version.toLowerCase());
}

function TopActionButton(props: {
  href: string;
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
}) {
  // TopActionButton
  return (
    <a
      href={props.href}
      target="_blank"
      rel="noreferrer"
      className={classNames(
        "inline-flex items-center gap-2 rounded-[10px] px-5 py-3 text-sm font-semibold transition",
        props.primary
          ? "bg-blue-600 text-white hover:bg-blue-700"
          : "bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-slate-800 dark:text-blue-300 dark:hover:bg-slate-700",
      )}
    >
      {props.icon}
      {props.label}
    </a>
  );
}

function ChangeRow(props: { item: ReleaseItem }) {
  // ChangeRow
  const label =
    props.item.kind === "note"
      ? "Note"
      : props.item.kind === "fixed"
        ? "Fixed"
        : props.item.kind === "improved"
          ? "Improved"
          : props.item.kind === "added"
            ? "Added"
            : "Changed";

  return (
    <div className="flex items-start gap-4 border-b border-gray-200 py-4 last:border-b-0 dark:border-gray-800">
      <div className="w-[92px] shrink-0 pt-0.5">
        <span
          className={classNames(
            "inline-flex min-w-[72px] items-center justify-center rounded-full border px-2.5 py-1 text-xs font-medium",
            getChangeTypeClasses(props.item.kind),
          )}
        >
          {label}
        </span>
      </div>

      <div className="min-w-0 flex-1 text-[15px] leading-7 text-slate-700 dark:text-slate-300">
        {props.item.text}
      </div>
    </div>
  );
}

export default function ReleaseNoteDetailPage() {
  const params = useParams();
  const versionParam = decodeURIComponent(params.version ?? "").trim();
  const release = getReleaseByVersion(versionParam);

  if (!release) {
    return (
      <>
        <PageMeta title="Release not found | Scipion" description="Release note not found" />

        <div className="min-h-full bg-[#f5f7fb] px-4 py-6 dark:bg-slate-950 md:px-6 md:py-8">
          <div className="mx-auto w-full max-w-5xl">
            <div className="rounded-[10px] border border-gray-200 bg-white px-6 py-8 dark:border-gray-700 dark:bg-slate-900">
              <h1 className="text-2xl font-bold tracking-[-0.02em] text-slate-950 dark:text-white">
                Release not found
              </h1>
              <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                The requested release note could not be found.
              </p>

              <div className="mt-6">
                <Link
                  to="/release-notes"
                  className={classNames(
                    "inline-flex items-center gap-2 rounded-[10px] border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-gray-50",
                    "dark:border-gray-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800",
                  )}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to all releases
                </Link>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageMeta title={`${release.title} | Scipion`} description={release.title} />

      <div className="min-h-full bg-[#f5f7fb] px-4 py-6 dark:bg-slate-950 md:px-6 md:py-8">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-8 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Link to="/release-notes" className="hover:text-slate-700 dark:hover:text-slate-200">
              All Releases
            </Link>
            <ChevronRight className="h-4 w-4" />
            <Link
              to={`/release-notes#${release.major}`}
              className="hover:text-slate-700 dark:hover:text-slate-200"
            >
              {release.major}
            </Link>
            <ChevronRight className="h-4 w-4" />
            <Link
              to={`/release-notes#${release.series}`}
              className="hover:text-slate-700 dark:hover:text-slate-200"
            >
              {release.series}
            </Link>
            <ChevronRight className="h-4 w-4" />
            <span>{release.version}</span>
          </div>

          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <h1 className="text-4xl font-bold tracking-[-0.03em] text-slate-950 dark:text-white">
                {release.title}
              </h1>

              <div className="mt-5 flex flex-wrap items-center gap-3 text-[15px] text-slate-600 dark:text-slate-300">
                <span>Released {formatReleaseDate(release.date)}</span>

                {release.badges.map((badge) => (
                  <span key={`${release.version}-${badge}`} className={getReleaseBadgeClasses(badge)}>
                    {badge === "major" ? "Major" : badge === "beta" ? "Beta" : "Stable"}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <TopActionButton
                href={release.downloadUrl}
                icon={<Download className="h-4 w-4" />}
                label="Download & Install"
                primary
              />
              <TopActionButton
                href={release.instructionsUrl}
                icon={<ExternalLink className="h-4 w-4" />}
                label="Update Instructions"
              />
            </div>
          </div>

          <div className="mt-8 rounded-[10px] border border-gray-200 bg-white px-6 py-5 dark:border-gray-700 dark:bg-slate-900">
            {release.items.map((item, index) => (
              <ChangeRow key={`${release.version}-${item.kind}-${index}`} item={item} />
            ))}
          </div>

          <div className="mt-6">
            <Link
              to="/release-notes"
              className={classNames(
                "inline-flex items-center gap-2 rounded-[10px] border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-gray-50",
                "dark:border-gray-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800",
              )}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to all releases
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}