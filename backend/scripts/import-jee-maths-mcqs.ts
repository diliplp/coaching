import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { pool, upsertRecord, nextQuestionSerial } from "../src/data/database.js";
import type { Question, SubjectBook, Chapter, Topic, Subject, ClassNode, StreamNode } from "../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PDF_DIR = path.resolve(__dirname, "../../books-papers/JEE-Maths-MCQs");

const CLASS_11_CHAPTERS: Record<number, string> = {
  1: "Sets, Relations & Functions",
  2: "Trigonometric Functions",
  3: "Complex Numbers & Quadratic Equations",
  4: "Linear Inequalities & Mathematical Induction",
  5: "Permutations & Combinations",
  6: "Binomial Theorem",
  7: "Sequences & Series",
  8: "Straight Lines",
  9: "Conic Sections (Circle, Parabola, Ellipse, Hyperbola)",
  10: "Three Dimensional Geometry (3D)",
  11: "Limits & Derivatives",
  12: "Mathematical Reasoning",
  13: "Statistics",
  14: "Probability",
  15: "Mathematical Induction",
  18: "Permutations and Combinations",
  19: "Sequences and Series"
};

const CLASS_12_CHAPTERS: Record<number, string> = {
  1: "Relations & Functions & Inverse Trig",
  2: "Inverse Trigonometric Functions",
  3: "Matrices & Determinants",
  5: "Continuity & Differentiability",
  6: "Applications of Derivatives",
  7: "Integrals (Indefinite & Definite)",
  8: "Applications of Integrals",
  9: "Differential Equations",
  10: "Vector Algebra",
  11: "Three Dimensional Geometry (3D)",
  12: "Linear Programming",
  13: "Probability"
};

async function ensureHierarchy() {
  console.log("Ensuring Class, Stream, Subject, Chapter, Topic hierarchy in DB...");

  // Classes
  const class11: ClassNode = { id: "class-11", name: "11th" };
  const class12: ClassNode = { id: "class-12", name: "12th" };
  await upsertRecord("classes", class11);
  await upsertRecord("classes", class12);

  // Streams
  const streamSci11: StreamNode = { id: "stream-science-11", name: "Science (JEE/NEET)", classId: "class-11" };
  const streamSci12: StreamNode = { id: "stream-science", name: "Science", classId: "class-12" };
  await upsertRecord("streams", streamSci11);
  await upsertRecord("streams", streamSci12);

  // Subjects
  const subMath11: Subject = { id: "subject-math-11", name: "Mathematics", classId: "class-11", streamId: "stream-science-11" };
  const subMath12: Subject = { id: "subject-math", name: "Mathematics", classId: "class-12", streamId: "stream-science" };
  await upsertRecord("subjects", subMath11);
  await upsertRecord("subjects", subMath12);

  const chaptersMap: Record<string, Chapter> = {};
  const topicsMap: Record<string, Topic> = {};

  // Create Chapters & Topics for Class 11
  for (const [chNumStr, chName] of Object.entries(CLASS_11_CHAPTERS)) {
    const chNum = parseInt(chNumStr);
    const chId = `chap-11-math-ch${chNum}`;
    const chapter: Chapter = { id: chId, subjectId: subMath11.id, name: `Ch ${chNum}: ${chName}` };
    await upsertRecord("chapters", chapter);
    chaptersMap[`11_${chNum}`] = chapter;

    const topId = `top-11-math-ch${chNum}`;
    const topic: Topic = { id: topId, subjectId: subMath11.id, chapterId: chId, name: chName };
    await upsertRecord("topics", topic);
    topicsMap[`11_${chNum}`] = topic;
  }

  // Create Chapters & Topics for Class 12
  for (const [chNumStr, chName] of Object.entries(CLASS_12_CHAPTERS)) {
    const chNum = parseInt(chNumStr);
    const chId = `chap-12-math-ch${chNum}`;
    const chapter: Chapter = { id: chId, subjectId: subMath12.id, name: `Ch ${chNum}: ${chName}` };
    await upsertRecord("chapters", chapter);
    chaptersMap[`12_${chNum}`] = chapter;

    const topId = `top-12-math-ch${chNum}`;
    const topic: Topic = { id: topId, subjectId: subMath12.id, chapterId: chId, name: chName };
    await upsertRecord("topics", topic);
    topicsMap[`12_${chNum}`] = topic;
  }

  return { subMath11, subMath12, chaptersMap, topicsMap };
}

function parseFileMeta(filename: string): { classLevel: 11 | 12; chapterNum: number } {
  const f = filename.toLowerCase();
  let classLevel: 11 | 12 = 11;
  let chapterNum = 1;

  if (f.startsWith("12-")) {
    classLevel = 12;
  } else {
    classLevel = 11;
  }

  const match = f.match(/ch(?:apter)?[-_\s]*(\d+)/i);
  if (match) {
    chapterNum = parseInt(match[1]);
  }

  return { classLevel, chapterNum };
}

function parseTagsAndDifficulty(text: string, defaultTopicName: string): {
  tags: string[];
  difficulty: "easy" | "medium" | "hard";
  pyqYear?: number;
  pyqExamName?: string;
} {
  const tags: string[] = [];
  let difficulty: "easy" | "medium" | "hard" = "medium";
  let pyqYear: number | undefined;
  let pyqExamName: string | undefined;

  const tagMatches = text.matchAll(/\(([^)]*(?:JEE|MAIN|ADV|KVPY|GUJCET|NEET|AIEEE|IIT|Easy|Medium|Hard|Difficult|Diﬀcult|Advanced)[^)]*)\)/gi);
  for (const tm of tagMatches) {
    const parts = tm[1].split(",").map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      let clean = part.replace(/\s+/g, " ");
      clean = clean.replace(/diﬀcult/i, "Difficult").replace(/diffcult/i, "Difficult");

      if (/^easy$/i.test(clean)) {
        difficulty = "easy";
        if (!tags.includes("Easy")) tags.push("Easy");
      } else if (/^medium$/i.test(clean)) {
        difficulty = "medium";
        if (!tags.includes("Medium")) tags.push("Medium");
      } else if (/^(hard|difficult|advanced)$/i.test(clean)) {
        difficulty = "hard";
        const cap = clean.charAt(0).toUpperCase() + clean.slice(1);
        if (!tags.includes(cap)) tags.push(cap);
      } else {
        if (/\b(easy)\b/i.test(clean)) difficulty = "easy";
        if (/\b(medium)\b/i.test(clean)) difficulty = "medium";
        if (/\b(hard|difficult|advanced)\b/i.test(clean)) difficulty = "hard";
        if (!tags.includes(clean)) tags.push(clean);

        const ym = clean.match(/(19\d{2}|20\d{2})/);
        if (ym && !pyqYear) pyqYear = parseInt(ym[1]);

        if (!pyqExamName) {
          if (/JEE/i.test(clean)) pyqExamName = /MAIN/i.test(clean) ? "JEE Mains" : "JEE Advanced";
          else if (/IIT/i.test(clean)) pyqExamName = "JEE Advanced";
          else if (/AIEEE/i.test(clean)) pyqExamName = "AIEEE";
          else if (/KVPY/i.test(clean)) pyqExamName = "KVPY";
        }
      }
    }
  }

  if (defaultTopicName && !tags.includes(defaultTopicName)) {
    tags.push(defaultTopicName);
  }

  return { tags, difficulty, pyqYear, pyqExamName };
}

async function main() {
  console.log(`Starting import of JEE Maths MCQs from ${PDF_DIR}...`);
  const { subMath11, subMath12, chaptersMap, topicsMap } = await ensureHierarchy();

  if (!fs.existsSync(PDF_DIR)) {
    console.error(`Directory not found: ${PDF_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(PDF_DIR).filter(f => f.endsWith(".pdf")).sort();
  console.log(`Found ${files.length} PDF files.`);

  let totalQuestionsImported = 0;

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const fullPath = path.join(PDF_DIR, filename);
    const { classLevel, chapterNum } = parseFileMeta(filename);

    const key = `${classLevel}_${chapterNum}`;
    const subject = classLevel === 11 ? subMath11 : subMath12;
    const topic = topicsMap[key] || (classLevel === 11 ? topicsMap["11_1"] : topicsMap["12_1"]);

    const bookId = `book-jee-maths-${classLevel}-ch${chapterNum}-${i + 1}`;
    const subjectBook: SubjectBook = {
      id: bookId,
      subjectId: subject.id,
      title: `JEE Maths Class ${classLevel} - ${filename}`,
      fileName: filename,
      fileUrl: `/uploads/books/${filename}`,
      uploadedAt: new Date().toISOString(),
      bookType: "pyq",
      extractionStatus: "done",
      extractedAt: new Date().toISOString()
    };

    await upsertRecord("subjectBooks", subjectBook);

    try {
      const pyCmd = `python3 -c "import pypdf; r = pypdf.PdfReader('${fullPath}'); print('\\n'.join(p.extract_text() for p in r.pages))"`;
      const pdfText = execSync(pyCmd, { maxBuffer: 15 * 1024 * 1024, encoding: "utf-8" });

      // Split text into question blocks by "1.", "2.", "3.", etc. or "Ans ."
      const questionBlocks = pdfText.split(/(?=\b\d{1,3}\.\s+[A-Za-z(])/g).filter(b => b.trim().length > 30);

      let qCount = 0;
      for (const block of questionBlocks) {
        const numMatch = block.match(/^\s*(\d{1,3})\.\s+/);
        const qNum = numMatch ? parseInt(numMatch[1]) : qCount + 1;

        // Parse options (A), (B), (C), (D)
        const optMatches = [...block.matchAll(/\(([A-D])\)\s*([^(\n]+(?:\n[^(\n]+)*)/g)];
        const options = ["A", "B", "C", "D"].map(label => {
          const found = optMatches.find(m => m[1] === label);
          return {
            id: label.toLowerCase(),
            label,
            value: found ? found[2].trim() : `Option ${label}`
          };
        });

        // Parse answer marker if present e.g. Ans . : ( B ) or Ans . : a
        let correctOptionId = "a";
        const ansMatch = block.match(/Ans\s*\.\s*:\s*(?:\(\s*([A-D])\s*\)|([a-d]))/i);
        if (ansMatch) {
          correctOptionId = (ansMatch[1] || ansMatch[2]).toLowerCase();
        }

        const { tags, difficulty, pyqYear, pyqExamName } = parseTagsAndDifficulty(block, topic.name);

        const promptText = block.split(/\(([A-D])\)/)[0].trim().substring(0, 1500) || `Question ${qNum}`;

        const questionId = `q-jee-math-${classLevel}-ch${chapterNum}-${i + 1}-q${qNum}-${Date.now().toString(36)}`;
        const serial = await nextQuestionSerial();

        const question: Question = {
          id: questionId,
          subjectId: subject.id,
          topicId: topic.id,
          type: "single_correct",
          prompt: promptText,
          difficulty,
          marks: 4,
          negativeMarks: 1,
          correctOptionIds: [correctOptionId],
          options,
          explanation: block.includes("Sol .") ? block.split("Sol .")[1].trim().substring(0, 1500) : "",
          sourceType: "pyq",
          bookId,
          questionNumber: qNum,
          serialNumber: serial,
          isVerified: true,
          tags,
          pyqYear: pyqYear || 2023,
          pyqExamName: pyqExamName || "JEE Mains"
        };

        await upsertRecord("questions", question);
        qCount++;
        totalQuestionsImported++;
      }

      console.log(`[${i + 1}/${files.length}] Imported ${qCount} questions from ${filename}`);
    } catch (err: any) {
      console.warn(`[${i + 1}/${files.length}] Warning processing ${filename}: ${err.message}`);
    }
  }

  console.log(`\nImport completed! Total ${totalQuestionsImported} questions imported across ${files.length} books.`);
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
