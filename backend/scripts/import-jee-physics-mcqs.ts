import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import { pool, upsertRecord, nextQuestionSerial } from "../src/data/database.js";
import type { Question, SubjectBook, Chapter, Topic, Subject, ClassNode, StreamNode } from "../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PDF_DIR = path.resolve(__dirname, "../../books-papers/JEE-Phyics-MCQ");

const CLASS_11_CHAPTERS: Record<number, string> = {
  1: "Units & Measurements",
  2: "Motion in a Straight Line",
  3: "Motion in a Plane (Vectors & Projectile)",
  4: "Circular Motion",
  5: "Laws of Motion & Friction",
  6: "Work, Energy & Power",
  7: "Centre of Mass & Collisions",
  8: "Rotational Motion & System of Particles",
  9: "Gravitation",
  10: "Mechanical Properties of Solids (Elasticity)",
  11: "Mechanical Properties of Fluids (Fluid Mechanics)",
  12: "Thermal Properties of Matter",
  13: "Thermodynamics",
  14: "Kinetic Theory of Gases",
  15: "Heat Transfer & Calorimetry",
  16: "Thermodynamics & Heat Engine",
  17: "Oscillations (Simple Harmonic Motion)",
  18: "Waves & Sound"
};

const CLASS_12_CHAPTERS: Record<number, string> = {
  1: "Electric Charges & Fields (Electrostatics I)",
  2: "Electrostatic Potential & Capacitance (Electrostatics II)",
  3: "Current Electricity",
  4: "Moving Charges & Magnetism",
  5: "Magnetism & Matter",
  6: "Electromagnetic Induction (EMI)",
  7: "Alternating Current (AC)",
  8: "Electromagnetic Waves (EM Waves)",
  9: "Ray Optics & Optical Instruments",
  10: "Wave Optics",
  11: "Dual Nature of Radiation & Matter",
  12: "Atoms & Atomic Physics",
  13: "Nuclei & Nuclear Physics",
  14: "Semiconductor Electronics & Logic Gates",
  15: "Communication Systems & Wavefronts",
  16: "Astrophysics & Experimental Physics"
};

async function ensureHierarchy() {
  console.log("Ensuring Class, Stream, Subject, Chapter, Topic hierarchy for Physics in DB...");

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
  const subPhy11: Subject = { id: "subject-phy-11", name: "Physics", classId: "class-11", streamId: "stream-science-11" };
  const subPhy12: Subject = { id: "subject-phy", name: "Physics", classId: "class-12", streamId: "stream-science" };
  await upsertRecord("subjects", subPhy11);
  await upsertRecord("subjects", subPhy12);

  const chaptersMap: Record<string, Chapter> = {};
  const topicsMap: Record<string, Topic> = {};

  // Create Chapters & Topics for Class 11
  for (const [chNumStr, chName] of Object.entries(CLASS_11_CHAPTERS)) {
    const chNum = parseInt(chNumStr);
    const chId = `chap-11-phy-ch${chNum}`;
    const chapter: Chapter = { id: chId, subjectId: subPhy11.id, name: `Ch ${chNum}: ${chName}` };
    await upsertRecord("chapters", chapter);
    chaptersMap[`11_${chNum}`] = chapter;

    const topId = `top-11-phy-ch${chNum}`;
    const topic: Topic = { id: topId, subjectId: subPhy11.id, chapterId: chId, name: chName };
    await upsertRecord("topics", topic);
    topicsMap[`11_${chNum}`] = topic;
  }

  // Create Chapters & Topics for Class 12
  for (const [chNumStr, chName] of Object.entries(CLASS_12_CHAPTERS)) {
    const chNum = parseInt(chNumStr);
    const chId = `chap-12-phy-ch${chNum}`;
    const chapter: Chapter = { id: chId, subjectId: subPhy12.id, name: `Ch ${chNum}: ${chName}` };
    await upsertRecord("chapters", chapter);
    chaptersMap[`12_${chNum}`] = chapter;

    const topId = `top-12-phy-ch${chNum}`;
    const topic: Topic = { id: topId, subjectId: subPhy12.id, chapterId: chId, name: chName };
    await upsertRecord("topics", topic);
    topicsMap[`12_${chNum}`] = topic;
  }

  return { subPhy11, subPhy12, chaptersMap, topicsMap };
}

function parseFileMeta(filename: string): { classLevel: 11 | 12; chapterNum: number } {
  const is12 = filename.startsWith("12-");
  const classLevel: 11 | 12 = is12 ? 12 : 11;
  let chapterNum = 1;
  const match = filename.match(/^\d+[-_\s]*PHY[-_\s]*(?:CH[-_\s]*)?(\d+)/i);
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

function cleanTextLineByLine(text: string): string {
  if (!text) return "";
  let lines = text.split("\n");

  if (/\*\s*SECTION\s*-\s*A/i.test(text)) {
    let headerIdx = lines.findIndex(l => /STD\s*\d+\s*Science|Total\s*Marks\s*:|Physics/i.test(l));
    if (headerIdx !== -1) {
      lines = lines.slice(headerIdx + 1);
    }
  }

  lines = lines.filter(l => {
    const trimmed = l.trim();
    if (/^(?:\d+\.\s*)?Ans\s*\.\s*:?\s*\(?\s*[a-d]\s*\)?\s*$/i.test(trimmed)) return false;
    if (/^\(\s*[a-d]\s*\)\s*\.?\s*$/i.test(trimmed)) return false;
    if (/^Ans\s*\.\s*:?\s*$/i.test(trimmed)) return false;
    if (/^Page\s*\d+\s*$/i.test(trimmed)) return false;
    return true;
  });

  let s = lines.join("\n").trim();
  s = s.replace(/\(\s*(?:JEE\s*MAIN|KVPY|IIT|Advanced|Medium|Easy|Difficult|Diﬀcult|\d{4})[^\)]*\)/gi, "").trim();
  s = s.replace(/\s*Ans\s*\.\s*:?\s*\(?\s*[a-d]\s*\)?\s*/gi, " ");
  s = s.replace(/\s*Ans\s*\.\s*:?\s*/gi, " ");
  s = s.replace(/^\d+\s*\.\s*/, "").trim();
  s = s.split("\n").map(l => l.replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n");
  return s.trim();
}

function cleanOptionValue(val: string): string {
  if (!val) return "";
  let lines = val.split("\n");
  lines = lines.filter(l => {
    const trimmed = l.trim();
    if (/^(?:\d+\.\s*)?Ans\s*\.\s*:?\s*\(?\s*[a-d]\s*\)?\s*$/i.test(trimmed)) return false;
    if (/^Ans\s*\.\s*:?\s*$/i.test(trimmed)) return false;
    if (/^Page\s*\d+\s*$/i.test(trimmed)) return false;
    return true;
  });
  let s = lines.join("\n").trim();
  s = s.replace(/\s*Ans\s*\.\s*:?\s*\(?\s*[a-d]\s*\)?\s*/gi, " ");
  s = s.replace(/\s*Ans\s*\.\s*:?\s*/gi, " ");
  s = s.split("\n").map(l => l.replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n");
  return s.trim();
}

function extractPdfText(fullPath: string): string {
  try {
    const pyCmd = "import pypdf, sys; r = pypdf.PdfReader(sys.argv[1]); text = chr(10).join(p.extract_text() or '' for p in r.pages); sys.stdout.buffer.write(text.encode('utf-8', 'ignore'))";
    return execFileSync("python3", ["-c", pyCmd, fullPath], { maxBuffer: 20 * 1024 * 1024, encoding: "utf-8" });
  } catch (err: any) {
    console.warn(`Error extracting ${fullPath}: ${err.message}`);
    return "";
  }
}

async function main() {
  console.log(`Starting import of JEE Physics MCQs from ${PDF_DIR}...`);
  const { subPhy11, subPhy12, chaptersMap, topicsMap } = await ensureHierarchy();

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
    const subject = classLevel === 11 ? subPhy11 : subPhy12;
    const topic = topicsMap[key] || (classLevel === 11 ? topicsMap["11_1"] : topicsMap["12_1"]);

    const bookId = `book-jee-phy-${classLevel}-ch${chapterNum}-${i + 1}`;
    const subjectBook: SubjectBook = {
      id: bookId,
      subjectId: subject.id,
      title: `JEE Physics Class ${classLevel} - ${filename}`,
      fileName: filename,
      fileUrl: `/uploads/books/${filename}`,
      uploadedAt: new Date().toISOString(),
      bookType: "pyq",
      extractionStatus: "done",
      extractedAt: new Date().toISOString()
    };

    await upsertRecord("subjectBooks", subjectBook);

    try {
      const pdfText = extractPdfText(fullPath);
      if (!pdfText) continue;

      // Extract question blocks
      const questionBlocks = pdfText.split(/(?=\n\s*\d{1,3}\.\s+[A-Za-z(])/g).filter(b => b.trim().length > 30);

      let qCount = 0;
      for (const block of questionBlocks) {
        const numMatch = block.match(/^\s*(\d{1,3})\.\s+/);
        const qNum = numMatch ? parseInt(numMatch[1]) : qCount + 1;

        // Parse options (A), (B), (C), (D) or A), B), C), D)
        const optMatches = [...block.matchAll(/(?:\(([A-D])\)|(?<=\s|^)([A-D])\))\s*([^(\n]+(?:\n[^(\n]+)*)/g)];
        const options = ["A", "B", "C", "D"].map(label => {
          const found = optMatches.find(m => (m[1] || m[2]) === label);
          const rawVal = found ? found[3].trim() : `Option ${label}`;
          const cleanedVal = cleanOptionValue(rawVal) || rawVal;
          return {
            id: label.toLowerCase(),
            label,
            value: cleanedVal
          };
        });

        // Parse answer marker e.g. Ans . : ( B ) or Ans . : a
        let correctOptionId = "a";
        const ansMatch = block.match(/Ans\s*\.\s*:\s*(?:\(\s*([A-D])\s*\)|([a-d]))/i);
        if (ansMatch) {
          correctOptionId = (ansMatch[1] || ansMatch[2]).toLowerCase();
        }

        const { tags, difficulty, pyqYear, pyqExamName } = parseTagsAndDifficulty(block, topic.name);

        const rawPrompt = block.split(/(?:\([A-D]\)|[A-D]\))/)[0].trim().substring(0, 1500) || `Question ${qNum}`;
        const promptText = cleanTextLineByLine(rawPrompt) || rawPrompt;

        const questionId = `q-jee-phy-${classLevel}-ch${chapterNum}-${i + 1}-q${qNum}-${Date.now().toString(36)}`;
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
          explanation: block.includes("Sol .") ? cleanTextLineByLine(block.split("Sol .")[1].trim().substring(0, 1500)) : "",
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

  console.log(`\nPhysics Import Completed! Total ${totalQuestionsImported} questions imported across ${files.length} books.`);
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
