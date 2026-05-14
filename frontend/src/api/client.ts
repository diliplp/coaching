import type {
  AdaptivePlan,
  AuthResponse,
  BatchAdaptivePlan,
  BlueprintSummary,
  ExamPayload,
  ExamResult,
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

export const apiClient = {
  login: (payload: { email: string; password: string }) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getMe: () => request<AuthResponse["user"]>("/me"),
  getOverview: () => request<OverviewResponse>("/overview"),
  getAnalytics: () => request<any>("/analytics"),
  getExams: () => request<any[]>("/exams"),
  getExam: (id: string) => request<ExamPayload>(`/exams/${id}`),
  selfGenerateExam: (payload: { topicId?: string; topicIds?: string[]; questionCount?: number; allowedSourceTypes?: string[] }) =>
    request<ExamPayload>("/exams/self-generate", { method: "POST", body: JSON.stringify(payload) }),
  deleteExam: (id: string) => request<void>(`/exams/${id}`, { method: "DELETE" }),
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
  getSubjectBooks: () => request<SubjectBooksResponse>("/subject-books"),
  uploadSubjectBook: async (payload: { subjectId: string; title: string; file: File; bookType?: string }) => {
    const session = getStoredSession();
    const formData = new FormData();
    formData.append("subjectId", payload.subjectId);
    formData.append("title", payload.title);
    formData.append("pdf", payload.file);
    if (payload.bookType) formData.append("bookType", payload.bookType);

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
  generateExam: (blueprintId: string) =>
    request<ExamPayload>(`/exams/generate/${blueprintId}`, {
      method: "POST"
    }),
  generateCustomExam: (payload: TeacherCustomExamRequest) =>
    request<ExamPayload>("/exams/generate-custom", {
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
  generateQuestionsFromBook: (bookId: string, payload: { chapterId?: string; topicId?: string; topicIds?: string[]; questionCount: number }) =>
    request<{ message: string; questions: any[] }>(`/subject-books/${bookId}/generate-questions`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
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
    
    getUsers: () => request<any[]>("/admin/users"),
    createUser: (payload: any) => request<any>("/admin/users", { method: "POST", body: JSON.stringify(payload) }),
    updateUser: (id: string, payload: any) => request<any>(`/admin/users/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    deleteUser: (id: string) => request<void>(`/admin/users/${id}`, { method: "DELETE" }),
    
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
    saveBulkCurriculum: (payload: { classId: string; streamId: string; subjects: any[] }) => 
      request<any>("/admin/curriculum/save-bulk", { method: "POST", body: JSON.stringify(payload) }),
  }
};
