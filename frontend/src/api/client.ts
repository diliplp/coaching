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
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  login: (payload: { email: string; password: string }) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getMe: () => request<AuthResponse["user"]>("/me"),
  getOverview: () => request<OverviewResponse>("/overview"),
  getQuestionBank: () => request<QuestionBankResponse>("/question-bank"),
  getBlueprints: () => request<BlueprintSummary[]>("/blueprints"),
  getAdaptivePlan: (studentId: string, subjectId?: string) =>
    request<AdaptivePlan>(`/adaptive-plan/${studentId}${subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : ""}`),
  getBatchAdaptivePlans: (subjectId?: string) =>
    request<BatchAdaptivePlan[]>(`/adaptive-plan/batches${subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : ""}`),
  getMyAdaptiveSuggestion: () => request<AdaptivePlan>("/students/me/adaptive-suggestion"),
  getSubjectBooks: () => request<SubjectBooksResponse>("/subject-books"),
  uploadSubjectBook: async (payload: { subjectId: string; title: string; file: File }) => {
    const session = getStoredSession();
    const formData = new FormData();
    formData.append("subjectId", payload.subjectId);
    formData.append("title", payload.title);
    formData.append("pdf", payload.file);

    const response = await fetch(buildApiUrl("/subject-books"), {
      method: "POST",
      headers: session?.token ? { Authorization: `Bearer ${session.token}` } : undefined,
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }

    return response.json() as Promise<SubjectBook>;
  },
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
    })
};
