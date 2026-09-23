import type { TomogramReview, TomogramReviewCriteria } from "@/services/ProjectService";

export const EMPTY_TOMOGRAM_REVIEW_CRITERIA: TomogramReviewCriteria = {
  qualities: [],
  tags: [],
  minimumTagCounts: {},
};

function reviewTagKeys(review: TomogramReview): string[] {
  const tags = review.values.tags;
  return Array.isArray(tags)
    ? tags.filter((tag): tag is string => typeof tag === "string")
    : [];
}

function reviewTagCount(review: TomogramReview, tagKey: string, tagKeys: Set<string>): number {
  const rawCounts = review.values.tagCounts;
  if (rawCounts && typeof rawCounts === "object" && !Array.isArray(rawCounts)) {
    const rawCount = (rawCounts as Record<string, unknown>)[tagKey];
    if (typeof rawCount === "number" && Number.isFinite(rawCount)) {
      return Math.max(0, Math.floor(rawCount));
    }
  }

  return tagKeys.has(tagKey) ? 1 : 0;
}

export function hasActiveTomogramReviewCriteria(criteria: TomogramReviewCriteria): boolean {
  return criteria.qualities.length > 0 || criteria.tags.length > 0 ||
    Object.values(criteria.minimumTagCounts).some((count) => count > 0);
}

export function matchesTomogramReviewCriteria(
  review: TomogramReview,
  criteria: TomogramReviewCriteria,
): boolean {
  const quality = typeof review.values.quality === "string" ? review.values.quality : "";
  if (criteria.qualities.length > 0 && !criteria.qualities.includes(quality)) return false;

  const tagKeys = new Set(reviewTagKeys(review));
  if (!criteria.tags.every((tagKey) => tagKeys.has(tagKey))) return false;

  return Object.entries(criteria.minimumTagCounts).every(([tagKey, minimumCount]) => {
    return minimumCount <= 0 || reviewTagCount(review, tagKey, tagKeys) >= minimumCount;
  });
}
