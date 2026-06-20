import fs from "node:fs/promises";
import { Router, Request, Response } from "express";
import multer from "multer";
import { getAppState, getRecord, listRecords, upsertRecord, deleteRecord } from "../data/database.js";
import { booksUploadsRoot } from "../utils/paths.js";
import {
  buildAdaptiveExamPlan,
  buildBatchAdaptivePlan,
  evaluateExamSubmission,
  generateAdaptiveExam,
  generateCombinedExam,
  generateCustomExam,
  generateExamFromBlueprint,
  getExamQuestions,
  listBatchAdaptivePlans
} from "../utils/exam-engine.js";
import path from "node:path";
import { extractPdfText, extractPdfDiagrams, extractPdfQuestionCrops } from "../utils/pdf.js";
import { generateQuestionsFromText, generateQuestionsFromBiologyFigures, ensureEnoughQuestions, parseExamPrompt, detectCurriculumFromText, generateOfflineBoardPaper, extractQuestionsFromPdfText } from "../utils/ai-generator.js";
import { listReferencePapers } from "../utils/reference-papers.js";
import { findUserByEmail, generateSessionId, requireAuth, requireRole, signAuthToken, verifyPassword } from "../utils/auth.js";
import { createJob, emitJobEvent, subscribeToJob } from "../utils/sse-job-store.js";
import type { Admission, AuthenticatedRequest, BatchNode, ExamSession, Question, QuestionSource, SubjectBook } from "../types.js";
import { encrypt } from "../utils/encryption.js";

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
  const { email, password, role: requestedRole } = req.body as { email?: string; password?: string; role?: string };

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

  // Validate that the selected role matches the account's actual role
  if (requestedRole) {
    // Map frontend role labels to DB roles
    const roleMap: Record<string, string> = { admin: "super_admin", teacher: "teacher", student: "student" };
    const expectedDbRole = roleMap[requestedRole] ?? requestedRole;
    if (user.role !== expectedDbRole) {
      const roleLabel = requestedRole.charAt(0).toUpperCase() + requestedRole.slice(1);
      res.status(403).json({ message: `This account is not registered as a ${roleLabel}. Please select the correct login role.` });
      return;
    }
  }

  // Block parallel sessions for students only — protects exam integrity.
  // Teachers and admins may log in from multiple devices simultaneously.
  if (user.role === "student") {
    const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
    if (user.sessionId && user.sessionStartedAt) {
      const sessionAge = Date.now() - new Date(user.sessionStartedAt).getTime();
      if (sessionAge < SESSION_TTL_MS) {
        res.status(409).json({ message: "Another device is already logged in with this account. Please log out from the other device first." });
        return;
      }
    }
  }

  const sessionId = generateSessionId();
  const updatedUser = { ...user, sessionId, sessionStartedAt: new Date().toISOString() };
  await upsertRecord("users", updatedUser);

  const token = signAuthToken(updatedUser);
  const safeUser = {
    id: updatedUser.id,
    name: updatedUser.name,
    email: updatedUser.email,
    role: updatedUser.role,
    studentId: updatedUser.studentId ?? null
  };

  res.json({ token, user: safeUser });
});

apiRouter.post("/auth/logout", requireAuth, async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth;
  const state = await getAppState();
  const user = state.users.find(u => u.id === auth?.sub);
  if (user) {
    await upsertRecord("users", { ...user, sessionId: "", sessionStartedAt: null });
  }
  res.status(204).end();
});

apiRouter.get("/debug-env", async (req, res) => {
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execPromise = promisify(exec);
  
  const results: any = {};
  
  const commands = [
    "echo $PATH",
    "which python",
    "python --version",
    "which python3",
    "python3 --version",
    "which python3.11",
    "python3.11 --version",
    "which tesseract",
    "tesseract --version",
    "tesseract --list-langs",
    "pip --version",
    "pip3 --version",
    "echo $TESSDATA_PREFIX"
  ];
  
  for (const cmd of commands) {
    try {
      const { stdout, stderr } = await execPromise(cmd);
      results[cmd] = { stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (err: any) {
      results[cmd] = { error: err.message };
    }
  }
  
  res.json(results);
});

// Public — list batches for the admission form (no auth)
apiRouter.get("/batches/public", async (_req: Request, res: Response) => {
  const batches = await listRecords<BatchNode>("batches");
  res.json(batches.map(b => ({ id: b.id, name: b.name })));
});

// Public admission submission — no auth required
apiRouter.post("/admissions", async (req: Request, res: Response) => {
  const { studentName, dateOfBirth, schoolName, standard, board, batchId, batchName,
    fatherName, motherName, fatherMobile, motherMobile, email } = req.body;

  if (!studentName || !dateOfBirth || !schoolName || !standard || !board ||
    !batchId || !batchName || !fatherName || !fatherMobile || !email) {
    res.status(400).json({ message: "Missing required fields" });
    return;
  }

  const admission: Admission = {
    id: `adm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    studentName: String(studentName).trim(),
    dateOfBirth: String(dateOfBirth).trim(),
    schoolName: String(schoolName).trim(),
    standard,
    board,
    batchId: String(batchId),
    batchName: String(batchName).trim(),
    fatherName: String(fatherName).trim(),
    motherName: motherName ? String(motherName).trim() : undefined,
    fatherMobileEncrypted: encrypt(String(fatherMobile).trim()),
    motherMobileEncrypted: motherMobile ? encrypt(String(motherMobile).trim()) : undefined,
    emailEncrypted: encrypt(String(email).trim().toLowerCase()),
    createdAt: new Date().toISOString(),
  };

  await upsertRecord("admissions", admission);
  res.status(201).json({ message: "Application submitted successfully", id: admission.id });
});

// SSE stream endpoint — must be before requireAuth because EventSource/fetch can't reliably send
// Authorization headers. Security: jobId is a cryptographically unguessable token issued only to
// authenticated users.
apiRouter.get("/jobs/:jobId/stream", (req, res) => {
  const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
  const found = subscribeToJob(jobId, res);
  if (!found) {
    res.status(404).json({ message: "Job not found or expired" });
  }
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

apiRouter.get("/overview", async (req, res) => {
  const state = await getAppState();
  const auth = (req as AuthenticatedRequest).auth;
  const user = state.users.find(u => u.id === auth?.sub);
  
  let scheduledExams = state.exams;

  if (user?.role === "student" && user.studentId) {
    const student = state.students.find(s => s.id === user.studentId);
    if (student) {
      // Return all exams for the student's batch.
      // We will handle the "Start" button logic on the frontend to avoid server-side timezone mismatches.
      scheduledExams = state.exams.filter(exam => 
        String(exam.batchId) === String(student.batchId)
      );
    } else {
      // Fallback if student record not found: show nothing to be safe, or show all if that's desired
      scheduledExams = [];
    }
  }

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
    scheduledExams,
    recentSubmissions: state.submissions.filter(s => user?.role === "student" ? s.studentId === user.studentId : true).slice(0, 5)
  });
});

apiRouter.post("/exams/self-generate", requireRole(["student", "super_admin", "teacher"]), async (req, res) => {
  try {
    const { topicId, topicIds: rawTopicIds, questionCount, allowedSourceTypes } = req.body;
    
    let targetTopicIds: string[] = [];
    if (Array.isArray(rawTopicIds)) {
      targetTopicIds = rawTopicIds.map(String);
    } else if (topicId) {
      targetTopicIds = [String(topicId)];
    }

    if (targetTopicIds.length === 0) {
      return res.status(400).json({ message: "At least one topicId is required" });
    }

    const state = await getAppState();
    const validTopics = state.topics.filter(t => targetTopicIds.includes(t.id));
    if (validTopics.length === 0) return res.status(404).json({ message: "Topics not found" });

    const subjectId = validTopics[0].subjectId;
    const targetCount = Number(questionCount) || 10;
    
    // Re-fetch questions — exclude any with no correct answer (garbled OCR / pending review)
    let questions = state.questions.filter(q =>
      targetTopicIds.includes(q.topicId) && q.correctOptionIds && q.correctOptionIds.length > 0
    );

    // Filter by source if specified
    if (Array.isArray(allowedSourceTypes) && allowedSourceTypes.length > 0) {
      questions = questions.filter(q => allowedSourceTypes.includes(q.sourceType || "custom"));
    }
    
    if (questions.length === 0) {
      return res.status(400).json({ message: "No questions found for the selected topics and source filters. Please ask your teacher to add questions to the question bank for these topics." });
    }

    const count = Math.min(questions.length, targetCount);
    const selectedQuestions = questions.sort(() => 0.5 - Math.random()).slice(0, count);

    const auth = (req as AuthenticatedRequest).auth;
    const user = state.users.find(u => u.id === auth?.sub);
    const student = state.students.find(s => s.id === user?.studentId);

    const exam = {
      id: `self-${Date.now()}`,
      blueprintId: "self-generated",
      name: targetTopicIds.length === 1 ? `${validTopics[0].name} Practice` : "Mixed Topics Practice",
      classId: student?.classId || "",
      streamId: student?.streamId || "",
      batchId: student?.batchId || "",
      subjectId,
      durationMinutes: count * 2, // 2 mins per question
      generatedAt: new Date().toISOString(),
      generationMode: "custom" as const,
      questions: selectedQuestions.map((q, i) => ({
        questionId: q.id,
        order: i + 1,
        optionOrderIds: q.options.map(o => o.id).sort(() => 0.5 - Math.random())
      }))
    };

    await upsertRecord("exams", exam);

    res.status(201).json({
      exam,
      questions: selectedQuestions
    });
  } catch (error) {
    console.error("Error in self-generate:", error);
    res.status(500).json({ message: "Internal server error during exam generation" });
  }
});

apiRouter.get("/question-bank", requireAuth, async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth;
  const state = await getAppState();
  
  // If student, return metadata but NO questions
  const questions = auth?.role === "student" ? [] : state.questions.map((question) => ({
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

apiRouter.post("/questions", requireRole(["super_admin", "teacher"]), async (req, res) => {
  const { subjectId, topicId, type, prompt, difficulty, marks, negativeMarks, correctOptionIds, options, explanation, sourceType, bookId, pageNumber, isVerified } = req.body;
  if (!subjectId || !topicId || !prompt || !options || !correctOptionIds) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const newQuestion = {
    id: `q-${Date.now()}`,
    subjectId,
    topicId,
    type: type || "single_correct",
    prompt,
    difficulty: difficulty || "medium",
    marks: Number(marks) || 4,
    negativeMarks: Number(negativeMarks) || 1,
    correctOptionIds,
    options,
    explanation: explanation || "",
    sourceType: sourceType || "custom",
    bookId: bookId || undefined,
    pageNumber: pageNumber || undefined,
    isVerified: isVerified !== undefined ? isVerified : false
  };
  
  await upsertRecord("questions", newQuestion);
  res.status(201).json(newQuestion);
});

apiRouter.put("/questions/:id", requireRole(["super_admin", "teacher"]), async (req, res) => {
  const id = req.params.id as string;
  const { subjectId, topicId, type, prompt, difficulty, marks, negativeMarks, correctOptionIds, options, explanation, sourceType, bookId, pageNumber, isVerified } = req.body;
  
  const { getRecord } = await import("../data/database.js");
  const existing = await getRecord<any>("questions", id);

  const updatedQuestion = {
    ...(existing || {}),
    id,
    subjectId,
    topicId,
    type,
    prompt,
    difficulty,
    marks: Number(marks),
    negativeMarks: Number(negativeMarks),
    correctOptionIds,
    options,
    explanation,
    sourceType: sourceType || "custom",
    bookId: bookId !== undefined ? bookId : existing?.bookId,
    pageNumber: pageNumber !== undefined ? pageNumber : existing?.pageNumber,
    isVerified: isVerified !== undefined ? isVerified : existing?.isVerified
  };

  await upsertRecord("questions", updatedQuestion);
  res.json(updatedQuestion);
});

apiRouter.delete("/questions/:id", requireRole(["super_admin", "teacher"]), async (req, res) => {
  const { deleteRecord } = await import("../data/database.js");
  await deleteRecord("questions", req.params.id as string);
  res.status(204).end();
});


apiRouter.get("/analytics", requireRole(["super_admin", "teacher", "student"]), async (req: Request, res: Response) => {
  const authUserId = (req as AuthenticatedRequest).auth?.sub;
  const state = await getAppState();
  const authUser = state.users.find((item) => item.id === authUserId);
  const isStudent = authUser?.role === "student";
  const effectiveStudentId = authUser?.studentId ?? authUserId;

  if (isStudent && effectiveStudentId) {
    const student = state.students.find((s) => s.id === effectiveStudentId);
    const studentSubmissions = state.submissions.filter((s) => s.studentId === effectiveStudentId);
    const studentBatch = student ? state.batches.filter((b) => b.id === student.batchId) : [];
    
    const takenExamIds = new Set(studentSubmissions.map((s) => s.examId));
    const studentExams = state.exams.filter((e) => takenExamIds.has(e.id));

    res.json({
      submissions: studentSubmissions,
      exams: studentExams,
      students: student ? [student] : [],
      batches: studentBatch,
      subjects: state.subjects
    });
  } else {
    res.json({
      submissions: state.submissions,
      exams: state.exams,
      students: state.students,
      batches: state.batches,
      subjects: state.subjects
    });
  }
});

apiRouter.get("/students/:studentId/report-pdf", requireRole(["super_admin", "teacher", "student"]), async (req, res) => {
  try {
    const studentId = req.params.studentId as string;
    const authUserId = (req as AuthenticatedRequest).auth?.sub;
    const state = await getAppState();
    const authUser = state.users.find((item) => item.id === authUserId);
    const effectiveStudentId = authUser?.studentId ?? authUserId;

    if (authUser?.role === "student" && studentId !== effectiveStudentId) {
      res.status(403).json({ message: "You are not authorized to view this student's report." });
      return;
    }

    const { generateStudentReportPDF } = await import("../utils/pdf-generator.js");
    const pdfBuffer = await generateStudentReportPDF(studentId);
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=report_${studentId}.pdf`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error("PDF generation error:", error);
    res.status(500).json({ message: error.message || "Failed to generate report PDF" });
  }
});


apiRouter.get("/blueprints", async (_req: Request, res: Response) => {
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

apiRouter.get("/students/me/submissions", requireRole(["student"]), async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth;
  const studentId = auth?.studentId ?? undefined;
  if (!studentId) {
    res.status(400).json({ message: "This account is not linked to a student profile" });
    return;
  }

  const state = await getAppState();
  const submissions = state.submissions
    .filter((s: any) => s.studentId === studentId)
    .sort((a: any, b: any) => b.id.localeCompare(a.id))
    .map((s: any) => {
      const exam = state.exams.find((e) => e.id === s.examId);
      return {
        id: s.id,
        examId: s.examId,
        examName: exam?.name || "Unknown Exam",
        submittedAt: s.id.replace("submission-", ""),
        totalMarks: s.totalMarks,
        obtainedMarks: s.obtainedMarks,
        percentage: s.percentage,
        correctAnswers: s.correctAnswers,
        incorrectAnswers: s.incorrectAnswers,
        unattemptedAnswers: s.unattemptedAnswers,
      };
    });

  res.json(submissions);
});

apiRouter.get("/students/me/submissions/:submissionId", requireRole(["student"]), async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth;
  const studentId = auth?.studentId ?? undefined;
  if (!studentId) {
    res.status(400).json({ message: "This account is not linked to a student profile" });
    return;
  }

  const state = await getAppState();
  const submission = state.submissions.find((s: any) => s.id === (req.params.submissionId as string));
  if (!submission) {
    res.status(404).json({ message: "Submission not found" });
    return;
  }
  if ((submission as any).studentId !== studentId) {
    res.status(403).json({ message: "Access denied" });
    return;
  }

  const exam = state.exams.find((e) => e.id === (submission as any).examId);
  res.json({ ...submission, examName: exam?.name || "Unknown Exam" });
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

apiRouter.get("/subject-books", async (_req: Request, res: Response) => {
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

apiRouter.get("/subject-books/:id/extraction-status", requireAuth, async (req, res) => {
  const { getRecord } = await import("../data/database.js");
  const bookId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const book = await getRecord<any>("books", bookId);
  if (!book) return res.status(404).json({ message: "Book not found" });
  res.json({
    extractionStatus: book.extractionStatus ?? "idle",
    extractionProgress: book.extractionProgress ?? "",
    extractionQuestionCount: book.extractionQuestionCount ?? 0
  });
});

apiRouter.post("/subject-books", requireRole(["super_admin"]), upload.single("pdf"), async (req, res) => {
  const state = await getAppState();
  const subjectId = getSingleFormValue(req.body.subjectId) as string | undefined;
  const title = getSingleFormValue(req.body.title) as string | undefined;
  const bookType = getSingleFormValue(req.body.bookType) as "pyq" | "reference" | undefined;
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

  const ocr = getSingleFormValue(req.body.ocr) === "true";

  let parsed;
  try {
    parsed = await extractPdfText(file.path, ocr);
  } catch (err: any) {
    console.error("PDF extraction failed:", err);
    res.status(500).json({ message: err.message || "Failed to extract text from PDF. Please check the backend console." });
    return;
  }

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
    bookType: bookType || "reference",
    extractedAt: new Date().toISOString()
  };

  await upsertRecord("subjectBooks", newBook);
  res.status(201).json(newBook);
});

apiRouter.post("/subject-books/:id/apply-answer-key", requireRole(["super_admin"]), async (req, res) => {
  const { id } = req.params;
  const { answerKey } = req.body as { answerKey: string };

  if (!answerKey || typeof answerKey !== "string") {
    res.status(400).json({ message: "answerKey string required (e.g. 'D,A,C,B,A' or 'DACBA')" });
    return;
  }

  // Accept "D,A,C,B" or "DACBA" or "D A C B"
  const letters = answerKey
    .toUpperCase()
    .split(/[,\s]+/)
    .flatMap(token => (token.length > 1 ? token.split("") : [token]))
    .filter(l => /^[A-D]$/.test(l));

  if (letters.length === 0) {
    res.status(400).json({ message: "No valid answer letters found. Use A, B, C, D." });
    return;
  }

  const state = await getAppState();
  const book = state.subjectBooks.find(b => b.id === id);
  if (!book) {
    res.status(404).json({ message: "Book not found" });
    return;
  }

  // Persist the answer key on the book for future reference
  (book as any).answerKey = letters.join(",");
  await upsertRecord("subjectBooks", book);

  // Sort book questions by questionNumber (the PDF question number stored during extraction)
  const bookQuestions = state.questions
    .filter((q: any) => q.bookId === id)
    .sort((a: any, b: any) => (a.questionNumber ?? 9999) - (b.questionNumber ?? 9999));

  let updatedCount = 0;
  for (let i = 0; i < bookQuestions.length && i < letters.length; i++) {
    const q = bookQuestions[i] as any;
    const correctLabel = letters[i];
    const matchingOpt = (q.options || []).find((o: any) =>
      (o.label || "").toUpperCase() === correctLabel
    );
    if (matchingOpt) {
      q.correctOptionIds = [matchingOpt.id];
      q.isVerified = true;
      await upsertRecord("questions", q);
      updatedCount++;
    }
  }

  res.json({
    message: `Answer key applied to ${updatedCount} of ${bookQuestions.length} questions`,
    updatedCount,
    total: bookQuestions.length,
    applied: letters.slice(0, bookQuestions.length)
  });
});

apiRouter.delete("/subject-books/:id", requireRole(["super_admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    const state = await getAppState();
    const bookQuestions = state.questions.filter(q => q.bookId === id);
    console.log(`Deleting ${bookQuestions.length} questions associated with book ${id}...`);
    for (const q of bookQuestions) {
      await deleteRecord("questions", q.id);
    }
    await deleteRecord("subjectBooks", id as string);
    res.status(204).end();
  } catch (error) {
    console.error("Error deleting book:", error);
    res.status(500).json({ message: "Failed to delete book" });
  }
});

apiRouter.post("/subject-books/:bookId/generate-questions", requireRole(["super_admin"]), async (req, res) => {
  const state = await getAppState();
  const bookId = req.params.bookId;
  const chapterId = getSingleFormValue(req.body.chapterId) as string | undefined;
  const rawTopicIds = req.body.topicIds;
  let topicIds: string[] = [];

  if (Array.isArray(rawTopicIds)) {
    topicIds = rawTopicIds.map(String);
  } else if (typeof rawTopicIds === "string" && rawTopicIds) {
    topicIds = [rawTopicIds];
  }
  const book = state.subjectBooks.find((b) => b.id === bookId);
  if (!book) {
    res.status(404).json({ message: "Book (PDF) not found" });
    return;
  }

  if (topicIds.length === 0) {
    // If no specific topics exist in the chapter, create or find a "General" topic
    if (chapterId) {
      const chapter = state.chapters.find(c => c.id === chapterId);
      const generalTopicName = `General - ${chapter?.name || "Chapter"}`;
      let generalTopic = state.topics.find(t => t.chapterId === chapterId && t.name === generalTopicName);
      if (!generalTopic) {
        generalTopic = { 
          id: `top-gen-${Date.now()}`, 
          name: generalTopicName, 
          subjectId: book.subjectId, 
          chapterId: chapterId,
          bookId: book.id
        };
        await upsertRecord("topics", generalTopic);
        // Refresh state locally for immediate use
        state.topics.push(generalTopic);
      }
      topicIds = [generalTopic.id];
    } else {
      // If no chapter selected, try to find any topic in the subject or create one
      const subject = state.subjects.find(s => s.id === book.subjectId);
      const generalTopicName = `General - ${subject?.name || "Subject"}`;
      let generalTopic = state.topics.find(t => t.subjectId === book.subjectId && t.name === generalTopicName);
      if (!generalTopic) {
        // We need a chapter to create a topic. Let's find or create a "General" chapter.
        let generalChapter = state.chapters.find(c => c.subjectId === book.subjectId && c.name === "General Content" && c.bookId === book.id);
        if (!generalChapter) {
          generalChapter = { id: `ch-gen-${Date.now()}`, name: "General Content", subjectId: book.subjectId, bookId: book.id };
          await upsertRecord("chapters", generalChapter);
          state.chapters.push(generalChapter);
        }
        generalTopic = { 
          id: `top-gen-${Date.now()}`, 
          name: generalTopicName, 
          subjectId: book.subjectId, 
          chapterId: generalChapter.id,
          bookId: book.id
        };
        await upsertRecord("topics", generalTopic);
        state.topics.push(generalTopic);
      }
      topicIds = [generalTopic.id];
    }
  }

  const questionCount = parseInt(getSingleFormValue(req.body.questionCount) as string || "5", 10);

  if (!book.parsedText) {
    res.status(400).json({ message: "Book does not have parsed text. Was it fully processed?" });
    return;
  }

  const parsedText = book.parsedText; // captured as non-null string for the background closure
  const subject = state.subjects.find(s => s.id === book.subjectId);
  const chapter = chapterId ? state.chapters.find(c => c.id === chapterId) : undefined;
  const chapterName = chapter?.name;
  const topicNames = topicIds.map(tid => state.topics.find(t => t.id === tid)?.name).filter(Boolean) as string[];

  // Return job ID immediately — generation runs in the background
  const jobId = createJob();
  res.status(202).json({ jobId });

  (async () => {
    try {
      emitJobEvent(jobId, { type: "progress", message: "Preparing generation context..." });

      const generated = await generateQuestionsFromText({
        text: parsedText,
        topicId: topicIds[0],
        subjectId: book.subjectId,
        subject: subject?.name,
        questionCount,
        chapterName,
        topicNames: topicNames.length > 0 ? topicNames : undefined,
        onProgress: (msg) => emitJobEvent(jobId, { type: "progress", message: msg })
      });

      const finalizedQuestions = generated.map((q, i) => ({
        ...q,
        topicId: topicIds[i % topicIds.length],
        sourceType: book.bookType || "ai_generated"
      }));

      emitJobEvent(jobId, { type: "progress", message: `Saving ${finalizedQuestions.length} text question(s) to database...` });
      for (const q of finalizedQuestions) {
        await upsertRecord("questions", q);
      }

      // Biology: also generate diagram-based questions from the PDF figures
      const bioKeywords = ["biology", "life science", "botany", "zoology", "ecology", "genetics"];
      const isBiologySubject = !!(subject?.name) && (
        subject.name.toLowerCase().includes("bio") ||
        bioKeywords.some(k => subject.name.toLowerCase().includes(k))
      );

      if (isBiologySubject && book.fileUrl) {
        const filename = book.fileUrl.split("/").pop() || "";
        const pdfPath = path.join(booksUploadsRoot, filename);
        emitJobEvent(jobId, { type: "progress", message: "Biology subject detected — generating diagram-based questions from PDF figures..." });
        try {
          const bioQuestions = await generateQuestionsFromBiologyFigures({
            pdfPath,
            bookId: bookId as string,
            topicId: topicIds[0],
            topicIds,
            subjectId: book.subjectId,
            subject: subject?.name,
            chapterName,
            onProgress: (msg) => emitJobEvent(jobId, { type: "progress", message: msg })
          });
          if (bioQuestions.length > 0) {
            emitJobEvent(jobId, { type: "progress", message: `Saving ${bioQuestions.length} diagram-based question(s)...` });
            for (const q of bioQuestions) {
              await upsertRecord("questions", q);
            }
            finalizedQuestions.push(...(bioQuestions as typeof finalizedQuestions));
          }
        } catch (bioErr: any) {
          console.warn("[SSE] Biology figure generation failed:", bioErr?.message);
          emitJobEvent(jobId, { type: "progress", message: `Diagram generation skipped: ${bioErr?.message}` });
        }
      }

      emitJobEvent(jobId, {
        type: "complete",
        message: `Done! Generated ${finalizedQuestions.length} question(s) across ${topicIds.length} topic(s).`,
        data: { count: finalizedQuestions.length }
      });
    } catch (err: any) {
      console.error("[SSE] generate-questions job failed:", err);
      emitJobEvent(jobId, { type: "error", message: err?.message || "Question generation failed" });
    }
  })();
});

apiRouter.post("/subject-books/:bookId/extract-mcq-questions", requireRole(["super_admin"]), async (req, res) => {
  const state = await getAppState();
  const bookId = req.params.bookId;
  const chapterId = getSingleFormValue(req.body.chapterId) as string | undefined;
  const rawTopicIds = req.body.topicIds;
  let topicIds: string[] = [];

  if (Array.isArray(rawTopicIds)) {
    topicIds = rawTopicIds.map(String);
  } else if (typeof rawTopicIds === "string" && rawTopicIds) {
    topicIds = [rawTopicIds];
  }
  
  const book = state.subjectBooks.find((b) => b.id === bookId);
  if (!book) {
    res.status(404).json({ message: "Book (PDF) not found" });
    return;
  }

  if (topicIds.length === 0) {
    if (chapterId) {
      const chapter = state.chapters.find(c => c.id === chapterId);
      const generalTopicName = `General - ${chapter?.name || "Chapter"}`;
      let generalTopic = state.topics.find(t => t.chapterId === chapterId && t.name === generalTopicName);
      if (!generalTopic) {
        generalTopic = { 
          id: `top-gen-${Date.now()}`, 
          name: generalTopicName, 
          subjectId: book.subjectId, 
          chapterId: chapterId,
          bookId: book.id
        };
        await upsertRecord("topics", generalTopic);
        state.topics.push(generalTopic);
      }
      topicIds = [generalTopic.id];
    } else {
      const subject = state.subjects.find(s => s.id === book.subjectId);
      const generalTopicName = `General - ${subject?.name || "Subject"}`;
      let generalTopic = state.topics.find(t => t.subjectId === book.subjectId && t.name === generalTopicName);
      if (!generalTopic) {
        let generalChapter = state.chapters.find(c => c.subjectId === book.subjectId && c.name === "General Content" && c.bookId === book.id);
        if (!generalChapter) {
          generalChapter = { id: `ch-gen-${Date.now()}`, name: "General Content", subjectId: book.subjectId, bookId: book.id };
          await upsertRecord("chapters", generalChapter);
          state.chapters.push(generalChapter);
        }
        generalTopic = { 
          id: `top-gen-${Date.now()}`, 
          name: generalTopicName, 
          subjectId: book.subjectId, 
          chapterId: generalChapter.id,
          bookId: book.id
        };
        await upsertRecord("topics", generalTopic);
        state.topics.push(generalTopic);
      }
      topicIds = [generalTopic.id];
    }
  }

  if (!book.parsedText) {
    res.status(400).json({ message: "Book does not have parsed text. Was it fully processed?" });
    return;
  }

  const parsedText = book.parsedText;

  // Helper: write extraction status back to the book record in DB
  const updateExtractionStatus = async (status: string, progress: string, questionCount = 0) => {
    try {
      await upsertRecord("books", { ...book, extractionStatus: status, extractionProgress: progress, extractionQuestionCount: questionCount });
    } catch (e) {
      console.warn("[Progress] Failed to write extraction status:", e);
    }
  };

  // Start the extraction process in the background to avoid 524 Cloudflare Gateway Timeout
  (async () => {
    try {
      await updateExtractionStatus("running", "Starting extraction...");

      const filename = book.fileUrl.split("/").pop() || "";
      const pdfPath = path.join(booksUploadsRoot, filename);

      // Extract high-res question crops (primary visual content) and legacy diagrams in parallel
      await updateExtractionStatus("running", "Extracting question images...");
      const [crops, diagrams] = await Promise.all([
        extractPdfQuestionCrops(pdfPath, book.id),
        extractPdfDiagrams(pdfPath, book.id),
      ]);
      console.log(`[Background] Crops: ${crops.length}, Diagrams: ${diagrams.length}`);

      // Build a fast lookup: questionNumber -> cropUrl
      const cropMap = new Map<number, string>(
        crops.map(c => [c.questionNumber, c.cropUrl])
      );

      const extracted = await extractQuestionsFromPdfText({
        text: parsedText,
        subjectId: book.subjectId,
        topicId: topicIds[0],
        sourceType: book.bookType || "reference",
        bookId: book.id,
        pdfPath,
        diagrams,
        onProgress: (msg) => {
          void updateExtractionStatus("running", msg);
        }
      });

      // Embed crop URL into every question that has a known question number.
      // The crop replaces any image previously assigned by the heuristic matcher.
      for (const q of extracted) {
        const qNum = (q as any).questionNumber;
        if (typeof qNum === "number" && cropMap.has(qNum)) {
          const cropUrl = cropMap.get(qNum)!;
          // Replace existing [IMAGE:] tag if present, otherwise append
          if ((q.prompt || "").includes("[IMAGE:")) {
            q.prompt = q.prompt.replace(/\[IMAGE:[^\]]+\]/g, `[IMAGE: ${cropUrl}]`);
          } else {
            q.prompt = (q.prompt || "") + `\n[IMAGE: ${cropUrl}]`;
          }
        }
      }

      const stateBefore = await getAppState();
      const existingBookQs = stateBefore.questions.filter(q => q.bookId === book.id);
      await updateExtractionStatus("running", `Saving ${extracted.length} questions...`);
      console.log(`[Background] Clearing ${existingBookQs.length} existing questions for book ${book.id}...`);
      for (const q of existingBookQs) {
        await deleteRecord("questions", q.id);
      }

      console.log(`[Background] Saving ${extracted.length} extracted questions...`);
      for (const q of extracted) {
        await upsertRecord("questions", q);
      }

      await updateExtractionStatus("done", `Done! ${extracted.length} questions extracted.`, extracted.length);
      console.log(`[Background] Successfully extracted and saved ${extracted.length} questions for book ${book.id}.`);
    } catch (bgError: any) {
      console.error(`[Background] Error during question extraction for book ${book.id}:`, bgError);
      await updateExtractionStatus("error", `Error: ${bgError.message || "Unknown error"}`);
    }
  })();

  res.json({
    message: "AI extraction has started in the background. The questions and diagrams will populate in the Question Bank within 1-2 minutes. You can refresh or visit the Question Bank shortly.",
    count: 0
  });
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
  const state = await getAppState();
  const { subjectId, subjectIds: rawSubjectIds, rules, selectionMode, totalQuestions } = req.body;
  const targetSubjectIds = Array.isArray(rawSubjectIds) ? rawSubjectIds : (subjectId ? [subjectId] : []);

  // We no longer call ensureEnoughQuestions here as we want to generate exams purely from existing DB questions.

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

apiRouter.post("/exams/generate-combined", requireRole(["super_admin", "teacher"]), async (req, res) => {
  const generated = await generateCombinedExam(req.body);
  if (!generated) {
    res.status(404).json({ message: "Unable to generate combined exam" });
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

apiRouter.post("/exams/generate-from-prompt", requireRole(["super_admin"]), async (req, res) => {
  const { prompt } = req.body as { prompt?: string };
  if (!prompt) {
    return res.status(400).json({ message: "Prompt is required" });
  }

  try {
    // Step 1 — parse natural language prompt with AI
    const parsed = await parseExamPrompt(prompt);
    const state = await getAppState();

    // Step 2 — match batch
    const batch = state.batches.find(b =>
      b.name.toLowerCase().includes(parsed.batchName.toLowerCase()) ||
      parsed.batchName.toLowerCase().includes(b.name.toLowerCase())
    ) || state.batches[0];

    if (!batch) {
      return res.status(404).json({ message: "No batches found. Please create a batch first." });
    }

    // Step 3 — match subject
    const subject = state.subjects.find(s =>
      s.name.toLowerCase().includes(parsed.subjectName.toLowerCase()) ||
      parsed.subjectName.toLowerCase().includes(s.name.toLowerCase())
    ) || state.subjects.find(s => s.classId === batch.classId) || state.subjects[0];

    if (!subject) {
      return res.status(404).json({ message: `No subject found matching "${parsed.subjectName}".` });
    }

    // Step 4 — match topics from curriculum
    const allSubjectTopics = state.topics.filter(t => t.subjectId === subject.id);
    const matchedTopics = parsed.topicKeywords.length > 0
      ? allSubjectTopics.filter(t =>
          parsed.topicKeywords.some(k => t.name.toLowerCase().includes(k.toLowerCase()))
        )
      : [];
    const targetTopics = matchedTopics.length > 0
      ? matchedTopics
      : allSubjectTopics.slice(0, 3);

    if (targetTopics.length === 0) {
      return res.status(404).json({ message: `No topics found for subject "${subject.name}". Please set up the curriculum first.` });
    }

    const totalQuestions = Math.min(parsed.questionCount, 50);

    // Step 5 — find parsed textbook content for this subject (improves question quality)
    const book = (state as any).subjectBooks?.find((b: any) => b.subjectId === subject.id && b.parsedText)
      ?? null;

    // Step 6 — synthesize source text if no book is available
    // The AI will generate questions from its own knowledge about these topics
    const sourceText = book?.parsedText ?? [
      `Subject: ${subject.name}`,
      `Topics: ${targetTopics.map(t => t.name).join(", ")}`,
      `Difficulty: ${parsed.difficulty}`,
      `Generate ${totalQuestions} high-quality multiple-choice questions suitable for Class 11/12`,
      `students covering the above topics in ${subject.name}.`,
      `Each question should test conceptual understanding, not just memorisation.`,
    ].join("\n");

    // Step 7 — generate questions fresh from AI, distributed across topics
    const questionsPerTopic = Math.max(1, Math.ceil(totalQuestions / targetTopics.length));
    const allGeneratedQuestions: Question[] = [];

    for (const topic of targetTopics) {
      if (allGeneratedQuestions.length >= totalQuestions) break;
      const needed = Math.min(questionsPerTopic, totalQuestions - allGeneratedQuestions.length);

      const generated = await generateQuestionsFromText({
        text: sourceText,
        topicId: topic.id,
        subjectId: subject.id,
        subject: subject.name,
        chapterName: topic.name,
        topicNames: [topic.name],
        questionCount: needed,
      });

      // Assign topicId and mark as ai_generated
      const finalised = generated.map(q => ({
        ...q,
        topicId: topic.id,
        sourceType: "ai_generated" as QuestionSource,
      }));

      for (const q of finalised) {
        await upsertRecord("questions", q);
      }

      allGeneratedQuestions.push(...finalised);
    }

    if (allGeneratedQuestions.length === 0) {
      return res.status(500).json({ message: "AI failed to generate any questions. Please try again." });
    }

    // Step 8 — build and persist the exam
    const { default: crypto } = await import("node:crypto");
    const examId = `exam-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
    const exam = {
      id: examId,
      blueprintId: `ai-prompt-${Date.now()}`,
      name: parsed.examName,
      classId: batch.classId,
      streamId: batch.streamId,
      batchId: batch.id,
      subjectId: subject.id,
      durationMinutes: parsed.durationMinutes,
      generatedAt: new Date().toISOString(),
      generationMode: "custom" as const,
      adaptiveSummary: `AI-generated from prompt · Topics: ${targetTopics.map(t => t.name).join(", ")} · Difficulty: ${parsed.difficulty}`,
      questions: allGeneratedQuestions.slice(0, totalQuestions).map((q, i) => ({
        questionId: q.id,
        order: i + 1,
        marks: q.marks ?? 1,
        negativeMarks: q.negativeMarks ?? 0,
        optionOrderIds: q.options.map((o: any) => o.id),
      })),
    };

    await upsertRecord("exams", exam);

    res.status(201).json({
      exam,
      questions: allGeneratedQuestions.slice(0, totalQuestions),
      analysis: parsed,
    });

  } catch (error: any) {
    console.error("Prompt generation failed:", error);
    res.status(500).json({ message: error.message || "Failed to generate exam from prompt" });
  }
});

apiRouter.get("/exams", requireRole(["super_admin", "teacher"]), async (_req: Request, res: Response) => {
  const state = await getAppState();
  res.json(state.exams);
});

apiRouter.delete("/exams/:id", requireRole(["super_admin", "teacher"]), async (req, res) => {
  const { deleteRecord } = await import("../data/database.js");
  await deleteRecord("exams", req.params.id as string);
  res.status(204).end();
});

apiRouter.put("/exams/:examId", requireRole(["super_admin", "teacher"]), async (req, res) => {
  const { name, durationMinutes, scheduledStartTime, scheduledEndTime, batchId } = req.body;
  const state = await getAppState();
  const examIndex = state.exams.findIndex((item) => item.id === req.params.examId);
  if (examIndex === -1) {
    res.status(404).json({ message: "Exam not found" });
    return;
  }

  const existingExam = state.exams[examIndex];
  const updatedExam = {
    ...existingExam,
    name: name ?? existingExam.name,
    durationMinutes: durationMinutes !== undefined ? Number(durationMinutes) : existingExam.durationMinutes,
    scheduledStartTime: scheduledStartTime !== undefined ? scheduledStartTime : existingExam.scheduledStartTime,
    scheduledEndTime: scheduledEndTime !== undefined ? scheduledEndTime : existingExam.scheduledEndTime,
    batchId: batchId !== undefined ? batchId : existingExam.batchId,
  };

  await upsertRecord("exams", updatedExam);
  res.json(updatedExam);
});


apiRouter.get("/exams/:examId", async (req, res) => {
  const state = await getAppState();
  const exam = state.exams.find((item) => item.id === req.params.examId);
  if (!exam) {
    res.status(404).json({ message: "Exam not found" });
    return;
  }

  const auth = (req as AuthenticatedRequest).auth;
  const authUser = state.users.find(u => u.id === auth?.sub);
  const questions = await getExamQuestions(exam.id);

  // Shuffle question order per student so each student sees a different sequence
  if (authUser?.role === "student") {
    const effectiveStudentId = authUser.studentId ?? auth?.sub ?? "";
    const seed = hashSeed(exam.id + effectiveStudentId);
    const shuffledOrder = seededShuffle(exam.questions, seed);
    const orderedQuestions = shuffledOrder
      .map(gq => questions.find(q => q.id === gq.questionId))
      .filter(Boolean);

    res.json({
      exam: { ...exam, questions: shuffledOrder },
      questions: orderedQuestions
    });
    return;
  }

  res.json({ exam, questions });
});

apiRouter.post("/exams/:examId/submit", async (req, res) => {
  const { studentId, answers } = req.body as { studentId?: string; answers?: Array<{ questionId: string; selectedOptionIds: string[] }> };
  const authUserId = (req as AuthenticatedRequest).auth?.sub;
  const state = await getAppState();
  const authUser = state.users.find((item) => item.id === authUserId);
  const effectiveStudentId = authUser?.studentId ?? authUserId;

  if (!effectiveStudentId || !answers) {
    res.status(400).json({ message: "studentId and answers are required" });
    return;
  }

  const result = await evaluateExamSubmission(req.params.examId, effectiveStudentId, answers);
  if (!result) {
    res.status(404).json({ message: "Exam not found" });
    return;
  }

  // Update live tracker to submitted
  try {
    const tracker = {
      id: `${req.params.examId}-${effectiveStudentId}`,
      examId: req.params.examId,
      studentId: effectiveStudentId,
      studentName: authUser?.name || "Unknown Student",
      answeredCount: answers.length,
      totalQuestions: answers.length,
      currentQuestionIndex: 0,
      status: "submitted",
      lastActive: new Date().toISOString()
    };
    await upsertRecord("liveTrackers", tracker);
  } catch (err) {
    console.error("Failed to update tracker on submit:", err);
  }

  // Mark exam session as submitted so it won't be restored on refresh
  try {
    const sessionId = `session-${req.params.examId}-${effectiveStudentId}`;
    const existingSession = await getRecord<ExamSession>("examSessions", sessionId);
    if (existingSession) {
      await upsertRecord("examSessions", { ...existingSession, status: "submitted" });
    }
  } catch (err) {
    console.error("Failed to mark session as submitted:", err);
  }

  res.json(result);
});

apiRouter.post("/exams/:examId/heartbeat", async (req, res) => {
  const { examId } = req.params;
  const { answeredCount, totalQuestions, currentQuestionIndex, status } = req.body as {
    answeredCount: number;
    totalQuestions: number;
    currentQuestionIndex: number;
    status: "taking" | "submitted";
  };
  const authUserId = (req as AuthenticatedRequest).auth?.sub;
  const state = await getAppState();
  const authUser = state.users.find((item) => item.id === authUserId);
  const effectiveStudentId = authUser?.studentId ?? authUserId;

  if (!effectiveStudentId) {
    res.status(400).json({ message: "Student authentication required" });
    return;
  }

  const student = state.students.find((s) => s.id === effectiveStudentId);
  const studentName = student?.name || authUser?.name || "Unknown Student";

  const tracker = {
    id: `${examId}-${effectiveStudentId}`,
    examId,
    studentId: effectiveStudentId,
    studentName,
    answeredCount: Number(answeredCount) || 0,
    totalQuestions: Number(totalQuestions) || 0,
    currentQuestionIndex: Number(currentQuestionIndex) || 0,
    status: status || "taking",
    lastActive: new Date().toISOString()
  };

  await upsertRecord("liveTrackers", tracker);
  res.json({ status: "ok" });
});

apiRouter.post("/exams/:examId/violation", async (req, res) => {
  const examId = Array.isArray(req.params.examId) ? req.params.examId[0] : req.params.examId;
  const { type } = req.body as { type?: string };
  const authUserId = (req as AuthenticatedRequest).auth?.sub;
  const state = await getAppState();
  const authUser = state.users.find((u) => u.id === authUserId);
  const effectiveStudentId = authUser?.studentId ?? authUserId;

  if (!effectiveStudentId || !type) {
    res.status(400).json({ message: "Missing student or violation type" });
    return;
  }

  const trackerId = `${examId}-${effectiveStudentId}`;
  const existing = (await listRecords<any>("liveTrackers")).find((t: any) => t.id === trackerId) ?? {
    id: trackerId,
    examId,
    studentId: effectiveStudentId,
    studentName: state.students.find((s) => s.id === effectiveStudentId)?.name ?? authUser?.name ?? "Unknown",
    answeredCount: 0,
    totalQuestions: 0,
    currentQuestionIndex: 0,
    status: "taking",
    lastActive: new Date().toISOString(),
  };

  const violations: { type: string; timestamp: string }[] = existing.violations ?? [];
  violations.push({ type, timestamp: new Date().toISOString() });

  await upsertRecord("liveTrackers", { ...existing, violations });
  res.json({ status: "ok", totalViolations: violations.length });
});

// ── Exam Session Persistence ──────────────────────────────────────────────────

apiRouter.get("/exams/:examId/session", requireAuth, async (req, res) => {
  const { examId } = req.params;
  const authUserId = (req as AuthenticatedRequest).auth?.sub;
  const state = await getAppState();
  const authUser = state.users.find((u) => u.id === authUserId);
  const effectiveStudentId = authUser?.studentId ?? authUserId;

  if (!effectiveStudentId) {
    res.status(400).json({ message: "Student authentication required" });
    return;
  }

  const sessionId = `session-${examId}-${effectiveStudentId}`;
  const session = await getRecord<ExamSession>("examSessions", sessionId);

  if (!session || session.status === "submitted") {
    res.status(404).json({ message: "No active session" });
    return;
  }

  const exam = state.exams.find((e) => e.id === examId);
  const elapsedSeconds = exam
    ? Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000)
    : 0;
  const durationRemaining = exam ? exam.durationMinutes * 60 - elapsedSeconds : 0;
  const scheduleRemaining = exam?.scheduledEndTime
    ? Math.floor((new Date(exam.scheduledEndTime).getTime() - Date.now()) / 1000)
    : Infinity;
  const timeRemainingSeconds = Math.max(0, Math.min(durationRemaining, scheduleRemaining));

  res.json({ ...session, timeRemainingSeconds });
});

apiRouter.post("/exams/:examId/session", requireAuth, async (req, res) => {
  const { examId } = req.params;
  const authUserId = (req as AuthenticatedRequest).auth?.sub;
  const state = await getAppState();
  const authUser = state.users.find((u) => u.id === authUserId);
  const effectiveStudentId = authUser?.studentId ?? authUserId;

  if (!effectiveStudentId) {
    res.status(400).json({ message: "Student authentication required" });
    return;
  }

  const exam = state.exams.find((e) => e.id === examId);
  if (!exam) {
    res.status(404).json({ message: "Exam not found" });
    return;
  }

  const sessionId = `session-${examId}-${effectiveStudentId}`;
  const existing = await getRecord<ExamSession>("examSessions", sessionId);

  if (existing && existing.status === "in_progress") {
    const elapsedSeconds = Math.floor((Date.now() - new Date(existing.startedAt).getTime()) / 1000);
    const durationRem = exam.durationMinutes * 60 - elapsedSeconds;
    const scheduleRem = exam.scheduledEndTime
      ? Math.floor((new Date(exam.scheduledEndTime).getTime() - Date.now()) / 1000)
      : Infinity;
    const timeRemainingSeconds = Math.max(0, Math.min(durationRem, scheduleRem));
    res.json({ ...existing, timeRemainingSeconds });
    return;
  }

  const session: ExamSession = {
    id: sessionId,
    examId: examId as string,
    studentId: effectiveStudentId,
    startedAt: new Date().toISOString(),
    answers: {},
    currentQuestionIndex: 0,
    status: "in_progress"
  };
  await upsertRecord("examSessions", session);
  const initScheduleRem = exam.scheduledEndTime
    ? Math.floor((new Date(exam.scheduledEndTime).getTime() - Date.now()) / 1000)
    : Infinity;
  const initTimeRemaining = Math.max(0, Math.min(exam.durationMinutes * 60, initScheduleRem));
  res.json({ ...session, timeRemainingSeconds: initTimeRemaining });
});

apiRouter.patch("/exams/:examId/session/answer", requireAuth, async (req, res) => {
  const { examId } = req.params;
  const { questionId, selectedOptionIds } = req.body as { questionId: string; selectedOptionIds: string[] };
  const authUserId = (req as AuthenticatedRequest).auth?.sub;
  const state = await getAppState();
  const authUser = state.users.find((u) => u.id === authUserId);
  const effectiveStudentId = authUser?.studentId ?? authUserId;

  if (!effectiveStudentId || !questionId) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const sessionId = `session-${examId}-${effectiveStudentId}`;
  const session = await getRecord<ExamSession>("examSessions", sessionId);

  if (!session || session.status === "submitted") {
    res.status(404).json({ message: "No active session" });
    return;
  }

  await upsertRecord("examSessions", {
    ...session,
    answers: { ...session.answers, [questionId]: selectedOptionIds ?? [] }
  });
  res.json({ status: "ok" });
});

apiRouter.patch("/exams/:examId/session/index", requireAuth, async (req, res) => {
  const { examId } = req.params;
  const { currentQuestionIndex } = req.body as { currentQuestionIndex: number };
  const authUserId = (req as AuthenticatedRequest).auth?.sub;
  const state = await getAppState();
  const authUser = state.users.find((u) => u.id === authUserId);
  const effectiveStudentId = authUser?.studentId ?? authUserId;

  if (!effectiveStudentId || typeof currentQuestionIndex !== "number") {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const sessionId = `session-${examId}-${effectiveStudentId}`;
  const session = await getRecord<ExamSession>("examSessions", sessionId);

  if (!session || session.status === "submitted") {
    res.status(404).json({ message: "No active session" });
    return;
  }

  await upsertRecord("examSessions", { ...session, currentQuestionIndex });
  res.json({ status: "ok" });
});

apiRouter.get("/exams/:examId/live-status", requireRole(["super_admin", "teacher"]), async (req, res) => {
  const { examId } = req.params;
  const state = await getAppState();
  const { listRecords } = await import("../data/database.js");

  const exam = state.exams.find((e) => e.id === examId);
  if (!exam) {
    res.status(404).json({ message: "Exam not found" });
    return;
  }

  const batchStudents = state.students.filter((s) => s.batchId === exam.batchId);
  const allTrackers = await listRecords<any>("liveTrackers");
  const examTrackers = allTrackers.filter((t) => t.examId === examId);
  const examSubmissions = state.submissions.filter((s) => s.examId === examId);

  const now = Date.now();
  const activeThresholdMs = 20 * 1000;

  const studentStatuses = batchStudents.map((student) => {
    const submission = examSubmissions.find((sub) => sub.studentId === student.id);
    const tracker = examTrackers.find((t) => t.studentId === student.id);

    let status: "not_started" | "active" | "offline" | "submitted" = "not_started";
    let answeredCount = 0;
    let totalQuestions = exam.questions.length;
    let currentQuestionIndex = 0;
    let lastActive: string | undefined = undefined;

    if (submission) {
      status = "submitted";
      answeredCount = totalQuestions;
    } else if (tracker) {
      answeredCount = tracker.answeredCount;
      totalQuestions = tracker.totalQuestions || totalQuestions;
      currentQuestionIndex = tracker.currentQuestionIndex;
      lastActive = tracker.lastActive;

      const lastActiveTime = new Date(tracker.lastActive).getTime();
      if (tracker.status === "submitted") {
        status = "submitted";
        status = "submitted";
      } else if (now - lastActiveTime < activeThresholdMs) {
        status = "active";
      } else {
        status = "offline";
      }
    }

    return {
      studentId: student.id,
      studentName: student.name,
      status,
      answeredCount,
      totalQuestions,
      currentQuestionIndex,
      lastActive,
      violations: (tracker?.violations ?? []) as { type: string; timestamp: string }[],
    };
  });

  const activeCount = studentStatuses.filter((s) => s.status === "active").length;
  const submittedCount = studentStatuses.filter((s) => s.status === "submitted").length;
  const offlineCount = studentStatuses.filter((s) => s.status === "offline").length;
  const notStartedCount = studentStatuses.filter((s) => s.status === "not_started").length;

  res.json({
    examId: exam.id,
    examName: exam.name,
    totalQuestions: exam.questions.length,
    scheduledStartTime: exam.scheduledStartTime ?? null,
    scheduledEndTime: exam.scheduledEndTime ?? null,
    durationMinutes: exam.durationMinutes,
    statistics: {
      totalRegistered: batchStudents.length,
      activeCount,
      submittedCount,
      offlineCount,
      notStartedCount
    },
    students: studentStatuses
  });
});

apiRouter.get("/exams/:examId/leaderboard", requireRole(["super_admin", "teacher"]), async (req, res) => {
  const { examId } = req.params;
  const state = await getAppState();

  const exam = state.exams.find((e) => e.id === examId);
  if (!exam) {
    res.status(404).json({ message: "Exam not found" });
    return;
  }

  const examSubmissions = state.submissions.filter((s: any) => s.examId === examId);
  const batchStudents = state.students.filter((s) => s.batchId === exam.batchId);

  const leaderboard = batchStudents.map((student) => {
    const submission = examSubmissions.find((sub: any) => sub.studentId === student.id);
    return {
      studentId: student.id,
      studentName: student.name,
      obtainedMarks: submission?.obtainedMarks ?? null,
      totalMarks: submission?.totalMarks ?? null,
      percentage: submission?.percentage ?? null,
      correctAnswers: submission?.correctAnswers ?? null,
      incorrectAnswers: submission?.incorrectAnswers ?? null,
      unattemptedAnswers: submission?.unattemptedAnswers ?? null,
      submittedAt: submission?.id ? submission.id : null,
      submitted: !!submission
    };
  });

  leaderboard.sort((a, b) => {
    if (!a.submitted && !b.submitted) return 0;
    if (!a.submitted) return 1;
    if (!b.submitted) return -1;
    return (b.obtainedMarks ?? 0) - (a.obtainedMarks ?? 0);
  });

  const ranked = leaderboard.map((entry, idx) => ({
    ...entry,
    rank: entry.submitted ? idx + 1 : null
  }));

  // Re-rank only submitted students
  let rank = 1;
  for (const entry of ranked) {
    if (entry.submitted) {
      entry.rank = rank++;
    }
  }

  res.json({ examId, examName: exam.name, leaderboard: ranked });
});

apiRouter.post("/exams/:examId/force-submit-all", requireRole(["super_admin", "teacher"]), async (req, res) => {
  const { examId } = req.params;
  const state = await getAppState();
  const { listRecords } = await import("../data/database.js");

  const exam = state.exams.find((e) => e.id === examId);
  if (!exam) {
    res.status(404).json({ message: "Exam not found" });
    return;
  }

  const allSessions = await listRecords<ExamSession>("examSessions");
  const activeSessions = allSessions.filter(
    (s) => s.examId === examId && s.status === "in_progress"
  );

  let forceSubmitted = 0;
  for (const s of activeSessions) {
    try {
      const answers = Object.entries(s.answers ?? {}).map(([questionId, selectedOptionIds]) => ({
        questionId,
        selectedOptionIds: selectedOptionIds as string[]
      }));
      await evaluateExamSubmission(req.params.examId as string, s.studentId, answers);
      await upsertRecord("examSessions", { ...s, status: "submitted" });

      const studentUser = state.users.find((u) => u.studentId === s.studentId);
      const student = state.students.find((st) => st.id === s.studentId);
      await upsertRecord("liveTrackers", {
        id: `${examId}-${s.studentId}`,
        examId,
        studentId: s.studentId,
        studentName: student?.name || studentUser?.name || "Unknown Student",
        answeredCount: Object.keys(s.answers ?? {}).length,
        totalQuestions: exam.questions.length,
        currentQuestionIndex: 0,
        status: "submitted",
        lastActive: new Date().toISOString()
      });
      forceSubmitted++;
    } catch (err) {
      console.error(`Force-submit failed for session ${s.id}:`, err);
    }
  }

  res.json({ message: `Force-submitted ${forceSubmitted} active session(s).`, count: forceSubmitted });
});


apiRouter.post("/subject-books/:bookId/detect-curriculum", requireRole(["super_admin"]), async (req, res) => {
  const state = await getAppState();
  let book = state.subjectBooks.find(b => b.id === req.params.bookId);
  
  if (!book) {
    return res.status(404).json({ message: "Book not found" });
  }

  // If parsedText is missing (e.g. for older uploads), try to re-extract it
  if (!book.parsedText) {
    try {
      const path = await import("path");
      const { booksUploadsRoot } = await import("../utils/paths.js");
      const fileName = book.fileUrl.split("/").pop();
      if (fileName) {
        const filePath = path.join(booksUploadsRoot, fileName);
        const { extractPdfText } = await import("../utils/pdf.js");
        const parsed = await extractPdfText(filePath);
        
        book.parsedText = parsed.extractedText;
        book.previewText = parsed.previewText;
        book.pageCount = parsed.pageCount;
        
        await upsertRecord("subjectBooks", book);
      }
    } catch (err) {
      console.error("Re-extraction failed during detection:", err);
    }
  }

  if (!book.parsedText) {
    return res.status(400).json({ message: "Could not extract text from this PDF. Please ensure it is a valid, readable PDF file." });
  }

  try {
    const curriculum = await detectCurriculumFromText(book.parsedText);
    res.json(curriculum);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to detect curriculum" });
  }
});

apiRouter.post("/offline-exams/generate", requireAuth, requireRole(["teacher", "super_admin"]), async (req, res) => {
  try {
    const { className, subjectName, topics } = req.body;
    if (!className || !subjectName || !topics || topics.length === 0) {
      return res.status(400).json({ message: "Class name, subject name, and topics are required." });
    }
    const paper = await generateOfflineBoardPaper({ className, subjectName, topics });
    res.json(paper);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to generate offline paper" });
  }
});

function getSingleFormValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

function hashSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    // Linear congruential generator step
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    const j = Math.abs(s) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
