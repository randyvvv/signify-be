import type { Material } from "../db/schema.js";

const GOAL_CATEGORY_MAP: Record<string, string[]> = {
  k12: ["K-12"],
  vocational: ["Vocational"],
  "higher-ed": ["University"],
  career: ["Career"],
  "sign-lang": ["Sign Language"],
};

const MASTER_FOCUS_CATEGORY_MAP: Record<string, string[]> = {
  "sign-master": ["Sign Language"],
  academic: ["K-12", "University"],
  presentations: ["Career"],
  explore: [],
};

export interface RecommendationPrefs {
  goals?: string[] | null;
  masterFocus?: string | null;
  language?: string | null;
}

export interface MaterialRecommendationCandidate {
  material: Material;
  progress?: number | null;
  completed?: boolean | null;
}

export function goalToCategories(goal: string): string[] {
  return GOAL_CATEGORY_MAP[goal] ?? [];
}

export function masterFocusToCategories(masterFocus?: string | null): string[] {
  if (!masterFocus) return [];
  return MASTER_FOCUS_CATEGORY_MAP[masterFocus] ?? [];
}

export function getUtcDayNumber(date = new Date()): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
      86_400_000,
  );
}

export function getDailyQuizOffset(quizCount: number, date = new Date()): number | null {
  if (quizCount <= 0) return null;
  return getUtcDayNumber(date) % quizCount;
}

function preferenceCategorySets(prefs: RecommendationPrefs): {
  goalCategories: Set<string>;
  masterCategories: Set<string>;
} {
  return {
    goalCategories: new Set((prefs.goals ?? []).flatMap(goalToCategories)),
    masterCategories: new Set(masterFocusToCategories(prefs.masterFocus)),
  };
}

export function isCompletedRecommendation(
  candidate: MaterialRecommendationCandidate,
): boolean {
  const progress = candidate.progress ?? 0;
  return candidate.completed === true || progress >= 100;
}

export function scoreMaterialRecommendation(
  candidate: MaterialRecommendationCandidate,
  prefs: RecommendationPrefs,
): number {
  const { goalCategories, masterCategories } = preferenceCategorySets(prefs);
  const progress = candidate.progress ?? 0;
  let score = 0;

  if (goalCategories.has(candidate.material.category)) score += 50;
  if (masterCategories.has(candidate.material.category)) score += 30;
  if (progress > 0 && progress < 100) score += 25;
  if (prefs.language && candidate.material.language === prefs.language) score += 10;

  return score;
}

export function rankRecommendedMaterials(
  candidates: MaterialRecommendationCandidate[],
  prefs: RecommendationPrefs,
  limit = 5,
): MaterialRecommendationCandidate[] {
  return candidates
    .filter((candidate) => !isCompletedRecommendation(candidate))
    .sort((a, b) => {
      const scoreDiff =
        scoreMaterialRecommendation(b, prefs) - scoreMaterialRecommendation(a, prefs);
      if (scoreDiff !== 0) return scoreDiff;

      const dateDiff = b.material.createdAt.getTime() - a.material.createdAt.getTime();
      if (dateDiff !== 0) return dateDiff;

      return a.material.title.localeCompare(b.material.title);
    })
    .slice(0, limit);
}
