import type { Request } from "express";

export type UserRole = "super_admin" | "teacher" | "student";

export type AdmissionBoard = "CBSE" | "ICSE" | "GSEB";
export type AdmissionStandard = "11" | "12";

export interface Admission {
  id: string;
  studentName: string;
  dateOfBirth: string;
  schoolName: string;
  standard: AdmissionStandard;
  board: AdmissionBoard;
  batchId: string;
  batchName: string;
  fatherName: string;
  motherName?: string;
  fatherMobileEncrypted: string;
  motherMobileEncrypted?: string;
  emailEncrypted: string;
  createdAt: string;
}

export type QuestionType = "single_correct" | "multi_correct" | "integer";

export type QuestionSource = "pyq" | "reference" | "textbook" | "ai_generated" | "custom";

export type ExamPattern = "jee_mains" | "neet" | "gujcet" | "custom";

export interface ExamSection {
  name: string;               // "Section A", "Section B"
  questionType: "mcq" | "integer";
  totalQuestions: number;
  attemptQuestions: number;   // for optional sections (NEET); equals totalQuestions when all compulsory
  marksCorrect: number;
  marksIncorrect: number;     // 0 for no negative marking
  markingScheme?: "jee_advanced_partial"; // multi-correct: +1 per correct option if no wrong; full marks if all correct; neg if any wrong
  timeLimitMinutes?: number;  // section-level time cap; 0 / undefined = no limit
  topicIds?: string[];        // which topics feed this section
}

export interface ClassNode {
  id: string;
  name: string;
}

export interface StreamNode {
  id: string;
  name: string;
  classId: string;
}

export interface BatchNode {
  id: string;
  name: string;
  classId: string;
  streamId: string;
}

export interface Student {
  id: string;
  name: string;
  batchId: string;
  classId: string;
  streamId: string;
}

export interface Topic {
  id: string;
  subjectId: string;
  chapterId: string;
  name: string;
  bookId?: string;
}

export interface Subject {
  id: string;
  classId: string;
  streamId: string;
  name: string;
}

export interface Chapter {
  id: string;
  subjectId: string;
  name: string;
  bookId?: string;
}

export interface SubjectBook {
  id: string;
  subjectId: string;
  title: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
  bookType?: "pyq" | "reference" | "textbook";
  parsedText?: string;
  previewText?: string;
  pageCount?: number;
  extractedAt?: string;
  extractionStatus?: "idle" | "running" | "done" | "error";
  extractionProgress?: string;
  extractionQuestionCount?: number;
  /** Optional link to a separately-uploaded solution/answer-key book for this
   * (usually bare, answer-free) question paper. Used to auto-derive correct
   * answers without exposing them anywhere in this book's own file or crops. */
  answerKeyBookId?: string;
  /** Manually-typed answer key string (e.g. "D,A,C,B,A" or "DACBA"), applied by array
   * position rather than question number — the alternative to answerKeyBookId's
   * more robust number-matched linking. See POST /subject-books/:id/apply-answer-key. */
  answerKey?: string;
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  passwordHash?: string;
  studentId?: string;
  sessionId?: string;
  sessionStartedAt?: string | null;
  mustChangePassword?: boolean;
  isActive?: boolean;
}

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  studentId: string | null;
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthTokenPayload;
}

export interface QuestionOption {
  id: string;
  label: string;
  value: string;
}

export interface Question {
  id: string;
  subjectId: string;
  topicId: string;
  type: QuestionType;
  prompt: string;
  difficulty: "easy" | "medium" | "hard";
  marks: number;
  negativeMarks: number;
  correctOptionIds: string[];
  options: QuestionOption[];
  explanation: string;
  sourceType?: QuestionSource;
  isVerified?: boolean;
  bookId?: string;
  questionNumber?: number;
  integerAnswer?: number;     // for type === "integer" (JEE Section B)
  pyqYear?: number;           // e.g. 2022
  pyqExamName?: string;       // e.g. "JEE Mains", "NEET", "GUJCET", "JEE Advanced"
  pyqSession?: string;        // e.g. "January Session", "Paper 1"
  passageText?: string;       // paragraph/comprehension stimulus shown above the question
  pageNumber?: number;        // source PDF page this question was extracted from (extraction pipeline only)
  /** Post-extraction QA signals (additive to isVerified, not a replacement — isVerified
   * only means "an answer was found"; these mean "extraction fidelity was checked").
   * Set by verifyExtractedQuestions() at the end of the extraction pipeline. Never
   * auto-"approved" — a clean question stays "unreviewed" until a human glances at it. */
  qaFlags?: string[];
  qaStatus?: "unreviewed" | "flagged" | "approved" | "rejected";
  qaCheckedAt?: string;
  /** Optional free-text note an admin left when approving/rejecting via POST
   * /admin/questions/:id/qa-review. */
  qaReviewNotes?: string;
}

export interface ExamBlueprintTopicRule {
  topicId: string;
  questionCount: number;
}

export interface WeightedExamRule {
  entityId: string;
  weightagePercent: number;
}

export type TeacherExamSelectionMode = "chapter" | "topic";

export interface ExamBlueprint {
  id: string;
  name: string;
  classId: string;
  streamId: string;
  batchId: string;
  subjectId: string;
  durationMinutes: number;
  negativeMarkingEnabled: boolean;
  topicRules: ExamBlueprintTopicRule[];
  examPattern?: ExamPattern;
  sections?: ExamSection[];   // when set, section-aware grading applies
}

export interface GeneratedExamQuestion {
  questionId: string;
  order: number;
  optionOrderIds?: string[];
  marksOverride?: number;         // exam-specific mark (manual exam builder)
  negativeMarksOverride?: number; // exam-specific negative mark (manual exam builder)
}

export interface Exam {
  id: string;
  blueprintId: string;
  name: string;
  classId: string;
  streamId: string;
  batchId: string;
  subjectId: string;
  durationMinutes: number;
  generatedAt: string;
  generationMode?: "blueprint" | "adaptive" | "custom";
  adaptiveForStudentId?: string;
  adaptiveSummary?: string;
  sourceSignature?: string;
  questions: GeneratedExamQuestion[];
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  examPattern?: ExamPattern;
  sections?: ExamSection[];   // carried from blueprint; drives UI and grading
}

export interface TeacherCustomExamRequest {
  name: string;
  batchId: string;
  subjectId?: string;
  subjectIds?: string[];
  durationMinutes: number;
  totalQuestions: number;
  selectionMode: TeacherExamSelectionMode;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  rules: WeightedExamRule[];
  allowedSourceTypes?: QuestionSource[];
  /** When true, hard-excludes questions already used in ANY previous exam for this
   * batch (not just exams with the same generation signature — see the existing softer
   * sourceSignature-based dedup in getUsedQuestionIds/pickQuestions, which only avoids
   * repeats within identically-shaped re-generations). Opt-in via a checkbox in the
   * exam builder UI. */
  excludeUsedQuestions?: boolean;
}

export interface StudentAnswerInput {
  questionId: string;
  selectedOptionIds: string[];
  integerAnswer?: number;     // for integer-type questions
  markedForReview?: boolean;
  timeSpentSeconds?: number;  // per-question time (set at submit time)
}

export interface TopicInsight {
  topicId: string;
  topicName: string;
  totalQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  unattemptedAnswers: number;
  accuracy: number;
  weaknessScore: number;
}

export interface TimingStats {
  totalTimeSeconds: number;
  avgTimePerQuestion: number;
  slowestQuestionId: string | null;
  fastestAnsweredQuestionId: string | null;
  impulseErrors: number;    // fast + wrong (< 30s and incorrect)
  stuckCount: number;       // slow + wrong (> 180s and incorrect)
}

export interface NegativeMarkingAnalysis {
  totalNegativeMarks: number;       // marks actually deducted this exam
  recoverableMarks: number;         // marks that would have been saved by skipping all wrong answers
  counterfactualScore: number;      // obtainedMarks + recoverableMarks
  counterfactualPercentage: number;
  skipCandidates: Array<{
    questionId: string;
    marksLost: number;
    timeSpentSeconds?: number;
    category: "impulse" | "stuck" | "uncertain";  // impulse < 30s, stuck > 180s, else uncertain
  }>;
}

export interface ExamSubmissionResult {
  id: string;
  examId: string;
  studentId: string;
  totalMarks: number;
  obtainedMarks: number;
  correctAnswers: number;
  incorrectAnswers: number;
  unattemptedAnswers: number;
  percentage: number;
  weakestTopics: TopicInsight[];
  insights: TopicInsight[];
  timingStats?: TimingStats;
  negativeMarkingAnalysis?: NegativeMarkingAnalysis;
  review?: Array<{
    questionId: string;
    prompt: string;
    selectedOptionIds: string[];
    correctOptionIds: string[];
    explanation: string;
    isCorrect: boolean;
    options: any[];
    timeSpentSeconds?: number;
    speedZone?: "fast" | "normal" | "slow";
    marksLost?: number;    // marks deducted for this wrong answer (only set when > 0)
    marksGained?: number;  // marks awarded for this correct answer
  }>;
}

export interface AdaptiveExamPlanTopic {
  topicId: string;
  topicName: string;
  questionCount: number;
  reason: string;
  averageAccuracy: number;
  averageWeaknessScore: number;
}

export interface AdaptiveExamPlan {
  studentId: string;
  studentName: string;
  subjectId: string;
  subjectName: string;
  basedOnSubmissionCount: number;
  durationMinutes: number;
  topics: AdaptiveExamPlanTopic[];
  summary: string;
}

export interface BatchAdaptivePlan {
  batchId: string;
  batchName: string;
  subjectId: string;
  subjectName: string;
  basedOnSubmissionCount: number;
  studentsConsidered: number;
  durationMinutes: number;
  topics: AdaptiveExamPlanTopic[];
  summary: string;
}

export interface ExamSession {
  id: string;
  examId: string;
  studentId: string;
  startedAt: string;
  answers: Record<string, string[]>;
  currentQuestionIndex: number;
  status: "in_progress" | "submitted";
}
