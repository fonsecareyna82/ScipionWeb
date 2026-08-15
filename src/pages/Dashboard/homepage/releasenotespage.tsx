// src/pages/releasenotespage.tsx
import { useMemo } from "react";
import { Link } from "react-router-dom";

import PageMeta from "@/components/common/PageMeta";
import {
  Download,
  ExternalLink,
  FileText,
} from "lucide-react";

import {
  releaseEntries,
  formatReleaseDate,
  getReleaseBadgeClasses,
  getReleasePath,
} from "./releasenotedetailpage";

type GroupedSeries = {
  key: string;
  releases: typeof releaseEntries;
};

type GroupedMajor = {
  key: string;
  series: GroupedSeries[];
};

function classNames(...xs: Array<string | false | null | undefined>): string {
  // classNames
  return xs.filter(Boolean).join(" ");
}

function getVisibleBadges(badges: string[]): string[] {
  // getVisibleBadges
  return badges.filter((badge) => badge !== "stable");
}

function groupReleases(): GroupedMajor[] {
  // groupReleases
  const majorMap = new Map<string, Map<string, typeof releaseEntries>>();

  for (const release of releaseEntries) {
    const majorBucket = majorMap.get(release.major) ?? new Map<string, typeof releaseEntries>();
    const seriesBucket = majorBucket.get(release.series) ?? [];

    seriesBucket.push(release);
    majorBucket.set(release.series, seriesBucket);
    majorMap.set(release.major, majorBucket);
  }

  return Array.from(majorMap.entries()).map(([majorKey, seriesMap]) => {
    const series = Array.from(seriesMap.entries()).map(([seriesKey, releases]) => ({
      key: seriesKey,
      releases,
    }));

    return {
      key: majorKey,
      series,
    };
  });
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

function ReleaseRow(props: { release: (typeof releaseEntries)[number] }) {
  // ReleaseRow
  const visibleBadges = getVisibleBadges(props.release.badges);

  return (
    <Link
      to={getReleasePath(props.release.version)}
      className={classNames(
        "flex items-center gap-4 rounded-[10px] border border-gray-200 bg-white px-5 py-4 transition",
        "hover:border-gray-300 hover:bg-gray-50",
        "dark:border-gray-700 dark:bg-slate-900 dark:hover:border-gray-600 dark:hover:bg-slate-800/70",
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white">
        <FileText className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold text-gray-950 dark:text-white">
            {props.release.version}
          </span>

          {visibleBadges.map((badge) => (
            <span
              key={`${props.release.version}-${badge}`}
              className={getReleaseBadgeClasses(badge as any)}
            >
              {badge === "major" ? "Major" : badge === "beta" ? "Beta" : "Stable"}
            </span>
          ))}
        </div>
      </div>

      <div className="shrink-0 text-sm text-gray-500 dark:text-gray-400">
        {formatReleaseDate(props.release.date)}
      </div>
    </Link>
  );
}

export default function ReleaseNotesPage() {
  const groupedReleases = useMemo(() => groupReleases(), []);

  return (
    <>
      <PageMeta title="Release notes | Scipion" description="Scipion release notes" />

      <div className="min-h-full bg-[#f5f7fb] px-4 py-6 dark:bg-slate-950 md:px-6 md:py-8">
        <div className="mx-auto w-full max-w-5xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-[-0.02em] text-slate-950 dark:text-white">
                All Updates
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <TopActionButton
                href="https://fonsecareyna82.github.io/scipion-docs/installation/download-bundles/"
                icon={<Download className="h-4 w-4" />}
                label="Download & Install"
                primary
              />
              <TopActionButton
                href="https://fonsecareyna82.github.io/scipion-docs/installation/upgrade/"
                icon={<ExternalLink className="h-4 w-4" />}
                label="Update Instructions"
              />
            </div>
          </div>

          <div className="mt-8 space-y-10">
            {groupedReleases.map((majorGroup) => (
              <section key={majorGroup.key} id={majorGroup.key}>
                <div className="flex items-center justify-between gap-4 border-b border-gray-200 pb-4 dark:border-gray-800">
                  <h2 className="text-2xl font-bold tracking-[-0.02em] text-slate-950 dark:text-white">
                    {majorGroup.key}
                  </h2>

                  <Link
                    to="/release-notes"
                    className={classNames(
                      "rounded-[10px] border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-gray-50",
                      "dark:border-gray-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800",
                    )}
                  >
                    View all releases
                  </Link>
                </div>

                <div className="mt-5 space-y-7">
                  {majorGroup.series.map((seriesGroup) => (
                    <div key={seriesGroup.key} id={seriesGroup.key}>
                      <div className="mb-3 flex items-center justify-between gap-4">
                        <h3 className="text-[15px] font-semibold text-slate-950 dark:text-white">
                          {seriesGroup.key}
                        </h3>

                        <Link
                          to="/release-notes"
                          className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
                        >
                          View all releases
                        </Link>
                      </div>

                      <div className="space-y-2.5">
                        {seriesGroup.releases.map((release) => (
                          <ReleaseRow key={release.version} release={release} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}