import fs from "node:fs/promises";
import { Router } from "express";
import multer from "multer";
import { getAppState, upsertRecord } from "../data/database.js";
import { booksUploadsRoot } from "../utils/paths.js";
import {
  buildAdaptiveExamPlan,
  buildBatchAdaptivePlan,
  evaluateExamSubmission,
  generateAdaptiveExam,
  generateCustomExam,
  generateExamFromBlueprint,
  getExamQuestions,
  listBatchAdaptivePlans
} from "../utils/exam-engine.js";
import { extractPdfText } from "../utils/pdf.js";
import { listReferencePapers } from "../utils/reference-papers.js";
import { findUserByEmail, requireAuth, requireRole, signAuthToken, verifyPassword } from "../utils/auth.js";
import type { AuthenticatedRequest, SubjectBook } from "../types.js";

export const apiRouter = Router();

await fs.mkdir(booksUploadsRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, booksUploadsRoot);
  },
  filename: (_req, file, callback) => {
    const safeName = file.originalname.replace(/\s+/g, "-");
    callback(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (_req, file, callback) => {
    if (file.mimetype === "application/pdf") {
      callback(null, true);
      return;
    }
    callback(new Error("Only PDF files are allowed"));
  }
});

apiRouter.get("/health", async (_req, res) => {
  const state = await getAppState();
  const referencePapers = await listReferencePapers();
  res.json({
    status: "ok",
    uploadsRoot: booksUploadsRoot,
    db: {
      users: state.users.length,
      classes: state.classes.length,
      books: state.subjectBooks.length,
      referencePapers: referencePapers.length
    }
  });
});

apiRouter.post("/auth/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ message: "Email and password are required" });
    return;
  }

  const user = await findUserByEmail(email);
  if (!user?.passwordHash) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  const passwordValid = await verifyPassword(password, user.passwordHash);
  if (!passwordValid) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  const token = signAuthToken(user);
  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    studentId: user.studentId ?? null
  };

  res.json({ token, user: safeUser });
});

apiRouter.use(requireAuth);

apiRouter.get("/me", async (req, res) => {
  const state = await getAppState();
  const auth = (req as AuthenticatedRequest).auth;
  const user = state.users.find((item) => item.id === auth?.sub);
  if (!user) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    studentId: user.studentId ?? null
  });
});

apiRouter.get("/overview", async (_req, res) => {
  const state = await getAppState();

  res.json({
    stats: {
      classes: state.classes.length,
      streams: state.streams.length,
      batches: state.batches.length,
      students: state.students.length,
      subjects: state.subjects.length,
      questions: state.questions.length,
      liveExams: state.exams.length,
      submissions: state.submissions.length,
      subjectBooks: state.subjectBooks.length
    },
    classes: state.classes,
    streams: state.streams,
    batches: state.batches,
    students: state.students,
    blueprints: state.blueprints,
    recentSubmissions: state.submissions.slice(0, 5)
  });
});

apiRouter.get("/question-bank", async (_req, res) => {
  const state = await getAppState();
  const questions = state.questions.map((question) => ({
    ...question,
    subjectName: state.subjects.find((subject) => subject.id === question.subjectId)?.name ?? "Unknown",
    topicName: state.topics.find((topic) => topic.id === question.topicId)?.name ?? "Unknown",
    chapterName:
      state.chapters.find((chapter) => chapter.id === state.topics.find((topic) => topic.id === question.topicId)?.chapterId)?.name ??
      "Unknown"
  }));

  res.json({
    subjects: state.subjects,
    chapters: state.chapters,
    topics: state.topics,
    questions
  });
});

apiRouter.get("/blueprints", async (_req, res) => {
  const state = await getAppState();
  res.json(
    state.blueprints.map((blueprint) => ({
      ...blueprint,
      className: state.classes.find((item) => item.id === blueprint.classId)?.name ?? "Unknown",
      streamName: state.streams.find((item) => item.id === blueprint.streamId)?.name ?? "Unknown",
      batchName: state.batches.find((item) => item.id === blueprint.batchId)?.name ?? "Unknown",
      subjectName: state.subjects.find((item) => item.id === blueprint.subjectId)?.name ?? "Unknown"
    }))
  );
});

apiRouter.get("/adaptive-plan/batch/:batchId", requireRole(["super_admin", "teacher"]), async (req, res) => {
  const batchId = getSingleFormValue(req.params.batchId);
  const requestedSubjectId = typeof req.query.subjectId === "string" ? req.query.subjectId : undefined;

  if (!batchId) {
    res.status(400).json({ message: "Batch id is required" });
    return;
  }

  const plan = await buildBatchAdaptivePlan(batchId, requestedSubjectId);
  if (!plan) {
    res.status(404).json({ message: "No batch adaptive recommendation available yet" });
    return;
  }

  res.json(plan);
});

apiRouter.get("/adaptive-plan/batches", requireRole(["super_admin", "teacher"]), async (req, res) => {
  const requestedSubjectId = typeof req.query.subjectId === "string" ? req.query.subjectId : undefined;
  const plans = await listBatchAdaptivePlans(requestedSubjectId);
  res.json(plans);
});

apiRouter.get("/adaptive-plan/:studentId", requireRole(["super_admin", "teacher"]), async (req, res) => {
  const studentId = getSingleFormValue(req.params.studentId);
  const requestedSubjectId = typeof req.query.subjectId === "string" ? req.query.subjectId : undefined;

  if (!studentId) {
    res.status(400).json({ message: "Student id is required" });
    return;
  }

  const plan = await buildAdaptiveExamPlan(studentId, requestedSubjectId);
  if (!plan) {
    res.status(404).json({ message: "No adaptive recommendation available yet for this student" });
    return;
  }

  res.json(plan);
});

apiRouter.get("/students/me/adaptive-suggestion", requireRole(["student"]), async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth;
  const studentId = auth?.studentId ?? undefined;
  if (!studentId) {
    res.status(400).json({ message: "This account is not linked to a student profile" });
    return;
  }

  const plan = await buildAdaptiveExamPlan(studentId);
  if (!plan) {
    res.status(404).json({ message: "No adaptive recommendation available yet for this student" });
    return;
  }

  res.json(plan);
});

apiRouter.get("/subject-books", async (_req, res) => {
  const state = await getAppState();
  const referencePapers = await listReferencePapers();
  res.json({
    subjects: state.subjects.map((subject) => ({
      ...subject,
      className: state.classes.find((item) => item.id === subject.classId)?.name ?? "Unknown",
      streamName: state.streams.find((item) => item.id === subject.streamId)?.name ?? "Unknown"
    })),
    books: state.subjectBooks.map((book) => ({
      ...book,
      subjectName: state.subjects.find((item) => item.id === book.subjectId)?.name ?? "Unknown"
    })),
    referencePapers
  });
});

apiRouter.post("/subject-books", requireRole(["super_admin", "teacher"]), upload.single("pdf"), async (req, res) => {
  const state = await getAppState();
  const subjectId = getSingleFormValue(req.body.subjectId) as string | undefined;
  const title = getSingleFormValue(req.body.title) as string | undefined;
  const file = req.file;

  if (!subjectId || !title || !file) {
    res.status(400).json({ message: "subjectId, title, and pdf file are required" });
    return;
  }

  const subject = state.subjects.find((item) => item.id === subjectId);
  if (!subject) {
    res.status(404).json({ message: "Subject not found" });
    return;
  }

  const parsed = await extractPdfText(file.path);

  const newBook: SubjectBook = {
    id: `book-${Date.now()}`,
    subjectId,
    title,
    fileName: file.originalname,
    fileUrl: `/uploads/books/${file.filename}`,
    uploadedAt: new Date().toISOString(),
    parsedText: parsed.extractedText,
    previewText: parsed.previewText,
    pageCount: parsed.pageCount,
    extractedAt: new Date().toISOString()
  };

  await upsertRecord("subjectBooks", newBook);
  res.status(201).json(newBook);
});

apiRouter.post("/exams/generate/:blueprintId", requireRole(["super_admin", "teacher"]), async (req, res) => {
  const blueprintId = getSingleFormValue(req.params.blueprintId);
  if (!blueprintId) {
    res.status(400).json({ message: "Blueprint id is required" });
    return;
  }

  const exam = await generateExamFromBlueprint(blueprintId);
  if (!exam) {
    res.status(404).json({ message: "Blueprint not found" });
    return;
  }

  res.status(201).json({
    exam,
    questions: await getExamQuestions(exam.id)
  });
});

apiRouter.post("/exams/generate-custom", requireRole(["super_admin", "teacher"]), async (req, res) => {
  const generated = await generateCustomExam(req.body);
  if (!generated) {
    res.status(404).json({ message: "Unable to generate custom exam" });
    return;
  }

  if ("error" in generated) {
    res.status(400).json({ message: generated.error });
    return;
  }

  res.status(201).json({
    exam: generated,
    questions: await getExamQuestions(generated.id)
  });
});

apiRouter.post("/exams/adaptive-generate", requireRole(["super_admin", "teacher"]), async (req, res) => {
  const { studentId, subjectId } = req.body as { studentId?: string; subjectId?: string };

  if (!studentId) {
    res.status(400).json({ message: "studentId is required" });
    return;
  }

  const generated = await generateAdaptiveExam(studentId, subjectId);
  if (!generated) {
    res.status(404).json({ message: "No adaptive plan could be created for this student yet" });
    return;
  }

  res.status(201).json({
    exam: generated.exam,
    plan: generated.plan,
    questions: await getExamQuestions(generated.exam.id)
  });
});

apiRouter.post("/students/me/adaptive-generate", requireRole(["student"]), async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth;
  const studentId = auth?.studentId ?? undefined;
  if (!studentId) {
    res.status(400).json({ message: "This account is not linked to a student profile" });
    return;
  }

  const generated = await generateAdaptiveExam(studentId);
  if (!generated) {
    res.status(404).json({ message: "No adaptive plan could be created for this student yet" });
    return;
  }

  res.status(201).json({
    exam: generated.exam,
    plan: generated.plan,
    questions: await getExamQuestions(generated.exam.id)
  });
});

apiRouter.get("/exams/:examId", async (req, res) => {
  const state = await getAppState();
  const exam = state.exams.find((item) => item.id === req.params.examId);
  if (!exam) {
    res.status(404).json({ message: "Exam not found" });
    return;
  }

  res.json({
    exam,
    questions: await getExamQuestions(exam.id)
  });
});

apiRouter.post("/exams/:examId/submit", async (req, res) => {
  const { studentId, answers } = req.body as { studentId?: string; answers?: Array<{ questionId: string; selectedOptionIds: string[] }> };
  const authUserId = (req as AuthenticatedRequest).auth?.sub;
  const state = await getAppState();
  const authUser = state.users.find((item) => item.id === authUserId);
  const effectiveStudentId = authUser?.studentId ?? studentId;

  if (!effectiveStudentId || !answers) {
    res.status(400).json({ message: "studentId and answers are required" });
    return;
  }

  const result = await evaluateExamSubmission(req.params.examId, effectiveStudentId, answers);
  if (!result) {
    res.status(404).json({ message: "Exam not found" });
    return;
  }

  res.json(result);
});
function getSingleFormValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}
