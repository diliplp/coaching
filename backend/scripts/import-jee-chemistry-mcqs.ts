import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import { pool, upsertRecord, nextQuestionSerial } from "../src/data/database.js";
import type { Question, SubjectBook, Chapter, Topic, Subject, ClassNode, StreamNode } from "../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PDF_DIR = path.resolve(__dirname, "../../books-papers/11-Chemistry-JEE/11-Chemistry");

const CLASS_11_CHEM_CHAPTERS: Record<number, string> = {
  1: "Some Basic Concepts of Chemistry (Mole Concept)",
  2: "Structure of Atom",
  3: "Classification of Elements & Periodicity in Properties",
  4: "Chemical Bonding & Molecular Structure",
  5: "States of Matter: Gases & Liquids",
  6: "Chemical Thermodynamics",
  7: "Equilibrium (Chemical & Ionic)",
  8: "Redox Reactions",
  9: "Hydrogen",
  10: "s-Block Elements (Alkali & Alkaline Earth Metals)",
  11: "p-Block Elements (Group 13 & 14)",
  12: "Organic Chemistry - Basic Principles & Techniques (GOC)",
  13: "Hydrocarbons (Alkanes, Alkenes, Alkynes, Arenes)",
  14: "Environmental Chemistry"
};

const CLASS_12_CHEM_CHAPTERS: Record<number, string> = {
  1: "Solid State",
  2: "Solutions & Colligative Properties",
  3: "Electrochemistry",
  4: "Chemical Kinetics",
  5: "Surface Chemistry",
  6: "General Principles & Processes of Isolation of Elements (Metallurgy)",
  7: "p-Block Elements (Group 15, 16, 17, 18)",
  8: "d- and f-Block Elements",
  9: "Coordination Compounds",
  10: "Haloalkanes & Haloarenes",
  11: "Alcohols, Phenols & Ethers",
  12: "Aldehydes, Ketones & Carboxylic Acids",
  13: "Amines & Nitrogen Containing Compounds",
  14: "Biomolecules",
  15: "Polymers",
  16: "Chemistry in Everyday Life"
};

async function ensureHierarchy() {
  console.log("Ensuring Class, Stream, Subject, Chapter, Topic hierarchy for Chemistry in DB...");

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
  const subChem11: Subject = { id: "subject-chem-11", name: "Chemistry", classId: "class-11", streamId: "stream-science-11" };
  const subChem12: Subject = { id: "subject-chem", name: "Chemistry", classId: "class-12", streamId: "stream-science" };
  await upsertRecord("subjects", subChem11);
  await upsertRecord("subjects", subChem12);

  const chaptersMap: Record<string, Chapter> = {};
  const topicsMap: Record<string, Topic> = {};

  // Create Chapters & Topics for Class 11
  for (const [chNumStr, chName] of Object.entries(CLASS_11_CHEM_CHAPTERS)) {
    const chNum = parseInt(chNumStr);
    const chId = `chap-11-chem-ch${chNum}`;
    const chapter: Chapter = { id: chId, subjectId: subChem11.id, name: `Ch ${chNum}: ${chName}` };
    await upsertRecord("chapters", chapter);
    chaptersMap[`11_${chNum}`] = chapter;

    const topId = `top-11-chem-ch${chNum}`;
    const topic: Topic = { id: topId, subjectId: subChem11.id, chapterId: chId, name: chName };
    await upsertRecord("topics", topic);
    topicsMap[`11_${chNum}`] = topic;
  }

  // Create Chapters & Topics for Class 12
  for (const [chNumStr, chName] of Object.entries(CLASS_12_CHEM_CHAPTERS)) {
    const chNum = parseInt(chNumStr);
    const chId = `chap-12-chem-ch${chNum}`;
    const chapter: Chapter = { id: chId, subjectId: subChem12.id, name: `Ch ${chNum}: ${chName}` };
    await upsertRecord("chapters", chapter);
    chaptersMap[`12_${chNum}`] = chapter;

    const topId = `top-12-chem-ch${chNum}`;
    const topic: Topic = { id: topId, subjectId: subChem12.id, chapterId: chId, name: chName };
    await upsertRecord("topics", topic);
    topicsMap[`12_${chNum}`] = topic;
  }

  return { subChem11, subChem12, chaptersMap, topicsMap };
}

function parseFileMeta(filename: string): { classLevel: 11 | 12; chapterNum: number } {
  const is12 = /^12-/i.test(filename) || /^12_chem/i.test(filename) || /^12-chem/i.test(filename);
  const classLevel: 11 | 12 = is12 ? 12 : 11;
  let chapterNum = 1;

  // e.g. 11-chem-ch 12-2_solution.pdf, 12-Chem-10-3_solution.pdf, 11-Chem-ch1-1_solution.pdf
  const match = filename.match(/(?:11|12)[-_]*(?:chem|cham)?[-_]*(?:ch)?\s*(\d+)/i);
  if (match) {
    chapterNum = parseInt(match[1]);
  }

  return { classLevel, chapterNum };
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

function stripNullBytes(str: string): string {
  if (!str) return "";
  return str.replace(/\0/g, "").replace(/\\u0000/g, "");
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

  const tagMatches = text.matchAll(/\(([^)]*(?:JEE|MAIN|ADV|NEET|KVPY|GUJCET|AIEEE|IIT|Easy|Medium|Hard|Difficult|Diﬀcult|Advanced)[^)]*)\)/gi);
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
          if (/NEET/i.test(clean)) pyqExamName = "NEET";
          else if (/JEE/i.test(clean)) pyqExamName = /MAIN/i.test(clean) ? "JEE Mains" : "JEE Advanced";
          else if (/IIT/i.test(clean)) pyqExamName = "JEE Advanced";
          else if (/AIEEE/i.test(clean)) pyqExamName = "AIEEE";
        }
      }
    }
  }

  if (defaultTopicName && !tags.includes(defaultTopicName)) {
    tags.push(defaultTopicName);
  }

  return { tags, difficulty, pyqYear, pyqExamName };
}

export function parsePdfQuestions(pdfText: string) {
  const lines = pdfText.split("\n");
  const cleanedLines: string[] = [];

  for (const l of lines) {
    const trimmed = l.trim();
    if (/^Ans\s*\.\s*:?\s*\(?\s*[a-d]\s*\)?\s*$/i.test(trimmed)) continue;
    if (/^\(\s*[a-d]\s*\)\s*so\s+/i.test(trimmed)) continue;
    if (/^Page\s*\d+\s*$/i.test(trimmed)) continue;
    if (/^STD\s*\d+\s*Science/i.test(trimmed) || /^SECTION\s*-\s*A/i.test(trimmed) || /^Chemistry\s*$/i.test(trimmed)) continue;
    cleanedLines.push(l);
  }

  const doc = cleanedLines.join("\n");
  const qMatches = [...doc.matchAll(/(?:^|\n)\s*(\d{1,3})\s*\.\s*/g)];
  const parsedQuestions: any[] = [];

  for (let i = 0; i < qMatches.length; i++) {
    const m = qMatches[i];
    const qNum = parseInt(m[1]);
    const startIdx = m.index!;
    const endIdx = i + 1 < qMatches.length ? qMatches[i + 1].index! : doc.length;
    const block = doc.substring(startIdx, endIdx).trim();

    const optMatch = block.match(/(?:\(\s*A\s*\)|(?<=\s|^)A\s*\))\s*([\s\S]*?)(?:\(\s*B\s*\)|(?<=\s|^)B\s*\))\s*([\s\S]*?)(?:\(\s*C\s*\)|(?<=\s|^)C\s*\))\s*([\s\S]*?)(?:\(\s*D\s*\)|(?<=\s|^)D\s*\))\s*([\s\S]*)/i);

    if (!optMatch) continue;

    let inlinePrompt = block.substring(0, optMatch.index).trim();
    inlinePrompt = inlinePrompt.replace(/^\d{1,3}\s*\.\s*/, "").trim();

    const optA = optMatch[1].trim();
    const optB = optMatch[2].trim();
    const optC = optMatch[3].trim();
    const remainder = optMatch[4].trim();

    // Preamble extraction
    const prevChunk = doc.substring(0, startIdx);
    const tagMatches = [...prevChunk.matchAll(/-\s*\(\s*(?:NEET|JEE|MAIN|ADV|KVPY|GUJCET|AIEEE|Easy|Medium|Hard|Difficult)\s*[^)]*\)/gi)];
    let preamble = "";
    if (tagMatches.length > 0 && (i === 0 || tagMatches[tagMatches.length - 1].index! > qMatches[i - 1].index!)) {
      const lastTag = tagMatches[tagMatches.length - 1];
      const tagIdx = lastTag.index!;
      const preStart = Math.max(0, prevChunk.lastIndexOf("\n\n", tagIdx));
      const rawPre = prevChunk.substring(preStart, tagIdx + lastTag[0].length).trim();

      const preLines: string[] = [];
      for (const pl of rawPre.split("\n")) {
        const pls = pl.trim();
        if (!pls) continue;
        if (/^(?:Sol\s*\.|Ans\s*\.|[M|W|N|n|V|K]\s*=|\d+g|\d+%)/i.test(pls) && !/-\s*\(\s*(?:NEET|JEE|Easy|Medium|Hard|Difficult)/i.test(pls)) continue;
        preLines.push(pls);
      }
      preamble = preLines.join("\n").trim();
    }

    const fullPrompt = (preamble ? preamble + "\n" + inlinePrompt : inlinePrompt).trim();

    // Option D & Solution
    const remainderLines = remainder.split("\n");
    let optDVal = "";
    const solutionLines: string[] = [];
    let capturedOptD = false;

    for (const rl of remainderLines) {
      const rls = rl.trim();
      if (!rls) continue;

      if (!capturedOptD) {
        optDVal = rls;
        capturedOptD = true;
      } else {
        if (/-\s*\(\s*(?:NEET|JEE|MAIN|ADV|Easy|Medium|Hard|Difficult)\s*[^)]*\)/i.test(rls)) break;
        solutionLines.push(rls);
      }
    }

    // Clean up option leakage
    if (optDVal.includes("--- PAGE BREAK ---") || optDVal.includes("Given below")) {
      optDVal = optDVal.split("\n")[0].trim();
    }

    // Answer key
    let correctOptionId = "a";
    const ansMatch = block.match(/Ans\s*\.\s*:?\s*(?:\(\s*([A-D])\s*\)|([a-d]))/i);
    if (ansMatch) {
      correctOptionId = (ansMatch[1] || ansMatch[2]).toLowerCase();
    }

    parsedQuestions.push({
      qNum,
      block,
      prompt: stripNullBytes(fullPrompt) || `Question ${qNum}`,
      optA: stripNullBytes(optA.split("\n")[0].trim()),
      optB: stripNullBytes(optB.split("\n")[0].trim()),
      optC: stripNullBytes(optC.split("\n")[0].trim()),
      optD: stripNullBytes(optDVal.split("\n")[0].trim()),
      correctOptionId,
      solution: stripNullBytes(solutionLines.join("\n").trim())
    });
  }

  return parsedQuestions;
}

async function main() {
  console.log(`Starting import of JEE/NEET Chemistry MCQs from ${PDF_DIR}...`);
  const { subChem11, subChem12, chaptersMap, topicsMap } = await ensureHierarchy();

  if (!fs.existsSync(PDF_DIR)) {
    console.error(`Directory not found: ${PDF_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(PDF_DIR).filter(f => f.endsWith(".pdf")).sort();
  console.log(`Found ${files.length} Chemistry PDF files.`);

  let totalQuestionsImported = 0;

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const fullPath = path.join(PDF_DIR, filename);
    const { classLevel, chapterNum } = parseFileMeta(filename);

    const key = `${classLevel}_${chapterNum}`;
    const subject = classLevel === 11 ? subChem11 : subChem12;
    const topic = topicsMap[key] || (classLevel === 11 ? topicsMap["11_1"] : topicsMap["12_1"]);

    const bookId = `book-jee-chem-${classLevel}-ch${chapterNum}-${i + 1}`;
    const subjectBook: SubjectBook = {
      id: bookId,
      subjectId: subject.id,
      title: `JEE Chemistry Class ${classLevel} - ${filename}`,
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

      const extracted = parsePdfQuestions(pdfText);
      let qCount = 0;

      for (const eq of extracted) {
        const { tags, difficulty, pyqYear, pyqExamName } = parseTagsAndDifficulty(eq.block, topic.name);
        const questionId = `q-jee-chem-${classLevel}-ch${chapterNum}-${i + 1}-q${eq.qNum}-${Date.now().toString(36)}`;
        const serial = await nextQuestionSerial();

        const options = [
          { id: "a", label: "A", value: eq.optA || "Option A" },
          { id: "b", label: "B", value: eq.optB || "Option B" },
          { id: "c", label: "C", value: eq.optC || "Option C" },
          { id: "d", label: "D", value: eq.optD || "Option D" }
        ];

        const question: Question = {
          id: questionId,
          subjectId: subject.id,
          topicId: topic.id,
          type: "single_correct",
          prompt: eq.prompt,
          difficulty,
          marks: 4,
          negativeMarks: 1,
          correctOptionIds: [eq.correctOptionId || "a"],
          options,
          explanation: eq.solution,
          sourceType: "pyq",
          bookId,
          questionNumber: eq.qNum,
          serialNumber: serial,
          isVerified: true,
          tags,
          pyqYear: pyqYear || 2023,
          pyqExamName: pyqExamName || "NEET/JEE"
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

  console.log(`\nChemistry Import Completed! Total ${totalQuestionsImported} questions imported across ${files.length} books.`);
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
