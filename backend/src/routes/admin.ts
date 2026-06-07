import { Router, Request, Response } from "express";
import { getAppState, listRecords, upsertRecord, deleteRecord, getRecord } from "../data/database.js";
import { requireAuth, requireRole } from "../utils/auth.js";
import bcrypt from "bcryptjs";
import multer from "multer";
import { parseCurriculumDocx } from "../utils/curriculum-bulk.js";
import { uploadsRoot } from "../utils/paths.js";
import type { ClassNode, StreamNode, BatchNode, UserAccount, Student, Question } from "../types.js";

export const adminRouter = Router();

adminRouter.use(requireAuth);
adminRouter.use(requireRole(["super_admin", "teacher"]));

// --- Classes (Super Admin only) ---
adminRouter.get("/classes", async (_req: Request, res: Response) => {
  const classes = await listRecords<ClassNode>("classes");
  res.json(classes);
});

adminRouter.post("/classes", requireRole(["super_admin"]), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: "Name is required" });

  const newClass: ClassNode = {
    id: `cls-${Date.now()}`,
    name
  };
  await upsertRecord("classes", newClass);
  res.status(201).json(newClass);
});

adminRouter.put("/classes/:id", requireRole(["super_admin"]), async (req, res) => {
  const id = req.params.id as string;
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: "Name is required" });
  
  const updated: ClassNode = { id, name };
  await upsertRecord("classes", updated);
  res.json(updated);
});

adminRouter.delete("/classes/:id", requireRole(["super_admin"]), async (req, res) => {
  await deleteRecord("classes", req.params.id as string);
  res.status(204).end();
});

// --- Streams (Super Admin only) ---
adminRouter.get("/streams", async (_req: Request, res: Response) => {
  const streams = await listRecords<StreamNode>("streams");
  res.json(streams);
});

adminRouter.post("/streams", requireRole(["super_admin"]), async (req, res) => {
  const { name, classId } = req.body;
  if (!name || !classId) return res.status(400).json({ message: "Name and classId are required" });

  const newStream: StreamNode = {
    id: `str-${Date.now()}`,
    name,
    classId
  };
  await upsertRecord("streams", newStream);
  res.status(201).json(newStream);
});

adminRouter.put("/streams/:id", requireRole(["super_admin"]), async (req, res) => {
  const id = req.params.id as string;
  const { name, classId } = req.body;
  if (!name || !classId) return res.status(400).json({ message: "Name and classId are required" });

  const updated: StreamNode = { id, name, classId };
  await upsertRecord("streams", updated);
  res.json(updated);
});

adminRouter.delete("/streams/:id", requireRole(["super_admin"]), async (req, res) => {
  await deleteRecord("streams", req.params.id as string);
  res.status(204).end();
});

// --- Batches (Super Admin only) ---
adminRouter.get("/batches", async (_req: Request, res: Response) => {
  const batches = await listRecords<BatchNode>("batches");
  res.json(batches);
});

adminRouter.post("/batches", requireRole(["super_admin"]), async (req, res) => {
  const { name, classId, streamId } = req.body;
  if (!name || !classId || !streamId) return res.status(400).json({ message: "Name, classId, and streamId are required" });

  const newBatch: BatchNode = {
    id: `bat-${Date.now()}`,
    name,
    classId,
    streamId
  };
  await upsertRecord("batches", newBatch);
  res.status(201).json(newBatch);
});

adminRouter.put("/batches/:id", requireRole(["super_admin"]), async (req, res) => {
  const id = req.params.id as string;
  const { name, classId, streamId } = req.body;
  if (!name || !classId || !streamId) return res.status(400).json({ message: "Name, classId, and streamId are required" });

  const updated: BatchNode = { id, name, classId, streamId };
  await upsertRecord("batches", updated);
  res.json(updated);
});

adminRouter.delete("/batches/:id", requireRole(["super_admin"]), async (req, res) => {
  await deleteRecord("batches", req.params.id as string);
  res.status(204).end();
});

// --- Subjects ---
adminRouter.get("/subjects", async (_req: Request, res: Response) => {
  const subjects = await listRecords<any>("subjects");
  res.json(subjects);
});

adminRouter.post("/subjects", async (req, res) => {
  const { name, classId, streamId } = req.body;
  if (!name || !classId || !streamId) return res.status(400).json({ message: "Name, classId, and streamId are required" });

  const newSubject = {
    id: `sub-${Date.now()}`,
    name,
    classId,
    streamId
  };
  await upsertRecord("subjects", newSubject);
  res.status(201).json(newSubject);
});

adminRouter.put("/subjects/:id", async (req, res) => {
  const { id } = req.params;
  const { name, classId, streamId } = req.body;
  if (!name || !classId || !streamId) return res.status(400).json({ message: "Name, classId, and streamId are required" });

  const updated = { id, name, classId, streamId };
  await upsertRecord("subjects", updated);
  res.json(updated);
});

adminRouter.delete("/subjects/:id", async (req, res) => {
  try {
    const { id } = req.params;
    // Optional: Cascade delete chapters and topics
    const state = await getAppState();
    const chaptersToDelete = state.chapters.filter(c => c.subjectId === id);
    const topicsToDelete = state.topics.filter(t => t.subjectId === id);

    for (const ch of chaptersToDelete) await deleteRecord("chapters", ch.id);
    for (const top of topicsToDelete) await deleteRecord("topics", top.id);

    await deleteRecord("subjects", id);
    res.status(204).end();
  } catch (error) {
    console.error("Error deleting subject:", error);
    res.status(500).json({ message: "Failed to delete subject and its dependencies" });
  }
});

// --- Chapters ---
adminRouter.get("/chapters", async (_req: Request, res: Response) => {
  const chapters = await listRecords<any>("chapters");
  res.json(chapters);
});

adminRouter.post("/chapters", async (req, res) => {
  const { name, subjectId } = req.body;
  if (!name || !subjectId) return res.status(400).json({ message: "Name and subjectId are required" });
  const newChapter = { id: `ch-${Date.now()}`, name, subjectId };
  await upsertRecord("chapters", newChapter);
  res.status(201).json(newChapter);
});

adminRouter.put("/chapters/:id", async (req, res) => {
  const { id } = req.params;
  const { name, subjectId } = req.body;
  const updated = { id, name, subjectId };
  await upsertRecord("chapters", updated);
  res.json(updated);
});

adminRouter.delete("/chapters/:id", async (req, res) => {
  await deleteRecord("chapters", req.params.id);
  res.status(204).end();
});

// --- Topics ---
adminRouter.get("/topics", async (_req: Request, res: Response) => {
  const topics = await listRecords<any>("topics");
  res.json(topics);
});

adminRouter.post("/topics", async (req, res) => {
  const { name, subjectId, chapterId } = req.body;
  if (!name || !subjectId || !chapterId) return res.status(400).json({ message: "Name, subjectId, and chapterId are required" });
  const newTopic = { id: `top-${Date.now()}`, name, subjectId, chapterId };
  await upsertRecord("topics", newTopic);
  res.status(201).json(newTopic);
});

adminRouter.put("/topics/:id", async (req, res) => {
  const { id } = req.params;
  const { name, subjectId, chapterId } = req.body;
  const updated = { id, name, subjectId, chapterId };
  await upsertRecord("topics", updated);
  res.json(updated);
});

adminRouter.delete("/topics/:id", async (req, res) => {
  await deleteRecord("topics", req.params.id);
  res.status(204).end();
});

adminRouter.delete("/questions/clear-all", async (req, res) => {
  try {
    const state = await getAppState();
    for (const q of state.questions) {
      await deleteRecord("questions", q.id);
    }
    res.status(204).end();
  } catch (error) {
    console.error("Error clearing question bank:", error);
    res.status(500).json({ message: "Failed to clear questions" });
  }
});

// --- Users ---
adminRouter.get("/users", async (_req: Request, res: Response) => {
  const users = await listRecords<UserAccount>("users");
  const students = await listRecords<Student>("students");
  const safeUsers = users.map(u => {
    const { passwordHash, ...rest } = u;
    const student = u.studentId ? students.find(s => s.id === u.studentId) : null;
    return {
      ...rest,
      batchId: student?.batchId ?? "",
      classId: student?.classId ?? "",
      streamId: student?.streamId ?? ""
    };
  });
  res.json(safeUsers);
});

adminRouter.post("/users", async (req, res) => {
  const { name, email, role, password, batchId, classId, streamId } = req.body;
  if (!name || !email || !role || !password) {
    return res.status(400).json({ message: "Name, email, role, and password are required" });
  }

  const existingUsers = await listRecords<UserAccount>("users");
  if (existingUsers.some(u => u.email === email)) {
    return res.status(400).json({ message: "Email already exists" });
  }

  let studentId;
  
  if (role === "student") {
    if (!batchId || !classId || !streamId) {
      return res.status(400).json({ message: "Students require batchId, classId, and streamId" });
    }
    studentId = `stu-${Date.now()}`;
    const newStudent: Student = {
      id: studentId,
      name,
      batchId,
      classId,
      streamId
    };
    await upsertRecord("students", newStudent);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const newUser: UserAccount = {
    id: `usr-${Date.now()}`,
    name,
    email,
    role,
    passwordHash,
    studentId
  };

  await upsertRecord("users", newUser);

  const { passwordHash: _ph, ...safeUser } = newUser;
  res.status(201).json(safeUser);
});

adminRouter.put("/users/:id", async (req, res) => {
  const { id } = req.params;
  const { name, email, role, batchId, classId, streamId } = req.body;
  if (!name || !email || !role) {
    return res.status(400).json({ message: "Name, email, and role are required" });
  }

  const existingUsers = await listRecords<UserAccount>("users");
  const userToUpdate = existingUsers.find(u => u.id === id);
  if (!userToUpdate) return res.status(404).json({ message: "User not found" });

  let studentId = userToUpdate.studentId;

  if (role === "student") {
    let finalBatchId = batchId;
    let finalClassId = classId;
    let finalStreamId = streamId;

    if (studentId && (!finalBatchId || !finalClassId || !finalStreamId)) {
      const existingStudent = await getRecord<Student>("students", studentId);
      if (existingStudent) {
        if (!finalBatchId) finalBatchId = existingStudent.batchId;
        if (!finalClassId) finalClassId = existingStudent.classId;
        if (!finalStreamId) finalStreamId = existingStudent.streamId;
      }
    }

    if (!finalBatchId || !finalClassId || !finalStreamId) {
      return res.status(400).json({ message: "Students require batchId, classId, and streamId" });
    }

    if (!studentId) {
      studentId = `stu-${Date.now()}`;
    }

    const studentData: Student = {
      id: studentId,
      name,
      batchId: finalBatchId,
      classId: finalClassId,
      streamId: finalStreamId
    };
    await upsertRecord("students", studentData);
  } else {
    // If the role changed from student to teacher/admin, clean up student record
    if (studentId) {
      await deleteRecord("students", studentId);
      studentId = undefined;
    }
  }

  const updated: UserAccount = {
    ...userToUpdate,
    name,
    email,
    role,
    studentId
  };

  await upsertRecord("users", updated);
  const { passwordHash: _ph, ...safeUser } = updated;
  res.json(safeUser);
});

adminRouter.delete("/users/:id", async (req, res) => {
  // If user is a student, delete student record too
  const existingUsers = await listRecords<UserAccount>("users");
  const user = existingUsers.find(u => u.id === req.params.id);
  if (user?.studentId) {
    await deleteRecord("students", user.studentId);
  }
  await deleteRecord("users", req.params.id as string);
  res.status(204).end();
});

// --- Bulk Curriculum Upload ---
const upload = multer({ dest: uploadsRoot });

adminRouter.post("/curriculum/parse-docx", upload.single("docx"), async (req: any, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const curriculum = await parseCurriculumDocx(req.file.path);
    res.json(curriculum);
  } catch (error: any) {
    console.error("Bulk parse error:", error);
    res.status(500).json({ message: error.message });
  }
});

adminRouter.post("/curriculum/save-bulk", async (req: Request, res: Response) => {
  try {
    const { subjects, classId, streamId, bookId } = req.body; // Array of subjects with chapters and topics

    for (const sub of subjects) {
      // Find or create subject
      const allSubjects = await listRecords<any>("subjects");
      let subject = allSubjects.find(s => s.name.toLowerCase() === sub.name.toLowerCase() && s.classId === classId);
      
      if (!subject) {
        subject = { id: `sub-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, name: sub.name, classId, streamId };
        await upsertRecord("subjects", subject);
      }

      for (const chap of sub.chapters) {
        const chapter = { 
          id: `ch-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, 
          name: chap.name, 
          subjectId: subject.id,
          bookId: bookId || undefined
        };
        await upsertRecord("chapters", chapter);

        for (const topName of chap.topics) {
          const topic = { 
            id: `top-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, 
            name: topName, 
            subjectId: subject.id, 
            chapterId: chapter.id,
            bookId: bookId || undefined
          };
          await upsertRecord("topics", topic);
        }
      }
    }
    res.json({ message: "Bulk curriculum imported successfully" });
  } catch (error: any) {
    console.error("Bulk save error:", error);
    res.status(500).json({ message: error.message });
  }
});

adminRouter.post("/questions/:id/verify", async (req: Request, res: Response) => {
  try {
    const q = await getRecord<Question>("questions", req.params.id as string);
    if (!q) return res.status(404).json({ error: "Question not found" });
    q.isVerified = true;
    await upsertRecord("questions", q);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
