import type { ExamPayload, ExamResult } from "../types";

export interface LiveExamState {
  generatedExam: ExamPayload | null;
  latestResult: ExamResult | null;
}

export const liveExamState: LiveExamState = {
  generatedExam: null,
  latestResult: null
};
