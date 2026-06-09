import fs from "node:fs/promises";
import { Router, Request, Response } from "express";
import multer from "multer";
import { getAppState, upsertRecord, deleteRecord } from "../data/database.js";
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
import path from "node:path";
import { extractPdfText, extractPdfDiagrams } from "../utils/pdf.js";
import { generateQuestionsFromText, ensureEnoughQuestions, parseExamPrompt, detectCurriculumFromText, generateOfflineBoardPaper, extractQuestionsFromPdfText } from "../utils/ai-generator.js";
import { listReferencePapers } from "../utils/reference-papers.js";
import { findUserByEmail, requireAuth, requireRole, signAuthToken, verifyPassword } from "../utils/auth.js";
import type { AuthenticatedRequest, Question, QuestionSource, SubjectBook } from "../types.js";

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
    
    // Re-fetch questions
    let questions = state.questions.filter(q => targetTopicIds.includes(q.topicId));
    
    // Filter by source if specified
    if (Array.isArray(allowedSourceTypes) && allowedSourceTypes.length > 0) {
      questions = questions.filter(q => allowedSourceTypes.includes(q.sourceType || "custom"));
    }
    
    if (questions.length === 0) {
      return res.status(400).json({ message: "No questions available for selected topics and source filters. Make sure a textbook is uploaded for this subject if you want AI generation." });
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

  try {
    const subject = state.subjects.find(s => s.id === book.subjectId);
    
    const generated = await generateQuestionsFromText({
      text: book.parsedText,
      topicId: topicIds[0],
      subjectId: book.subjectId,
      subject: subject?.name,
      questionCount,
    });

    // Tag questions with topics cyclically
    const finalizedQuestions = generated.map((q, i) => ({
      ...q,
      topicId: topicIds[i % topicIds.length],
      sourceType: book.bookType || "ai_generated"
    }));

    for (const q of finalizedQuestions) {
      await upsertRecord("questions", q);
    }

    res.json({
      message: `Successfully generated ${finalizedQuestions.length} questions across ${topicIds.length} topics.`,
      count: finalizedQuestions.length
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to generate questions" });
  }
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

  // Start the extraction process in the background to avoid 524 Cloudflare Gateway Timeout
  (async () => {
    try {
      const filename = book.fileUrl.split("/").pop() || "";
      const pdfPath = path.join(booksUploadsRoot, filename);
      
      console.log(`[Background] Extracting diagrams first for book ${book.id} at ${pdfPath}...`);
      const diagrams = await extractPdfDiagrams(pdfPath, book.id);
      console.log(`[Background] Found ${diagrams.length} diagrams for book ${book.id}.`);

      const extracted = await extractQuestionsFromPdfText({
        text: parsedText,
        subjectId: book.subjectId,
        topicId: topicIds[0],
        sourceType: book.bookType || "reference",
        bookId: book.id,
        diagrams
      });

      const stateBefore = await getAppState();
      const existingBookQs = stateBefore.questions.filter(q => q.bookId === book.id);
      console.log(`[Background] Clearing ${existingBookQs.length} existing questions for book ${book.id} to prevent duplicates/leftovers...`);
      for (const q of existingBookQs) {
        await deleteRecord("questions", q.id);
      }

      console.log(`[Background] Saving ${extracted.length} extracted questions...`);
      for (const q of extracted) {
        await upsertRecord("questions", q);
      }
      console.log(`[Background] Successfully extracted and saved ${extracted.length} questions for book ${book.id}.`);
    } catch (bgError: any) {
      console.error(`[Background] Error during question extraction for book ${book.id}:`, bgError);
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
    const parsed = await parseExamPrompt(prompt);
    const state = await getAppState();

    // 1. Find Batch
    const batch = state.batches.find(b => 
      b.name.toLowerCase().includes(parsed.batchName.toLowerCase()) || 
      parsed.batchName.toLowerCase().includes(b.name.toLowerCase())
    ) || state.batches[0];

    // 2. Find Subject
    const subject = state.subjects.find(s => 
      s.name.toLowerCase().includes(parsed.subjectName.toLowerCase()) ||
      parsed.subjectName.toLowerCase().includes(s.name.toLowerCase())
    ) || state.subjects.find(s => s.classId === batch.classId) || state.subjects[0];

    // 3. Find Topics
    const matchedTopics = state.topics.filter(t => 
      t.subjectId === subject.id && 
      parsed.topicKeywords.some(k => t.name.toLowerCase().includes(k.toLowerCase()))
    );

    const targetTopicIds = matchedTopics.length > 0 
      ? matchedTopics.map(t => t.id)
      : state.topics.filter(t => t.subjectId === subject.id).slice(0, 5).map(t => t.id);

    if (targetTopicIds.length === 0) {
      return res.status(404).json({ message: `Could not find any topics for subject: ${subject.name}` });
    }

    // 4. Set question count limit and calculate weights
    const totalQuestions = Math.min(parsed.questionCount, 50);
    const weightagePerTopic = 100 / targetTopicIds.length;

    const generated = await generateCustomExam({
      name: parsed.examName,
      batchId: batch.id,
      subjectId: subject.id,
      durationMinutes: parsed.durationMinutes,
      totalQuestions,
      selectionMode: "topic",
      rules: targetTopicIds.map(id => ({
        entityId: id,
        weightagePercent: weightagePerTopic
      })),
      allowedSourceTypes: ["pyq", "reference", "textbook", "ai_generated", "custom"]
    });

    if (!generated) {
      return res.status(400).json({ message: "Unable to generate exam from prompt: No questions available." });
    }

    if ("error" in generated) {
      return res.status(400).json({ 
        message: `Unable to generate exam: ${generated.error}. Matched Subject: ${subject.name}, Topics: ${matchedTopics.map(t => t.name).join(", ")}` 
      });
    }

    res.status(201).json({
      exam: generated,
      questions: await getExamQuestions(generated.id),
      analysis: parsed
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

  // When submitting, also update live tracker to submitted
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
      lastActive
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
