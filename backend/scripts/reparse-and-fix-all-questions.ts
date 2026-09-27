import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import { pool, upsertRecord } from "../src/data/database.js";
import type { Question } from "../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PDF_DIR = path.resolve(__dirname, "../../books-papers/JEE-Phyics-MCQ");

function extractPdfText(fullPath: string): string {
  try {
    const pyCmd = "import pypdf, sys; r = pypdf.PdfReader(sys.argv[1]); text = chr(10).join(p.extract_text() or '' for p in r.pages); sys.stdout.buffer.write(text.encode('utf-8', 'ignore'))";
    return execFileSync("python3", ["-c", pyCmd, fullPath], { maxBuffer: 20 * 1024 * 1024, encoding: "utf-8" });
  } catch (err: any) {
    console.warn(`Error extracting ${fullPath}: ${err.message}`);
    return "";
  }
}

export function parsePdfQuestions(pdfText: string) {
  const lines = pdfText.split("\n");
  const cleanedLines: string[] = [];

  for (const l of lines) {
    const trimmed = l.trim();
    if (/^Ans\s*\.\s*:?\s*\(?\s*[a-d]\s*\)?\s*$/i.test(trimmed)) continue;
    if (/^\(\s*[a-d]\s*\)\s*so\s+/i.test(trimmed)) continue;
    if (/^Page\s*\d+\s*$/i.test(trimmed)) continue;
    if (/^STD\s*\d+\s*Science/i.test(trimmed) || /^SECTION\s*-\s*A/i.test(trimmed) || /^Physics\s*$/i.test(trimmed)) continue;
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

    // Match explicit options (A), (B), (C), (D) or A), B), C), D)
    const optMatch = block.match(/(?:\(\s*A\s*\)|(?<=\s|^)A\s*\))\s*([\s\S]*?)(?:\(\s*B\s*\)|(?<=\s|^)B\s*\))\s*([\s\S]*?)(?:\(\s*C\s*\)|(?<=\s|^)C\s*\))\s*([\s\S]*?)(?:\(\s*D\s*\)|(?<=\s|^)D\s*\))\s*([\s\S]*)/i);

    if (!optMatch) continue;

    let inlinePrompt = block.substring(0, optMatch.index).trim();
    inlinePrompt = inlinePrompt.replace(/^\d{1,3}\s*\.\s*/, "").trim();

    const optA = optMatch[1].trim();
    const optB = optMatch[2].trim();
    const optC = optMatch[3].trim();
    const remainder = optMatch[4].trim();

    // Preamble extraction from text before question number
    const prevChunk = doc.substring(0, startIdx);
    const tagMatches = [...prevChunk.matchAll(/-\s*\(\s*(?:Easy|Medium|Hard|Difficult|Advanced|JEE|KVPY|GUJCET|AIEEE)\s*\)/gi)];
    let preamble = "";
    if (tagMatches.length > 0 && (i === 0 || tagMatches[tagMatches.length - 1].index! > qMatches[i - 1].index!)) {
      const lastTag = tagMatches[tagMatches.length - 1];
      const tagIdx = lastTag.index!;
      // Find start of preamble text (after previous solution math lines)
      const preStart = Math.max(0, prevChunk.lastIndexOf("\n\n", tagIdx));
      const rawPre = prevChunk.substring(preStart, tagIdx + lastTag[0].length).trim();
      
      const preLines: string[] = [];
      for (const pl of rawPre.split("\n")) {
        const pls = pl.trim();
        if (!pls) continue;
        if (reMatchSolutionLine(pls) && !/-\s*\(\s*(?:Easy|Medium|Hard|Difficult)/i.test(pls)) continue;
        preLines.push(pls);
      }
      preamble = preLines.join("\n").trim();
    }

    const fullPrompt = (preamble ? preamble + "\n" + inlinePrompt : inlinePrompt).trim();

    // Clean Option D & Solution
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
        if (/-\s*\(\s*(?:Easy|Medium|Hard|Difficult|Advanced)\s*\)/i.test(rls)) break;
        solutionLines.push(rls);
      }
    }

    // Clean up option leakage if option D value captured next question preamble
    if (optDVal.includes("--- PAGE BREAK ---") || optDVal.includes("Given below") || optDVal.includes("Assertion")) {
      const firstLine = optDVal.split("\n")[0].trim();
      optDVal = firstLine;
    }

    // Answer Key parsing
    let correctOptionId = "a";
    const ansMatch = block.match(/Ans\s*\.\s*:?\s*(?:\(\s*([A-D])\s*\)|([a-d]))/i);
    if (ansMatch) {
      correctOptionId = (ansMatch[1] || ansMatch[2]).toLowerCase();
    }

    parsedQuestions.push({
      qNum,
      prompt: fullPrompt || `Question ${qNum}`,
      optA: cleanVal(optA),
      optB: cleanVal(optB),
      optC: cleanVal(optC),
      optD: cleanVal(optDVal),
      correctOptionId,
      solution: solutionLines.join("\n").trim()
    });
  }

  return parsedQuestions;
}

function reMatchSolutionLine(line: string): boolean {
  return /^(?:Sol\s*\.|Ans\s*\.|[I|P|V|R|F|E|Z|K|Q]\s*=|∴|∵|⇒|\d+%\s*$)/i.test(line);
}

function stripNullBytes(str: string): string {
  if (!str) return "";
  return str.replace(/\0/g, "").replace(/\\u0000/g, "");
}

function cleanVal(val: string): string {
  if (!val) return "";
  let s = val.split("\n")[0].trim();
  s = s.replace(/--- PAGE BREAK ---/g, "").trim();
  s = s.replace(/\s*Ans\s*\.\s*:?\s*\(?\s*[a-d]\s*\)?\s*/gi, "").trim();
  return stripNullBytes(s);
}

async function reparseAndFixAll() {
  console.log("Starting Reparse and Fix for all Physics questions...");

  const files = fs.readdirSync(PDF_DIR).filter(f => f.endsWith(".pdf")).sort();
  console.log(`Processing ${files.length} Physics PDF files...`);

  let updatedCount = 0;

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const fullPath = path.join(PDF_DIR, filename);

    // Get matching book record or file questions in DB
    const { rows } = await pool.query(
      "SELECT id, data FROM app_records WHERE collection='questions' AND data->>'bookId' LIKE $1",
      [`%ch%-${i + 1}`]
    );

    if (rows.length === 0) continue;

    const pdfText = extractPdfText(fullPath);
    if (!pdfText) continue;

    const extracted = parsePdfQuestions(pdfText);
    const extractedByNum: Record<number, any> = {};
    for (const eq of extracted) {
      extractedByNum[eq.qNum] = eq;
    }

    let fileUpdated = 0;
    for (const r of rows) {
      const q = r.data as Question;
      const qNum = q.questionNumber || 0;
      const eq = extractedByNum[qNum];

      if (eq) {
        let changed = false;
        
        // Check prompt
        if (eq.prompt && eq.prompt.length > (q.prompt || "").length) {
          q.prompt = stripNullBytes(eq.prompt);
          changed = true;
        }

        // Check options
        if (q.options && q.options.length === 4) {
          if (eq.optA && q.options[0].value !== eq.optA) { q.options[0].value = cleanVal(eq.optA); changed = true; }
          if (eq.optB && q.options[1].value !== eq.optB) { q.options[1].value = cleanVal(eq.optB); changed = true; }
          if (eq.optC && q.options[2].value !== eq.optC) { q.options[2].value = cleanVal(eq.optC); changed = true; }
          if (eq.optD && q.options[3].value !== eq.optD) { q.options[3].value = cleanVal(eq.optD); changed = true; }
        }

        // Check solution
        if (eq.solution && !q.explanation) {
          q.explanation = stripNullBytes(eq.solution);
          changed = true;
        }

        if (changed) {
          await upsertRecord("questions", q);
          fileUpdated++;
          updatedCount++;
        }
      }
    }

    if (fileUpdated > 0) {
      console.log(`[${i + 1}/${files.length}] Updated ${fileUpdated} questions for ${filename}`);
    }
  }

  console.log(`\nReparse Completed! Total ${updatedCount} questions updated and cleaned.`);
  await pool.end();
}

reparseAndFixAll().catch(err => {
  console.error(err);
  process.exit(1);
});
