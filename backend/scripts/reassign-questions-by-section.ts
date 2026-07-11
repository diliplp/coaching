/**
 * Remediation for combined-subject-paper mistagging: reassigns already-extracted
 * questions in a book to the correct subject/topic based on which internal section
 * (Physics/Chemistry/Biology) the question's page actually falls under, using the same
 * detectPageSections() logic the extraction pipeline now applies going forward for new
 * uploads (see backend/src/utils/ai-generator.ts). A book's questions are found via
 * their bookId regardless of their current (possibly wrong) subjectId, so this is safe
 * to run even when every question in the book is mistagged under one subject.
 *
 * Defaults to a dry run that prints a summary table — pass --commit to actually persist.
 *
 * Usage:
 *   npx tsx backend/scripts/reassign-questions-by-section.ts --bookId=<id>            # dry run
 *   npx tsx backend/scripts/reassign-questions-by-section.ts --bookId=<id> --commit    # persist
 *
 * Run against production: DATABASE_URL=<url> npx tsx backend/scripts/reassign-questions-by-section.ts ...
 */

import { getAppState, getRecord } from "../src/data/database.js";
import { detectPageSections } from "../src/utils/ai-generator.js";
import { ensureGeneralTopic, reassignQuestions } from "../src/utils/question-admin.js";
import type { Question, SubjectBook } from "../src/types.js";

function parseArgs() {
  const args = process.argv.slice(2);
  const bookIdArg = args.find(a => a.startsWith("--bookId="));
  const commit = args.includes("--commit");
  if (!bookIdArg) {
    console.error("Usage: tsx reassign-questions-by-section.ts --bookId=<id> [--commit]");
    process.exit(1);
  }
  return { bookId: bookIdArg.slice("--bookId=".length), commit };
}

async function main() {
  const { bookId, commit } = parseArgs();
  const state = await getAppState();

  const book = await getRecord<SubjectBook>("subjectBooks", bookId);
  if (!book) {
    console.error(`Book not found: ${bookId}`);
    process.exit(1);
  }
  if (!book.parsedText) {
    console.error(`Book has no parsedText, cannot detect sections: ${bookId}`);
    process.exit(1);
  }

  const bookSubject = state.subjects.find(s => s.id === book.subjectId);
  if (!bookSubject) {
    console.error(`Book's own subject not found: ${book.subjectId}`);
    process.exit(1);
  }

  const candidateSubjects = state.subjects.filter(s =>
    s.classId === bookSubject.classId &&
    s.streamId === bookSubject.streamId &&
    /physics|chemistry|bio/i.test(s.name)
  );

  console.log(`Book: "${book.title}" (${bookId})`);
  console.log(`Book's own subject: ${bookSubject.name}`);
  console.log(`Candidate subjects under same class/stream: ${candidateSubjects.map(s => s.name).join(", ") || "(none)"}`);

  if (candidateSubjects.length < 2) {
    console.log("Fewer than 2 candidate subjects — nothing to do.");
    return;
  }

  const pages = book.parsedText.split(/--- PAGE \d+ ---/gi).map(p => p.trim()).filter(Boolean);
  const sectionMap = detectPageSections(pages, candidateSubjects);
  console.log(`Pages: ${pages.length}, section header detected on: ${sectionMap.size} page(s)`);

  if (sectionMap.size === 0) {
    console.log("No section headers detected in this book's text — nothing to do.");
    return;
  }

  const bookQuestions = state.questions.filter(q => q.bookId === bookId);
  console.log(`Questions in book (found via bookId, regardless of current subjectId): ${bookQuestions.length}`);

  type Staged = { question: Question; pageNumber: number; oldSubjectId: string; newSubjectId: string };
  const staged: Staged[] = [];
  for (const q of bookQuestions) {
    const pageNumber = (q as unknown as { pageNumber?: number }).pageNumber;
    if (pageNumber == null) continue;
    const newSubjectId = sectionMap.get(pageNumber);
    if (!newSubjectId || newSubjectId === q.subjectId) continue;
    staged.push({ question: q, pageNumber, oldSubjectId: q.subjectId, newSubjectId });
  }

  if (staged.length === 0) {
    console.log("Every question already matches its detected section's subject — nothing to do.");
    return;
  }

  const nameOf = (id: string) => state.subjects.find(s => s.id === id)?.name ?? id;
  const summary = new Map<string, number>();
  for (const s of staged) {
    const key = `page ${s.pageNumber}: ${nameOf(s.oldSubjectId)} -> ${nameOf(s.newSubjectId)}`;
    summary.set(key, (summary.get(key) ?? 0) + 1);
  }
  console.log("\nStaged reassignments (grouped by page + old/new subject):");
  for (const [key, count] of [...summary.entries()].sort()) {
    console.log(`  ${key}: ${count} question(s)`);
  }

  const totalsBySubject = new Map<string, number>();
  for (const s of staged) {
    const key = nameOf(s.newSubjectId);
    totalsBySubject.set(key, (totalsBySubject.get(key) ?? 0) + 1);
  }
  console.log("\nNew subject distribution for staged questions:");
  for (const [name, count] of totalsBySubject) console.log(`  ${name}: ${count}`);
  console.log(`\nTotal staged: ${staged.length} of ${bookQuestions.length} questions in book`);

  if (!commit) {
    console.log("\nDry run only — nothing was changed. Re-run with --commit to persist.");
    return;
  }

  // Group staged questions by target subject so ensureGeneralTopic/reassignQuestions are
  // each called once per subject rather than once per question.
  const bySubject = new Map<string, Question[]>();
  for (const s of staged) {
    const list = bySubject.get(s.newSubjectId) ?? [];
    list.push(s.question);
    bySubject.set(s.newSubjectId, list);
  }

  let totalUpdated = 0;
  for (const [subjectId, questions] of bySubject) {
    const topicsForSubject = state.topics.filter(t => t.subjectId === subjectId);
    const topic = topicsForSubject[0] ?? (await ensureGeneralTopic(state, subjectId, bookId));
    const updated = await reassignQuestions(questions, { subjectId, topicId: topic.id });
    console.log(`Reassigned ${updated} question(s) to ${nameOf(subjectId)} (topic: ${topic.name}).`);
    totalUpdated += updated;
  }

  console.log(`\nDone. ${totalUpdated} question(s) reassigned.`);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("Failed:", err);
    process.exit(1);
  });
