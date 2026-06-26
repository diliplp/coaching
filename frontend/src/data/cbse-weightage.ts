/**
 * Approximate CBSE board exam marks per chapter (2024-25).
 * Based on official CBSE unit-level mark distribution.
 * Arrays are index-aligned with chapters in ncert-syllabus.ts.
 *
 * Class XI: no board exam, so marks are 0 (tracker still useful for JEE/NEET).
 */
export const CBSE_CHAPTER_MARKS: Record<string, number[]> = {
  // ── Class X ─────────────────────────────────────────────────────────────────
  // Maths (80 marks theory)
  // Units: Number System 6, Algebra 20, Coordinate Geometry 6,
  //        Geometry 15, Trigonometry 12, Mensuration 10, Stats+Prob 11
  "X-Mathematics": [6, 5, 5, 5, 5, 10, 6, 8, 4, 5, 5, 5, 7, 4],

  // Science (80 marks)
  // Chemical Substances 25, World of Living 25,
  // Natural Phenomena 12, Effects of Current 13, Natural Resources 5
  "X-Science": [7, 6, 6, 6, 7, 6, 6, 6, 7, 5, 8, 5, 5],

  // English (80 marks — Literature component ~30 marks across 21 chapters)
  "X-English": [
    // First Flight (11 chapters)
    3, 3, 3, 3, 2, 2, 3, 2, 2, 2, 3,
    // Footprints Without Feet (10 chapters)
    2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  ],

  // Social Science: History gets ~20 marks out of 80-mark SST paper
  "X-History": [4, 5, 4, 4, 3],

  // Geography: ~20 marks
  "X-Geography": [3, 3, 3, 3, 3, 3, 2],

  // Political Science: ~20 marks
  "X-Political-Science": [4, 4, 4, 4, 4],

  // Economics: ~20 marks
  "X-Economics": [4, 4, 4, 4, 4],

  // ── Class XI ────────────────────────────────────────────────────────────────
  // No CBSE board exam for Class XI; marks shown as 0.
  // (Chapters are still useful for JEE/NEET tracking.)
  "XI-Physics":    new Array(15).fill(0),
  "XI-Chemistry":  new Array(13).fill(0),
  "XI-Mathematics": new Array(14).fill(0),
  "XI-Biology":    new Array(22).fill(0),
  "XI-English":    new Array(16).fill(0),

  // ── Class XII ────────────────────────────────────────────────────────────────
  // Physics (70 marks)
  // Units: Electrostatics 8, Current 7, Magnetic 9, EMI+AC 8,
  //        EM Waves 5, Optics 14, Dual Nature 4, Atoms+Nuclei 6, Electronics 7
  "XII-Physics": [4, 4, 7, 5, 4, 4, 4, 5, 8, 6, 4, 3, 3, 7],

  // Chemistry (70 marks)
  // Units: Physical 23, Inorganic 22, Organic 25
  "XII-Chemistry": [4, 5, 5, 5, 3, 3, 7, 5, 5, 4, 4, 6, 4, 3, 3, 4],

  // Mathematics (80 marks)
  // Relations+Functions 8, Algebra 10, Calculus 35, Vectors 14,
  // Linear Programming 5, Probability 8
  "XII-Mathematics": [5, 3, 5, 5, 8, 8, 9, 4, 6, 6, 8, 5, 8],

  // Biology (70 marks)
  // Reproduction 16, Genetics+Evolution 20, Bio+Human Welfare 14,
  // Biotechnology 10, Ecology 10
  "XII-Biology": [4, 4, 4, 4, 8, 8, 4, 6, 4, 4, 5, 5, 4, 4, 2],

  // English (80 marks — Literature ~30 marks across 16 chapters)
  "XII-English": [
    // Flamingo (8 chapters)
    4, 4, 4, 4, 4, 3, 3, 4,
    // Vistas (8 chapters)
    4, 4, 4, 4, 3, 3, 3, 3,
  ],
};

/** Returns marks for a chapter, or 0 if not found. */
export function getChapterMarks(subjectKey: string, chapterIndex: number): number {
  return CBSE_CHAPTER_MARKS[subjectKey]?.[chapterIndex] ?? 0;
}

/** True if this subject has CBSE board exam data (non-zero marks). */
export function hasBoardMarks(subjectKey: string): boolean {
  return (CBSE_CHAPTER_MARKS[subjectKey] ?? []).some((m) => m > 0);
}

/** Total marks for a subject. */
export function totalSubjectMarks(subjectKey: string): number {
  return (CBSE_CHAPTER_MARKS[subjectKey] ?? []).reduce((a, b) => a + b, 0);
}

/**
 * Priority score for a chapter:
 * High marks + not yet studied = highest priority.
 * studied = 0, in_progress = 0.5, not_started = 1.0 (multiplier)
 */
export function chapterPriority(
  subjectKey: string,
  chapterIndex: number,
  status: "not_started" | "in_progress" | "studied"
): number {
  const marks = getChapterMarks(subjectKey, chapterIndex);
  const multiplier = status === "studied" ? 0 : status === "in_progress" ? 0.5 : 1.0;
  return Math.round(marks * multiplier * 10) / 10;
}
