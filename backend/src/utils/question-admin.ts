import { upsertRecord } from "../data/database.js";
import type { AppStore } from "../data/seed-data.js";
import type { Chapter, Topic } from "../types.js";

/**
 * Finds (or creates, alongside a "General Content" chapter) the catch-all
 * "General - {Subject}" topic for a subject, scoped to the given book. Shared by the
 * single-subject book-upload flow (extract-mcq-questions) and the combined-subject-paper
 * remediation script (reassign-questions-by-section.ts) — both need a safe fallback topic
 * for a subject that may not have any real topics yet.
 */
export async function ensureGeneralTopic(state: AppStore, subjectId: string, bookId: string): Promise<Topic> {
  const subject = state.subjects.find(s => s.id === subjectId);
  const generalTopicName = `General - ${subject?.name || "Subject"}`;
  let generalTopic = state.topics.find(t => t.subjectId === subjectId && t.name === generalTopicName);
  if (generalTopic) return generalTopic;

  let generalChapter = state.chapters.find(c => c.subjectId === subjectId && c.name === "General Content" && c.bookId === bookId);
  if (!generalChapter) {
    generalChapter = { id: `ch-gen-${Date.now()}`, name: "General Content", subjectId, bookId } as Chapter;
    await upsertRecord("chapters", generalChapter);
    state.chapters.push(generalChapter);
  }
  generalTopic = {
    id: `top-gen-${Date.now()}-${subjectId.slice(-6)}`,
    name: generalTopicName,
    subjectId,
    chapterId: generalChapter.id,
    bookId
  };
  await upsertRecord("topics", generalTopic);
  state.topics.push(generalTopic);
  return generalTopic;
}

/**
 * Bulk-reassigns a set of questions' subjectId/topicId in place. Used by the combined-
 * subject-paper remediation script and (a natural extension point for) an admin
 * bulk-reassign endpoint — both should go through this single code path so a future fix
 * to reassignment logic doesn't have to be made in two places.
 *
 * Safe to call on already-generated exams: exams reference questions purely by
 * questionId (see exam-engine.ts getExamQuestions), never re-filtering by subjectId, so
 * reassigning a question's subject/topic after the fact does not affect any exam that
 * already references it.
 */
export async function reassignQuestions<T extends { id: string; subjectId: string; topicId: string }>(
  questions: T[],
  fields: { subjectId?: string; topicId?: string }
): Promise<number> {
  let updated = 0;
  for (const q of questions) {
    const next = {
      ...q,
      ...(fields.subjectId ? { subjectId: fields.subjectId } : {}),
      ...(fields.topicId ? { topicId: fields.topicId } : {})
    };
    await upsertRecord("questions", next);
    updated++;
  }
  return updated;
}
