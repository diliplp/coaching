export interface OverviewResponse {
  stats: Record<string, number>;
  classes: Array<{ id: string; name: string }>;
  streams: Array<{ id: string; name: string; classId: string }>;
  batches: Array<{ id: string; name: string; classId: string; streamId: string }>;
  students: Array<{ id: string; name: string; batchId: string; classId: string; streamId: string }>;
  blueprints: Array<{ id: string; name: string; durationMinutes: number }>;
  scheduledExams: Array<{ id: string; name: string; durationMinutes: number; scheduledStartTime?: string; scheduledEndTime?: string }>;
  recentSubmissions: ExamResult[];
}

export interface QuestionBankResponse {
  subjects: Array<{ id: string; name: string; classId: string; streamId: string }>;
  chapters: Array<{ id: string; name: string; subjectId: string }>;
  topics: Array<{ id: string; name: string; subjectId: string; chapterId: string }>;
  questions: Question[];
}

export interface Question {
  id: string;
  prompt: string;
  type: "single_correct" | "multi_correct";
  difficulty: "easy" | "medium" | "hard";
  marks: number;
  negativeMarks: number;
  explanation: string;
  options: Array<{ id: string; label: string; value: string }>;
  subjectName?: string;
  topicName?: string;
  chapterName?: string;
}

export interface ExamPayload {
  exam: {
    id: string;
    name: string;
    durationMinutes: number;
    generationMode?: "blueprint" | "adaptive" | "custom";
    adaptiveSummary?: string;
    scheduledStartTime?: string;
    scheduledEndTime?: string;
  };
  questions: Question[];
  plan?: AdaptivePlan;
}

export interface BlueprintSummary {
  id: string;
  name: string;
  durationMinutes: number;
  className: string;
  streamName: string;
  batchName: string;
  subjectName: string;
}

export interface TeacherCustomExamRequest {
  name: string;
  batchId: string;
  subjectId: string;
  durationMinutes: number;
  totalQuestions: number;
  selectionMode: "chapter" | "topic";
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  rules: Array<{
    entityId: string;
    weightagePercent: number;
  }>;
}

export interface SubjectBook {
  id: string;
  subjectId: string;
  title: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
  subjectName?: string;
  previewText?: string;
  pageCount?: number;
  extractedAt?: string;
}

export interface SubjectBooksResponse {
  subjects: Array<{
    id: string;
    name: string;
    classId: string;
    streamId: string;
    className: string;
    streamName: string;
  }>;
  books: SubjectBook[];
  referencePapers: ReferencePaper[];
}

export interface TopicInsight {
  topicId: string;
  topicName: string;
  accuracy: number;
  weaknessScore: number;
  totalQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  unattemptedAnswers: number;
}

export interface ExamResult {
  id?: string;
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

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "super_admin" | "teacher" | "student";
  studentId: string | null;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface AdaptivePlanTopic {
  topicId: string;
  topicName: string;
  questionCount: number;
  reason: string;
  averageAccuracy: number;
  averageWeaknessScore: number;
}

export interface AdaptivePlan {
  studentId: string;
  studentName: string;
  subjectId: string;
  subjectName: string;
  basedOnSubmissionCount: number;
  durationMinutes: number;
  topics: AdaptivePlanTopic[];
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
  topics: AdaptivePlanTopic[];
  summary: string;
}

export interface ReferencePaper {
  id: string;
  fileName: string;
  displayName: string;
  relativePath: string;
  subject: string;
  category: string;
  classLevel: string;
  fileType: "pdf" | "zip";
  fileUrl: string;
}
