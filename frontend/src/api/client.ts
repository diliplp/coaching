import type {
  AdaptivePlan,
  AuthResponse,
  BatchAdaptivePlan,
  BlueprintSummary,
  CombinedExamRequest,
  ExamPayload,
  ExamResult,
  ManualExamRequest,
  OverviewResponse,
  QuestionBankResponse,
  SubjectBook,
  SubjectBooksResponse,
  TeacherCustomExamRequest
} from "../types";
import { getStoredSession } from "../auth";

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || "/api";
const API_BASE_URL = rawApiBaseUrl.endsWith("/")
  ? rawApiBaseUrl.slice(0, -1)
  : rawApiBaseUrl;

export function buildApiUrl(path: string) {
  return `${API_BASE_URL}${path}`;
}

export function buildPublicAssetUrl(path: string) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const assetBaseUrl = import.meta.env.VITE_PUBLIC_ASSET_BASE_URL?.trim() || "";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (assetBaseUrl) {
    return `${assetBaseUrl.replace(/\/$/, "")}${normalizedPath}`;
  }

  return normalizedPath;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const session = typeof window === "undefined" ? null : getStoredSession();
  const response = await fetch(buildApiUrl(path), {
    headers: {
      "Content-Type": "application/json",
      ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Clear session on unauthorized and force redirect
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("coaching-auth-session");
        window.location.href = "/login";
      }
    }
    let errorMessage = `Request failed: ${response.status}`;
    try {
      const errorData = await response.json();
      if (errorData.message) errorMessage = errorData.message;
    } catch (e) {
      // Ignore if not JSON
    }
    throw new Error(errorMessage);
  }

  if (response.status === 204) {
    return null as any;
  }

  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (null as any);
}

export interface JobStreamHandlers {
  onProgress: (message: string) => void;
  onComplete: (data: { count?: number; [key: string]: any }) => void;
  onError: (message: string) => void;
}

/**
 * Opens an SSE job stream using fetch + ReadableStream.
 * Using fetch instead of EventSource avoids EventSource's automatic-reconnect onerror
 * behavior and works correctly through Vite's dev proxy.
 * Returns a cleanup function to abort the stream.
 */
export function openJobStream(jobId: string, handlers: JobStreamHandlers): () => void {
  const controller = new AbortController();
  let settled = false;

  const settle = (fn: () => void) => {
    if (!settled) { settled = true; fn(); }
  };

  (async () => {
    try {
      const url = buildApiUrl(`/jobs/${jobId}/stream`);
      const response = await fetch(url, {
        headers: { Accept: "text/event-stream" },
        signal: controller.signal,
      });

      if (!response.ok) {
        settle(() => handlers.onError(`Stream connection failed (HTTP ${response.status})`));
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by double newline
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop()!; // last (possibly incomplete) block stays in buffer

        for (const block of blocks) {
          for (const line of block.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6)) as { type: string; message: string; data?: any };
              if (event.type === "progress") {
                handlers.onProgress(event.message);
              } else if (event.type === "complete") {
                settle(() => handlers.onComplete(event.data ?? {}));
                controller.abort();
                return;
              } else if (event.type === "error") {
                settle(() => handlers.onError(event.message || "Generation failed"));
                controller.abort();
                return;
              }
            } catch {
              // ignore malformed SSE data lines
            }
          }
        }
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return; // intentional cleanup, not an error
      settle(() => handlers.onError("Connection to generation stream lost. Please check your network."));
    }
  })();

  return () => { controller.abort(); };
}

export const apiClient = {
  login: (payload: { email: string; password: string; role?: string }) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    request<AuthResponse>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  logout: () =>
    request<void>("/auth/logout", { method: "POST" }),
  getMe: () => request<AuthResponse["user"]>("/me"),
  getOverview: () => request<OverviewResponse>("/overview"),
  getAnalytics: () => request<any>("/analytics"),
  getExams: () => request<any[]>("/exams"),
  getExam: (id: string) => request<ExamPayload>(`/exams/${id}`),
  selfGenerateExam: (payload: { topicId?: string; topicIds?: string[]; questionCount?: number; allowedSourceTypes?: string[] }) =>
    request<ExamPayload>("/exams/self-generate", { method: "POST", body: JSON.stringify(payload) }),
  deleteExam: (id: string) => request<void>(`/exams/${id}`, { method: "DELETE" }),
  getBatchAnalytics: (examId: string) => request<any>(`/exams/${examId}/batch-analytics`),
  generateRevisionSet: (submissionId: string, questionCount?: number) =>
    request<any>(`/submissions/${submissionId}/revision-set`, {
      method: "POST",
      body: JSON.stringify({ questionCount: questionCount ?? 15 })
    }),
  getPyqFrequency: (subjectId?: string) =>
    request<{ allYears: number[]; topics: any[]; subjectId: string | null }>(
      `/pyq-frequency${subjectId ? `?subjectId=${subjectId}` : ""}`
    ),
  updateExam: (id: string, payload: { name?: string; durationMinutes?: number; scheduledStartTime?: string; scheduledEndTime?: string; batchId?: string }) =>
    request<any>(`/exams/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  getQuestionBank: () => request<QuestionBankResponse>("/question-bank"),
  createQuestion: (payload: any) => request<any>("/questions", { method: "POST", body: JSON.stringify(payload) }),
  updateQuestion: (id: string, payload: any) => request<any>(`/questions/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteQuestion: (id: string) => request<void>(`/questions/${id}`, { method: "DELETE" }),
  getBlueprints: () => request<BlueprintSummary[]>("/blueprints"),
  getAdaptivePlan: (studentId: string, subjectId?: string) =>
    request<AdaptivePlan>(`/adaptive-plan/${studentId}${subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : ""}`),
  getBatchAdaptivePlans: (subjectId?: string) =>
    request<BatchAdaptivePlan[]>(`/adaptive-plan/batches${subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : ""}`),
  getMyAdaptiveSuggestion: () => request<AdaptivePlan>("/students/me/adaptive-suggestion"),
  getMySubmissions: () =>
    request<{ id: string; examId: string; examName: string; submittedAt: string; totalMarks: number; obtainedMarks: number; percentage: number; correctAnswers: number; incorrectAnswers: number; unattemptedAnswers: number }[]>(
      "/students/me/submissions"
    ),
  getMySubmission: (submissionId: string) => request<any>(`/students/me/submissions/${submissionId}`),
  getSubjectBooks: () => request<SubjectBooksResponse>("/subject-books"),
  uploadSubjectBook: async (payload: { subjectId: string; title: string; file: File; bookType?: string; ocr?: boolean }) => {
    const session = getStoredSession();
    const formData = new FormData();
    formData.append("subjectId", payload.subjectId);
    formData.append("title", payload.title);
    formData.append("pdf", payload.file);
    if (payload.bookType) formData.append("bookType", payload.bookType);
    if (payload.ocr) formData.append("ocr", "true");

    const response = await fetch(buildApiUrl("/subject-books"), {
      method: "POST",
      headers: session?.token ? { Authorization: `Bearer ${session.token}` } : undefined,
      body: formData
    });

    if (!response.ok) {
      let errorMessage = `Upload failed: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.message) errorMessage = errorData.message;
      } catch (e) { /* ignore */ }
      throw new Error(errorMessage);
    }

    return response.json() as Promise<SubjectBook>;
  },
  deleteSubjectBook: (id: string) => request<void>(`/subject-books/${id}`, { method: "DELETE" }),
  applyAnswerKey: (bookId: string, answerKey: string) =>
    request<{ message: string; updatedCount: number; total: number; applied: string[] }>(
      `/subject-books/${bookId}/apply-answer-key`,
      { method: "POST", body: JSON.stringify({ answerKey }) }
    ),
  generateExam: (blueprintId: string) =>
    request<ExamPayload>(`/exams/generate/${blueprintId}`, {
      method: "POST"
    }),
  generateCustomExam: (payload: TeacherCustomExamRequest) =>
    request<ExamPayload>("/exams/generate-custom", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  generateCombinedExam: (payload: CombinedExamRequest) =>
    request<ExamPayload>("/exams/generate-combined", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  buildManualExam: (payload: ManualExamRequest) =>
    request<ExamPayload>("/exams/build-manual", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  generateAdaptiveExam: (payload: { studentId: string; subjectId?: string }) =>
    request<ExamPayload>("/exams/adaptive-generate", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  generateMyAdaptiveExam: () =>
    request<ExamPayload>("/students/me/adaptive-generate", {
      method: "POST"
    }),
  submitExam: (examId: string, payload: { studentId?: string; answers: Array<{ questionId: string; selectedOptionIds: string[] }> }) =>
    request<ExamResult>(`/exams/${examId}/submit`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  sendExamHeartbeat: (examId: string, payload: { answeredCount: number; totalQuestions: number; currentQuestionIndex: number; status: "taking" | "submitted" }) =>
    request<{ status: string }>(`/exams/${examId}/heartbeat`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  reportViolation: (examId: string, type: string) =>
    request<{ status: string; totalViolations: number }>(`/exams/${examId}/violation`, {
      method: "POST",
      body: JSON.stringify({ type }),
    }),
  getExamSession: (examId: string) =>
    request<{ id: string; examId: string; answers: Record<string, string[]>; integerAnswers?: Record<string, string>; startedAt: string; status: string; timeRemainingSeconds: number; currentQuestionIndex: number }>(
      `/exams/${examId}/session`
    ),
  createExamSession: (examId: string) =>
    request<{ id: string; examId: string; answers: Record<string, string[]>; integerAnswers?: Record<string, string>; startedAt: string; status: string; timeRemainingSeconds: number; currentQuestionIndex: number }>(
      `/exams/${examId}/session`, { method: "POST" }
    ),
  getMySubmissionForExam: (examId: string) =>
    request<ExamResult>(`/exams/${examId}/my-submission`),
  saveExamSessionAnswer: (examId: string, payload: { questionId: string; selectedOptionIds: string[]; integerAnswer?: number }) =>
    request<{ status: string }>(`/exams/${examId}/session/answer`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  saveExamSessionIndex: (examId: string, currentQuestionIndex: number) =>
    request<{ status: string }>(`/exams/${examId}/session/index`, {
      method: "PATCH",
      body: JSON.stringify({ currentQuestionIndex })
    }),
  getLiveExamStatus: (examId: string) =>
    request<{
      examId: string;
      examName: string;
      totalQuestions: number;
      scheduledStartTime: string | null;
      scheduledEndTime: string | null;
      durationMinutes: number;
      statistics: {
        totalRegistered: number;
        activeCount: number;
        submittedCount: number;
        offlineCount: number;
        notStartedCount: number;
      };
      students: Array<{
        studentId: string;
        studentName: string;
        status: "not_started" | "active" | "offline" | "submitted";
        answeredCount: number;
        totalQuestions: number;
        currentQuestionIndex: number;
        lastActive?: string;
      }>;
    }>(`/exams/${examId}/live-status`, {
      method: "GET"
    }),
  getExamLeaderboard: (examId: string) =>
    request<{
      examId: string;
      examName: string;
      leaderboard: Array<{
        rank: number | null;
        studentId: string;
        studentName: string;
        obtainedMarks: number | null;
        totalMarks: number | null;
        percentage: number | null;
        correctAnswers: number | null;
        incorrectAnswers: number | null;
        unattemptedAnswers: number | null;
        submitted: boolean;
      }>;
    }>(`/exams/${examId}/leaderboard`),
  forceSubmitAllExam: (examId: string) =>
    request<{ message: string; count: number }>(`/exams/${examId}/force-submit-all`, {
      method: "POST"
    }),
  allowReattempt: (examId: string, studentId: string) =>
    request<{ message: string }>(`/exams/${examId}/students/${studentId}/allow-reattempt`, {
      method: "POST"
    }),
  generateExamFromPrompt: (params: {
    prompt?: string;
    subjectId?: string;
    topicIds?: string[];
    questionCount?: number;
    difficulty?: string;
    additionalInstructions?: string;
  }) =>
    request<ExamPayload>("/exams/generate-from-prompt", {
      method: "POST",
      body: JSON.stringify(params)
    }),
  startGenerateQuestionsJob: (bookId: string, payload: { chapterId?: string; topicIds?: string[]; questionCount: number }) =>
    request<{ jobId: string }>(`/subject-books/${bookId}/generate-questions`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  extractQuestionsFromBook: (bookId: string, payload: { chapterId?: string; topicIds?: string[]; pyqYear?: number; pyqExamName?: string; pyqSession?: string }) =>
    request<{ message: string; count: number }>(`/subject-books/${bookId}/extract-mcq-questions`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getExtractionStatus: (bookId: string) =>
    request<{ extractionStatus: string; extractionProgress: string; extractionQuestionCount: number }>(
      `/subject-books/${bookId}/extraction-status`
    ),
  detectCurriculumFromBook: (bookId: string) =>
    request<{ chapters: { name: string; topics: string[] }[] }>(`/subject-books/${bookId}/detect-curriculum`, {
      method: "POST"
    }),
  generateOfflineBoardPaper: (
    payload: { className: string; subjectName: string; topics: string[] },
    onProgress: (msg: string) => void
  ): Promise<any> => {
    const session = getStoredSession();
    const token = session?.token;
    return new Promise((resolve, reject) => {
      // Step 1: start job
      fetch(`${API_BASE_URL}/offline-exams/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      })
        .then(r => r.json())
        .then(({ jobId }) => {
          if (!jobId) { reject(new Error("Failed to start generation job")); return; }
          // Step 2: subscribe to SSE stream
          const es = new EventSource(`${API_BASE_URL}/jobs/${jobId}/stream`);
          es.onmessage = (e) => {
            try {
              const event = JSON.parse(e.data);
              if (event.type === "progress") { onProgress(event.message); }
              else if (event.type === "complete") { es.close(); resolve(event.data); }
              else if (event.type === "error") { es.close(); reject(new Error(event.message)); }
            } catch { /* ignore parse errors */ }
          };
          es.onerror = () => { es.close(); reject(new Error("Connection lost while generating paper")); };
        })
        .catch(reject);
    });
  },
  // Admin Methods
  admin: {
    getClasses: () => request<any[]>("/admin/classes"),
    createClass: (payload: { name: string }) => request<any>("/admin/classes", { method: "POST", body: JSON.stringify(payload) }),
    updateClass: (id: string, payload: { name: string }) => request<any>(`/admin/classes/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    deleteClass: (id: string) => request<void>(`/admin/classes/${id}`, { method: "DELETE" }),
    
    getStreams: () => request<any[]>("/admin/streams"),
    createStream: (payload: { name: string; classId: string }) => request<any>("/admin/streams", { method: "POST", body: JSON.stringify(payload) }),
    updateStream: (id: string, payload: { name: string; classId: string }) => request<any>(`/admin/streams/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    deleteStream: (id: string) => request<void>(`/admin/streams/${id}`, { method: "DELETE" }),
    
    getBatches: () => request<any[]>("/admin/batches"),
    createBatch: (payload: { name: string; classId: string; streamId: string }) => request<any>("/admin/batches", { method: "POST", body: JSON.stringify(payload) }),
    updateBatch: (id: string, payload: { name: string; classId: string; streamId: string }) => request<any>(`/admin/batches/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    deleteBatch: (id: string) => request<void>(`/admin/batches/${id}`, { method: "DELETE" }),
    
    getSubjects: () => request<any[]>("/admin/subjects"),
    createSubject: (payload: { name: string; classId: string; streamId: string }) => request<any>("/admin/subjects", { method: "POST", body: JSON.stringify(payload) }),
    updateSubject: (id: string, payload: { name: string; classId: string; streamId: string }) => request<any>(`/admin/subjects/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    deleteSubject: (id: string) => request<void>(`/admin/subjects/${id}`, { method: "DELETE" }),
    
    getChapters: () => request<any[]>("/admin/chapters"),
    createChapter: (payload: { name: string; subjectId: string }) => request<any>("/admin/chapters", { method: "POST", body: JSON.stringify(payload) }),
    updateChapter: (id: string, payload: { name: string; subjectId: string }) => request<any>(`/admin/chapters/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    deleteChapter: (id: string) => request<void>(`/admin/chapters/${id}`, { method: "DELETE" }),
    
    getTopics: () => request<any[]>("/admin/topics"),
    createTopic: (payload: { name: string; subjectId: string; chapterId: string }) => request<any>("/admin/topics", { method: "POST", body: JSON.stringify(payload) }),
    updateTopic: (id: string, payload: { name: string; subjectId: string; chapterId: string }) => request<any>(`/admin/topics/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    deleteTopic: (id: string) => request<void>(`/admin/topics/${id}`, { method: "DELETE" }),
    verifyQuestion: (id: string) => request<any>(`/admin/questions/${id}/verify`, { method: "POST" }),
    clearAllQuestions: () => request<void>("/admin/questions/clear-all", { method: "DELETE" }),
    clearSubjectQuestions: (subjectId: string) => request<{ message: string; count: number }>(`/admin/questions/by-subject/${subjectId}`, { method: "DELETE" }),
    
    getUsers: () => request<any[]>("/admin/users"),
    createUser: (payload: any) => request<any>("/admin/users", { method: "POST", body: JSON.stringify(payload) }),
    updateUser: (id: string, payload: any) => request<any>(`/admin/users/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    deleteUser: (id: string) => request<void>(`/admin/users/${id}`, { method: "DELETE" }),
    resetUserSession: (id: string) => request<{ message: string }>(`/admin/users/${id}/reset-session`, { method: "POST" }),
    
    parseCurriculumDocx: async (file: File) => {
      // Use raw fetch for FormData
      const session = getStoredSession();
      const formData = new FormData();
      formData.append("docx", file);
      
      const response = await fetch(buildApiUrl("/admin/curriculum/parse-docx"), {
        method: "POST",
        headers: session?.token ? { Authorization: `Bearer ${session.token}` } : undefined,
        body: formData
      });
      if (!response.ok) throw new Error("Failed to parse Word document");
      return response.json();
    },
    saveBulkCurriculum: (payload: { classId: string; streamId: string; subjects: any[]; bookId?: string }) =>
      request<any>("/admin/curriculum/save-bulk", { method: "POST", body: JSON.stringify(payload) }),
  },

  // ── Admissions ──────────────────────────────────────────────────────────────

  getPublicBatches: () => request<{ id: string; name: string }[]>("/batches/public"),

  submitAdmission: (payload: {
    studentName: string; dateOfBirth: string; schoolName: string;
    standard: "11" | "12"; board: string; batchId: string; batchName: string;
    fatherName: string; motherName?: string;
    fatherMobile: string; motherMobile?: string; email: string;
  }) => request<{ message: string; id: string }>("/admissions", {
    method: "POST", body: JSON.stringify(payload),
  }),

  getAdmissions: () => request<any[]>("/admin/admissions"),

  getAdmissionReports: () => request<any>("/admin/admissions/reports"),

  exportAdmissionsCSV: async () => {
    const session = getStoredSession();
    const response = await fetch(buildApiUrl("/admin/admissions/export"), {
      headers: session?.token ? { Authorization: `Bearer ${session.token}` } : {},
    });
    if (!response.ok) throw new Error("Export failed");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `admissions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  deleteAdmission: (id: string) =>
    request<{ success: boolean }>(`/admin/admissions/${id}`, { method: "DELETE" }),

  // ── Syllabus Tracker ────────────────────────────────────────────────────────
  getSyllabusProfile: () =>
    request<{ classLevel: string; subjectKeys: string[]; setupDone: boolean } | null>(
      "/students/me/syllabus-profile"
    ),
  saveSyllabusProfile: (payload: { classLevel: string; subjectKeys: string[] }) =>
    request<{ classLevel: string; subjectKeys: string[]; setupDone: boolean }>(
      "/students/me/syllabus-profile",
      { method: "POST", body: JSON.stringify(payload) }
    ),
  getSyllabusProgress: () =>
    request<Record<string, string>>("/students/me/syllabus-progress"),
  updateSyllabusProgress: (payload: { chapterKey: string; status: string }) =>
    request<{ ok: boolean }>("/students/me/syllabus-progress", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getAdminSyllabusCoverage: () =>
    request<{
      totalStudentsWithTracker: number;
      byClass: Record<string, {
        totalStudents: number;
        subjects: Record<string, {
          name: string;
          chapters: { studied: number; inProgress: number; notStarted: number; total: number }[];
        }>;
      }>;
    }>("/admin/syllabus-coverage"),
};
