import type { Request } from "express";

export type UserRole = "super_admin" | "teacher" | "student";

export type QuestionType = "single_correct" | "multi_correct";

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
}

export interface SubjectBook {
  id: string;
  subjectId: string;
  title: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
  parsedText?: string;
  previewText?: string;
  pageCount?: number;
  extractedAt?: string;
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  passwordHash?: string;
  studentId?: string;
}

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  studentId: string | null;
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
}

export interface GeneratedExamQuestion {
  questionId: string;
  order: number;
  optionOrderIds?: string[];
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
}

export interface TeacherCustomExamRequest {
  name: string;
  batchId: string;
  subjectId: string;
  durationMinutes: number;
  totalQuestions: number;
  selectionMode: TeacherExamSelectionMode;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  rules: WeightedExamRule[];
}

export interface StudentAnswerInput {
  questionId: string;
  selectedOptionIds: string[];
  markedForReview?: boolean;
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
  review?: Array<{
    questionId: string;
    prompt: string;
    selectedOptionIds: string[];
    correctOptionIds: string[];
    explanation: string;
    isCorrect: boolean;
    options: any[];
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
