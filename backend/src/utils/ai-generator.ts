import { GoogleGenAI } from "@google/genai";
import { Question, QuestionOption, QuestionType, QuestionSource } from "../types.js";
import { listRecords } from "../data/database.js";
import crypto from "node:crypto";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const RENDER_PAGE_SCRIPT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "../../scripts/render_page.py");

/** Renders a single PDF page (0-based index) to a base64 PNG using PyMuPDF. */
function renderPageToBase64(pdfPath: string, pageIndex: number): string | null {
  const pythonPath = process.env.PDF_PYTHON_PATH || "python";
  try {
    const result = spawnSync(pythonPath, [RENDER_PAGE_SCRIPT, pdfPath, String(pageIndex)], {
      timeout: 30000,
      maxBuffer: 20 * 1024 * 1024  // 20 MB — enough for a high-res page
    });
    if (result.status !== 0) return null;
    const payload = JSON.parse(result.stdout.toString());
    if (payload.error || !payload.base64) return null;
    return payload.base64 as string;
  } catch {
    return null;
  }
}

async function generateVisionContent(textPrompt: string, imageBase64: string): Promise<string | null> {
  // OpenRouter vision models — tried in order
  const orVisionModels = [
    process.env.OPENROUTER_MODEL || "meta-llama/llama-3.2-90b-vision-instruct:free",
    "meta-llama/llama-3.2-90b-vision-instruct:free",
    "qwen/qwen2.5-vl-72b-instruct:free",
    "openai/gpt-4o-mini",
  ].filter((v, i, a) => a.indexOf(v) === i);

  if (process.env.OPENROUTER_API_KEY) {
    for (const model of orVisionModels) {
      try {
        console.log(`[Vision] Trying OpenRouter ${model}...`);
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://railway.app",
            "X-Title": "Coaching Portal Exam Gen"
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: [
              { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}`, detail: "high" } },
              { type: "text", text: textPrompt }
            ]}],
            response_format: { type: "json_object" },
            max_tokens: 8000
          })
        });
        if (response.ok) {
          const data = await response.json();
          const text = data.choices?.[0]?.message?.content;
          if (text) { console.log(`[Vision] OpenRouter ${model} succeeded.`); return text; }
        } else {
          console.warn(`[Vision] ${model} failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
        }
      } catch (e: any) {
        console.warn(`[Vision] ${model} threw:`, e.message);
      }
    }
  }

  // Gemini fallback
  const clients = getGeminiClients();
  for (const { client, name } of clients) {
    try {
      console.log(`[Vision] Gemini ${name} fallback...`);
      const result = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ parts: [
          { inlineData: { mimeType: "image/png", data: imageBase64 } },
          { text: textPrompt }
        ]}],
        config: { responseMimeType: "application/json", maxOutputTokens: 8192 }
      });
      const text = result.text;
      if (text) { console.log(`[Vision] Gemini ${name} fallback succeeded.`); return text; }
    } catch (e: any) {
      console.warn(`[Vision] Gemini ${name} fallback failed:`, e?.message ?? e);
    }
  }

  console.warn("[Vision] All vision attempts exhausted — page will use text-only extraction.");
  return null;
}

function repairJsonString(raw: string): string {
  const CONTROL_ESCAPES: Record<number, string> = {
    8: '\\b', 9: '\\t', 10: '\\n', 12: '\\f', 13: '\\r'
  };

  let inString = false;
  let result = "";
  let i = 0;

  while (i < raw.length) {
    const char = raw[i];
    const code = char.charCodeAt(0);

    if (char === '"') {
      // Count preceding backslashes to determine if this quote is escaped
      let backslashCount = 0;
      let j = i - 1;
      while (j >= 0 && raw[j] === '\\') { backslashCount++; j--; }
      if (backslashCount % 2 === 0) inString = !inString;
      result += char;
      i++;
    } else if (inString && char === '\\') {
      const nextChar = raw[i + 1] || "";

      // \n is the only control escape we keep — it's genuinely used for newlines in question text.
      // \b, \f, \r, \t are NEVER intentional in MCQ text — they're almost always LaTeX command
      // prefixes written with only one backslash (\begin, \frac, \right, \text).
      // Doubling the backslash makes JSON.parse produce the correct single \ for KaTeX.
      const keepAsJsonEscape =
        nextChar === '"' || nextChar === '\\' || nextChar === '/' || nextChar === 'n' ||
        (nextChar === 'u' && /^[0-9a-fA-F]{4}$/.test(raw.substring(i + 2, i + 6)));

      if (keepAsJsonEscape) {
        result += char + nextChar;
        i += 2;
      } else {
        // Stray backslash (including LaTeX \text, \frac, \begin, \right) — double it
        result += '\\\\';
        i++;
      }
    } else if (inString && code < 0x20) {
      // Literal control character inside a JSON string — must be escaped
      result += CONTROL_ESCAPES[code] ?? `\\u${code.toString(16).padStart(4, '0')}`;
      i++;
    } else {
      result += char;
      i++;
    }
  }

  // Remove trailing commas before ] or } (common in AI-generated JSON)
  return result.replace(/,\s*([\]}])/g, '$1');
}

/**
 * Last-resort fallback: extract individual question objects from broken/truncated JSON.
 * Locates the "questions" array then walks it extracting each balanced {...} object
 * independently, so one corrupt question doesn't block the rest.
 */
function extractQuestionsFromBrokenJson(raw: string): any[] {
  const questions: any[] = [];

  // Find the opening bracket of the questions array
  const qKeyIdx = raw.indexOf('"questions"');
  const arrayStart = qKeyIdx !== -1
    ? raw.indexOf('[', qKeyIdx)
    : raw.indexOf('[');
  if (arrayStart === -1) return questions;

  let depth = 0;
  let objStart = -1;
  let inString = false;
  let escape = false;

  for (let i = arrayStart + 1; i < raw.length; i++) {
    const c = raw[i];

    // Track escape sequences so \" inside strings don't toggle inString
    if (escape) { escape = false; continue; }
    if (c === '\\' && inString) { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (c === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && objStart !== -1) {
        const fragment = raw.substring(objStart, i + 1);
        try {
          const obj = JSON.parse(repairJsonString(fragment));
          if (obj.prompt || obj.options) questions.push(obj);
        } catch { /* this individual question is too corrupt to recover */ }
        objStart = -1;
      }
    } else if (c === ']' && depth === 0) {
      break; // end of questions array
    }
  }

  return questions;
}

function makeGeminiClient(apiKey: string) {
  return new GoogleGenAI({ apiKey });
}

/** Returns list of configured Gemini clients (primary key first, backup second). */
function getGeminiClients(): Array<{ client: GoogleGenAI; name: string }> {
  return [
    { key: process.env.GEMINI_API_KEY, name: "Primary" },
    { key: process.env.GEMINI_API_KEY_BACKUP, name: "Backup" },
  ]
    .filter(k => !!k.key)
    .map(k => ({ client: makeGeminiClient(k.key!), name: k.name }));
}

/** Text generation: OpenRouter primary, Gemini fallback. */
async function generateContentWithFallback(prompt: string, fallbackJson: string = "{}"): Promise<string> {
  // OpenRouter text models — tried in order
  if (process.env.OPENROUTER_API_KEY) {
    const models = [
      process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
      "deepseek/deepseek-chat:free",
      "meta-llama/llama-3-8b-instruct:free",
    ].filter((v, i, a) => a.indexOf(v) === i);

    for (const model of models) {
      try {
        console.log(`[OpenRouter] Trying ${model}...`);
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://railway.app",
            "X-Title": "Coaching Portal Exam Gen"
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            max_tokens: 8000
          })
        });
        if (response.ok) {
          const data = await response.json();
          const text = data.choices?.[0]?.message?.content;
          if (text) { console.log(`[OpenRouter] ${model} succeeded.`); return text; }
        } else {
          console.warn(`[OpenRouter] ${model} failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
        }
      } catch (e: any) {
        console.warn(`[OpenRouter] ${model} threw:`, e.message);
      }
    }
  }

  // Gemini fallback
  const clients = getGeminiClients();
  for (const { client, name } of clients) {
    try {
      console.log(`[Gemini] ${name} fallback...`);
      const result = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      const text = result.text;
      if (text) return text;
    } catch (e: any) {
      console.warn(`[Gemini] ${name} fallback failed:`, e?.message ?? e);
    }
  }

  throw new Error("All AI providers failed. Check OPENROUTER_API_KEY in .env");
}

function findChapterStart(text: string, chapterName: string): number {
  const lower = text.toLowerCase();
  const nameLower = chapterName.toLowerCase().trim();

  // Strategy 1: exact "chapter N: <name>" or "chapter: <name>" heading
  const chapterHeadingRegex = new RegExp(`chapter[^\\n]{0,20}${nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
  const headingMatch = chapterHeadingRegex.exec(text);
  if (headingMatch) return headingMatch.index;

  // Strategy 2: chapter name appears as a standalone line (likely a heading)
  const escapedName = nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const standaloneRegex = new RegExp(`(^|\\n)\\s*${escapedName}\\s*($|\\n)`, 'i');
  const standaloneMatch = standaloneRegex.exec(text);
  if (standaloneMatch) return standaloneMatch.index;

  // Strategy 3: simple substring match (case insensitive)
  const idx = lower.indexOf(nameLower);
  return idx;
}

/**
 * Vision extraction via Gemini SDK (primary) — retries on 429 instead of falling back
 * to a lower-quality model.
 */

export async function generateQuestionsFromText(params: {
  text: string;
  topicId: string;
  subjectId: string;
  subject?: string;
  questionCount?: number;
  chapterName?: string;
  topicNames?: string[];
}): Promise<Question[]> {
  const { text, topicId, subjectId, subject, questionCount = 5, chapterName, topicNames } = params;

  if (!process.env.GEMINI_API_KEY && !process.env.OPENROUTER_API_KEY) {
    throw new Error("Neither GEMINI_API_KEY nor OPENROUTER_API_KEY is configured.");
  }

  const chemKeywords = ["chemistry", "molecule", "reaction", "bond", "acid", "organic", "compound", "structure", "formula", "chemical"];
  const isChemistry = subject?.toLowerCase().includes("chemistry") || chemKeywords.some(k => text.toLowerCase().includes(k));

  // Fetch existing questions for this topic to avoid duplication
  const allQuestionsInDb = await listRecords<Question>("questions");
  const existingTopicQuestions = allQuestionsInDb.filter(q => q.topicId === topicId);
  
  const verifiedExamples = existingTopicQuestions
    .filter(q => q.isVerified)
    .slice(0, 3)
    .map(q => ({
      prompt: q.prompt,
      difficulty: q.difficulty,
      marks: q.marks,
      options: q.options.map(o => ({
        label: o.label,
        value: o.value,
        isCorrect: q.correctOptionIds.includes(o.id)
      })),
      explanation: q.explanation
    }));

  const exampleInstruction = verifiedExamples.length > 0
    ? `\nHere are some examples of high-quality questions for this topic. Follow their style and formatting:\n${JSON.stringify(verifiedExamples, null, 2)}\n`
    : "";

  const allQuestions: Question[] = [];
  let attempts = 0;
  const maxAttempts = 3; // Retry up to 3 rounds of generations to fill gap of rejected questions

  while (allQuestions.length < questionCount && attempts < maxAttempts) {
    attempts++;
    const needed = questionCount - allQuestions.length;
    const batchSize = 10;
    const numBatches = Math.ceil(needed / batchSize);

    console.log(`Generation round ${attempts}: Need ${needed} questions. Launching ${numBatches} parallel batches.`);

    const batchPromises = Array.from({ length: numBatches }).map(async (_, batchIndex) => {
      const currentBatchCount = batchIndex === numBatches - 1
        ? needed - batchIndex * batchSize
        : batchSize;

      if (currentBatchCount <= 0) return [];

      const allKnownPrompts = [...existingTopicQuestions.map(q => q.prompt), ...allQuestions.map(q => q.prompt)];
      const shuffledPrompts = allKnownPrompts.sort(() => 0.5 - Math.random());
      const previousPrompts = shuffledPrompts.slice(0, 40).join("\n- ");
      
      const avoidanceInstruction = allKnownPrompts.length > 0 
        ? `\nIMPORTANT: Do NOT repeat, rephrase, or generate questions similar to these existing ones:\n- ${previousPrompts}\n\nGenerate COMPLETELY NEW and UNIQUE questions that cover different concepts or use different values.` 
        : "";

      const maxChunkSize = 30000;
      let textChunk = text;
      if (chapterName) {
        // Find where this chapter starts in the book text
        const chapterStart = findChapterStart(text, chapterName);
        if (chapterStart !== -1) {
          console.log(`[Generate] Found chapter "${chapterName}" at position ${chapterStart} in book text`);
          textChunk = text.substring(chapterStart, chapterStart + maxChunkSize);
        } else if (text.length > maxChunkSize) {
          // Chapter not found by name — fall back to random chunk
          const maxStart = text.length - maxChunkSize;
          const startIdx = Math.floor(Math.random() * maxStart);
          textChunk = text.substring(startIdx, startIdx + maxChunkSize);
        }
      } else if (text.length > maxChunkSize) {
        const maxStart = text.length - maxChunkSize;
        const startIdx = Math.floor(Math.random() * maxStart);
        textChunk = text.substring(startIdx, startIdx + maxChunkSize);
      }

      const chapterFocusInstruction = chapterName
        ? `\nFOCUS: Generate questions EXCLUSIVELY about the chapter "${chapterName}"${topicNames?.length ? `, covering these topics: ${topicNames.join(', ')}` : ''}. Do NOT generate questions about any other chapter or unrelated content.\n`
        : "";

      const prompt = `
You are an expert educator creating exam questions from a textbook. Generate exactly ${currentBatchCount} NEW multiple-choice questions from the textbook content below.
${chapterFocusInstruction}
${exampleInstruction}
${avoidanceInstruction}

STRICT STEM AND MATHEMATICAL RULES:
1. LaTeX: Use $...$ for inline math and $$...$$ for display/block math.
2. JSON ESCAPING: Inside a JSON string, every LaTeX backslash must be written as TWO backslashes. Examples:
   - \\frac{1}{2}   (renders as \frac)
   - \\sqrt{x}      (renders as \sqrt)
   - \\text{H}_2\\text{O}  (renders as \text{H}_2\text{O})
   - \\alpha, \\beta, \\theta, \\Delta
   - \\begin{cases} ... \\end{cases}
3. Chemistry structures: Use [SMILES: notation] for any drawn chemical structure (e.g. [SMILES: CC(=O)O] for acetic acid, [SMILES: c1ccccc1] for benzene).
   IMPORTANT: SMILES notation is NOT a chemical formula. Never put atomic symbols like H2O inside [SMILES:].
4. Chemical Formulas and Equations: Format ALL chemical formulas in LaTeX with subscripts/superscripts:
   - $\\text{H}_2\\text{O}$, $\\text{CO}_2$, $\\text{K}_2\\text{SO}_4$, $\\text{Al}_2(\\text{SO}_4)_3$
   - Never write plain text like H2O or K2SO4 — always use LaTeX.
5. Colligative Properties & van't Hoff Factor (i):
   - For questions on colligative properties (freezing point depression, boiling point elevation, vapour pressure lowering, osmotic pressure) of electrolytes (e.g. NaCl, KCl, CaCl2, Na2SO4, etc.), you MUST calculate and include the van't Hoff factor (i) assuming complete dissociation (unless degree of dissociation is given).
   - E.g., for NaCl, i = 2; for KCl, i = 2; for Na2SO4, i = 3; for MgSO4, i = 2.
   - Do not ignore/neglect dissociation for strong/weak electrolytes.
5. Absolute Self-Containment:
   - Do NOT refer to external figures, tables, graphs, "above calculations", "provided text", or "given table". Each question must contain all the numerical parameters and context required to solve it, and be completely standalone.

STRICT QUESTION LOGIC RULES:
1. Unique Option Values: All option values MUST be completely unique. Never generate duplicate options.
2. Correct Answer Consistency: The option marked "isCorrect": true MUST be the mathematically correct value.
3. Mathematical Verification: You must calculate the answer step-by-step in the "calculation_scratchpad" field BEFORE outputting the prompt, options, and explanation.

JSON RULES:
1. NO markdown wrappers (no \`\`\`json).
2. NO trailing commas.
3. Use DOUBLE QUOTES only.
4. Output ONLY the JSON object.

JSON STRUCTURE:
{
  "questions": [
    {
      "calculation_scratchpad": "Write down the step-by-step mathematical calculations, formulas used (especially van't Hoff factor 'i' if applicable), and physical calculations here first.",
      "prompt": "Question text here",
      "difficulty": "medium",
      "marks": 2,
      "negativeMarks": 0,
      "options": [
        { "label": "A", "value": "Option 1", "isCorrect": true },
        { "label": "B", "value": "Option 2", "isCorrect": false },
        { "label": "C", "value": "Option 3", "isCorrect": false },
        { "label": "D", "value": "Option 4", "isCorrect": false }
      ],
      "explanation": "Detailed step-by-step explanation for the student, verifying the calculation."
    }
  ]
}

TEXT CONTENT:
---
${textChunk}
---
      `;

      let batchAttempts = 0;
      while (batchAttempts < 2) {
        batchAttempts++;
        try {
          console.log(`Generating batch ${batchIndex + 1} (attempt ${batchAttempts}, count: ${currentBatchCount})...`);
          let rawResponse = await generateContentWithFallback(prompt, '{"questions": []}');
          
          const startIdx = rawResponse.indexOf("{");
          const endIdx = rawResponse.lastIndexOf("}");
          if (startIdx !== -1 && endIdx !== -1) {
            rawResponse = rawResponse.substring(startIdx, endIdx + 1);
          }

          const repaired = repairJsonString(rawResponse);
          let parsedArr: any[];
          try {
            const parsedObj = JSON.parse(repaired);
            parsedArr = parsedObj.questions || (Array.isArray(parsedObj) ? parsedObj : []);
          } catch (parseErr: any) {
            // Full parse failed (e.g. truncated response) — extract individual question objects
            parsedArr = extractQuestionsFromBrokenJson(rawResponse);
            if (parsedArr.length === 0) {
              console.warn(`Batch ${batchIndex + 1}: full JSON parse failed and fragment extraction found nothing. Parse error: ${parseErr.message}`);
              console.warn(`Raw response preview (first 500 chars): ${rawResponse.substring(0, 500)}`);
            } else {
              console.warn(`Batch ${batchIndex + 1}: full JSON parse failed, recovered ${parsedArr.length} questions via fragment extraction`);
            }
          }

          const mappedQuestions = parsedArr.map((item: any, idx: number) => {
            const qId = `q-ai-${Date.now()}-${batchIndex}-${idx}`;
            const correctOptionIds: string[] = [];
            const options: QuestionOption[] = (item.options || []).map((opt: any, optIndex: number) => {
              const oId = `opt-${Date.now()}-${batchIndex}-${idx}-${optIndex}`;
              if (opt.isCorrect) correctOptionIds.push(oId);
              return { id: oId, label: opt.label || String.fromCharCode(65 + optIndex), value: opt.value };
            });

            return {
              id: qId,
              subjectId,
              topicId,
              type: (correctOptionIds.length > 1 ? "multi_correct" : "single_correct") as "multi_correct" | "single_correct",
              prompt: item.prompt,
              difficulty: item.difficulty,
              marks: item.marks || 2,
              negativeMarks: item.negativeMarks || 0,
              options,
              correctOptionIds,
              explanation: item.explanation,
            };
          });

          // Run Critic validation on this batch
          const validatedQuestions = await validateQuestionsBatch(mappedQuestions, subject);
          
          if (validatedQuestions.length > 0) {
            console.log(`Batch ${batchIndex + 1} succeeded and verified on attempt ${batchAttempts}. Yielded ${validatedQuestions.length}/${currentBatchCount} valid questions.`);
            return validatedQuestions;
          }
        } catch (error: any) {
          console.error(`Batch ${batchIndex + 1} attempt ${batchAttempts} failed:`, error.message);
        }
      }
      return [];
    });

    const results = await Promise.all(batchPromises);
    for (const qList of results) {
      allQuestions.push(...qList);
    }
    console.log(`Round ${attempts} finished. Total accumulated valid questions: ${allQuestions.length}/${questionCount}`);
  }

  return allQuestions.slice(0, questionCount);
}

async function validateQuestionsBatch(
  questions: Question[],
  subjectName?: string
): Promise<Question[]> {
  if (questions.length === 0) return [];

  const criticPrompt = `
You are an elite academic validator for JEE/NEET STEM questions. Review the following questions for absolute correctness:
1. Double-check all math calculations step-by-step.
2. Verify that electrolyte solutions (e.g. NaCl, KCl, BaCl2, etc.) correctly use the van't Hoff factor (i) in colligative property calculations. If a question neglects dissociation, mark it invalid.
3. Ensure no duplicate option values exist.
4. Ensure the correct option is mathematically correct and matches the step-by-step derivation.
5. Ensure the question is completely standalone (no references to "above calculations", "provided chart", etc.).

Input Questions:
${JSON.stringify(questions.map((q, idx) => ({
    index: idx,
    prompt: q.prompt,
    options: q.options.map(o => ({ id: o.id, label: o.label, value: o.value, isCorrect: q.correctOptionIds.includes(o.id) })),
    explanation: q.explanation
  })), null, 2)}

Output JSON ONLY:
{
  "evaluations": [
    {
      "index": 0,
      "isValid": true,
      "reason": "Looks good"
    },
    {
      "index": 1,
      "isValid": false,
      "reason": "Van't Hoff factor was omitted for KCl (i=2).",
      "correctedQuestion": {
        "prompt": "Corrected prompt here",
        "options": [
          { "label": "A", "value": "Correct value", "isCorrect": true },
          { "label": "B", "value": "Distractor", "isCorrect": false },
          { "label": "C", "value": "Distractor 2", "isCorrect": false },
          { "label": "D", "value": "Distractor 3", "isCorrect": false }
        ],
        "explanation": "Corrected explanation here"
      }
    }
  ]
}
`;

  try {
    console.log(`Validator Critic is reviewing ${questions.length} questions...`);
    const rawResponse = await generateContentWithFallback(criticPrompt, '{"evaluations": []}');
    const startIdx = rawResponse.indexOf("{");
    const endIdx = rawResponse.lastIndexOf("}");
    if (startIdx === -1 || endIdx === -1) return questions; 
    
    const parsed = JSON.parse(rawResponse.substring(startIdx, endIdx + 1));
    const evaluations = parsed.evaluations || [];
    
    const finalQuestions: Question[] = [];
    
    for (const q of questions) {
      const idx = questions.indexOf(q);
      const evalItem = evaluations.find((e: any) => e.index === idx);
      
      if (!evalItem) {
        finalQuestions.push(q);
        continue;
      }
      
      if (evalItem.isValid) {
        finalQuestions.push(q);
      } else if (evalItem.correctedQuestion) {
        console.log(`Critic corrected Question ${idx}: ${evalItem.reason}`);
        const cq = evalItem.correctedQuestion;
        const correctOptionIds: string[] = [];
        const options = (cq.options || []).map((opt: any, optIndex: number) => {
          const oId = `opt-${Date.now()}-corrected-${idx}-${optIndex}`;
          if (opt.isCorrect) correctOptionIds.push(oId);
          return { id: oId, label: opt.label || String.fromCharCode(65 + optIndex), value: opt.value };
        });
        
        finalQuestions.push({
          ...q,
          prompt: cq.prompt || q.prompt,
          options,
          correctOptionIds,
          type: correctOptionIds.length > 1 ? "multi_correct" : "single_correct",
          explanation: cq.explanation || q.explanation
        });
      } else {
        console.warn(`Critic rejected Question ${idx} completely: ${evalItem.reason}`);
      }
    }
    
    return finalQuestions;
  } catch (error) {
    console.error("Critic validation failed, keeping original questions:", error);
    return questions;
  }
}

export async function parseExamPrompt(promptText: string): Promise<{
  examName: string;
  batchName: string;
  subjectName: string;
  topicKeywords: string[];
  questionCount: number;
  difficulty: string;
  durationMinutes: number;
}> {
  if (!process.env.GEMINI_API_KEY && !process.env.OPENROUTER_API_KEY) {
    throw new Error("Neither GEMINI_API_KEY nor OPENROUTER_API_KEY is configured.");
  }

  const prompt = `
    Analyze the teacher's request for an exam and extract the following details in JSON format.
    Request: "${promptText}"

    JSON STRUCTURE:
    {
      "examName": "A descriptive title for the exam",
      "batchName": "The name of the batch or class group (e.g. 'Batch A', 'Class 10')",
      "subjectName": "The subject (e.g. 'Physics', 'Maths')",
      "topicKeywords": ["list", "of", "topic", "keywords"],
      "questionCount": 10,
      "difficulty": "medium",
      "durationMinutes": 30
    }

    Rules:
    1. If a value is not mentioned, provide a reasonable default.
    2. Output ONLY the JSON.
  `;

  const rawResponse = await generateContentWithFallback(prompt, "{}");

  return JSON.parse(rawResponse);
}

export async function ensureEnoughQuestions(params: {
  topicIds: string[];
  subjectId: string;
  targetCount: number;
  state: any;
}): Promise<number> {
  const { topicIds, subjectId, targetCount, state } = params;
  
  const existingQuestions = state.questions.filter((q: any) => topicIds.includes(q.topicId));
  if (existingQuestions.length >= targetCount) {
    return existingQuestions.length;
  }

  const needed = targetCount - existingQuestions.length;
  const book = state.subjectBooks.find((b: any) => b.subjectId === subjectId && b.parsedText);
  
  if (!book) {
    return existingQuestions.length;
  }

  console.log(`Auto-generating ${needed} missing questions for subject ${subjectId}...`);
  try {
    const subject = state.subjects.find((s: any) => s.id === subjectId);
    const generated = await generateQuestionsFromText({
      text: book.parsedText!,
      topicId: topicIds[0],
      subjectId: subjectId,
      subject: subject?.name,
      questionCount: needed,
    });

    const finalizedQuestions = generated.map((q, i) => ({
      ...q,
      topicId: topicIds[i % topicIds.length],
      sourceType: "ai_generated" as any
    }));

    const { upsertRecord } = await import("../data/database.js");
    for (const q of finalizedQuestions) {
      await upsertRecord("questions", q);
      state.questions.push(q); 
    }
    
    return existingQuestions.length + finalizedQuestions.length;
  } catch (err) {
    console.error("Auto-generation failed:", err);
    return existingQuestions.length;
  }
}

export async function detectCurriculumFromText(text: string): Promise<{
  chapters: { name: string; topics: string[] }[];
}> {
  if (!process.env.GEMINI_API_KEY && !process.env.OPENROUTER_API_KEY) {
    throw new Error("Neither GEMINI_API_KEY nor OPENROUTER_API_KEY is configured.");
  }

  const prompt = `
    Analyze the educational text provided below and extract the academic structure (Chapters and their respective Topics).
    Return the result in JSON format.

    JSON STRUCTURE:
    {
      "chapters": [
        {
          "name": "Chapter Title",
          "topics": ["Topic A", "Topic B", "Topic C"]
        }
      ]
    }

    Rules:
    1. Focus on educational/curriculum structure.
    2. Be concise but academic.
    3. EXCLUDE non-academic structural elements like "Exercise", "Summary", "Glossary", "Questions", "Answers", "Bibliography", "Index", etc. from both chapters and topics.
    4. Output ONLY the JSON.

    TEXT CONTENT:
    ---
    ${text.substring(0, 20000)}
    ---
  `;

  try {
    const rawResponse = await generateContentWithFallback(prompt, '{"chapters": []}');

    return JSON.parse(rawResponse);
  } catch (error) {
    console.error("Curriculum detection failed:", error);
    return { chapters: [] };
  }
}

export async function generateOfflineBoardPaper(params: {
  className: string;
  subjectName: string;
  topics: string[];
}): Promise<any> {
  const { className, subjectName, topics } = params;

  if (!process.env.GEMINI_API_KEY && !process.env.OPENROUTER_API_KEY) {
    throw new Error("Neither GEMINI_API_KEY nor OPENROUTER_API_KEY is configured.");
  }

  const prompt = `
You are an expert CBSE examiner. Generate a complete, realistic Class ${className} ${subjectName} Board Question Paper.
The paper should cover the following topics: ${topics.join(", ")}.

STRICT STEM AND MATHEMATICAL RULES:
1. LaTeX: Use $...$ for inline math/physics and $$...$$ for blocks. Use FOUR backslashes in JSON (e.g. \\\\frac).
2. Chemistry: Use [SMILES: notation] for chemical structures (e.g., [SMILES: c1ccccc1]).
3. Colligative Properties & van't Hoff Factor (i):
   - For questions on colligative properties (freezing point depression, boiling point elevation, vapour pressure lowering, osmotic pressure) of electrolytes (e.g. NaCl, KCl, CaCl2, Na2SO4, etc.), you MUST calculate and include the van't Hoff factor (i) assuming complete dissociation (unless degree of dissociation is given).
   - E.g., for NaCl, i = 2; for KCl, i = 2; for Na2SO4, i = 3; for MgSO4, i = 2.
   - Do not ignore/neglect dissociation for strong/weak electrolytes.
4. Absolute Self-Containment:
   - Do NOT refer to external figures, tables, graphs, "above calculations", "provided text", or "given table". Each question must contain all the numerical parameters and context required to solve it, and be completely standalone.

STRICT QUESTION LOGIC RULES:
1. Structure: Emulate exactly the standard CBSE blueprint for this subject (e.g., Sections A, B, C, D, E with appropriate typologies like MCQs, Assertion-Reason, Short Answer, Long Answer, and Case Study).
2. Mathematical Verification: Perform step-by-step mathematical calculations for any numerical question first to ensure accuracy. Make sure the correct option exists in the options list and is mathematically correct.
3. Output ONLY valid JSON, no markdown wrappers.

JSON STRUCTURE:
{
  "title": "Class ${className} ${subjectName} Pre-Board Examination",
  "timeAllowed": "3 Hours",
  "maximumMarks": 70,
  "generalInstructions": [
    "List of standard CBSE instructions (e.g., All questions are compulsory)"
  ],
  "sections": [
    {
      "sectionName": "SECTION A: MULTIPLE CHOICE QUESTIONS",
      "instructions": "This section contains 16 multiple choice questions of 1 mark each.",
      "questions": [
        {
          "qNumber": 1,
          "text": "Question text here.",
          "marks": 1,
          "options": ["(a) First option", "(b) Second option", "(c) Third option", "(d) Fourth option"],
          "hasOrChoice": false,
          "orText": ""
        }
      ]
    },
    {
      "sectionName": "SECTION B: ASSERTION-REASONING",
      "instructions": "This section contains 4 Assertion-Reason questions of 1 mark each.",
      "questions": [
        {
          "qNumber": 17,
          "text": "Assertion (A): ... \\nReason (R): ...",
          "marks": 1,
          "options": ["(a) Both A and R are true and R is the correct explanation of A.", "(b) Both A and R are true but R is NOT the correct explanation of A.", "(c) A is true but R is false.", "(d) A is false but R is true."],
          "hasOrChoice": false,
          "orText": ""
        }
      ]
    },
    {
      "sectionName": "SECTION C (And so on...)",
      "instructions": "Ensure all sections are completely filled with questions. Do not leave any section empty.",
      "questions": []
    }
  ]
}
  `;

  try {
    const rawResponse = await generateContentWithFallback(prompt, "{}");

    return JSON.parse(rawResponse);
  } catch (error) {
    console.error("Offline Paper Generation failed:", error);
    throw error;
  }
}

function shouldSkipPage(pageText: string): boolean {
  const lower = pageText.toLowerCase();
  
  // Skip OMR / bubble sheet templates
  if (
    lower.includes("omr answer sheet") || 
    lower.includes("omr sheet") || 
    lower.includes("answer sheet") ||
    lower.includes("bubble sheet") ||
    lower.includes("student name:") ||
    lower.includes("rollnumber:") ||
    (lower.includes("abcd") && lower.includes("oooo"))
  ) {
    return true;
  }

  // Skip page number list / metadata mapping tables
  if (
    lower.includes("universal_queid") || 
    lower.includes("universal_queld") ||
    (lower.match(/qp26/g) || []).length > 5 ||
    (lower.match(/qp25/g) || []).length > 5
  ) {
    return true;
  }

  // Skip pages that are purely explanation/solution pages with no question text.
  // "Sol." alone is NOT enough — two-column PDFs have "Sol." in the right column on
  // every question page. Only skip if "explanation" appears AND there are no question
  // number patterns (meaning the page is a solution-only page).
  const hasExplanationHeader = lower.includes("explanation :") || lower.includes("explanation:");
  const hasQuestionNumbers = /\b[1-9]\d?\s*[.\)]\s/.test(pageText);
  if (hasExplanationHeader && !hasQuestionNumbers) {
    return true;
  }

  if (pageText.trim().length < 100) {
    return true;
  }
  return false;
}

/**
 * Scans all PDF page texts for a compact answer key.
 * Supports three strategies (tried in order):
 *   Strategy 1 — numbered text:   "1. A  2. C  3. B"
 *   Strategy 2 — positional text: "C B C D A B D A …"  (dense bare-letter run)
 *   Strategy 3 — vision fallback: render answer-key page as image, ask vision AI to read
 *                                  the table (used when OCR scrambles column layout)
 * Returns a map of questionNumber → option label ("A"|"B"|"C"|"D").
 * Works even if the answer key page was skipped by shouldSkipPage.
 */
async function extractAnswerKey(pages: string[], pdfPath?: string): Promise<Map<number, string>> {
  const answerMap = new Map<number, string>();

  // ── Strategy 0: "Ans.: X" positional (two-column solution booklets) ──
  // Chemistry, Maths, and Biology PDFs have a two-column layout where pdfjs reads
  // the right column (answers + explanations) before the left column (questions).
  // Every "Ans.: d" marker appears in the same order as the questions across all pages,
  // so the first occurrence = Q1, second = Q2, and so on.
  // This must run BEFORE the numbered strategy because the numbered strategy would
  // falsely match option labels like "1. (A) …" from question text.
  {
    // \(?\s* handles both "Ans.: (D)" (no space) and "Ans . : ( D )" (OCR spaces inside parens)
    const ansKeyPattern = /Ans\s*\.\s*:\s*\(?\s*([A-Da-d])\s*\)?/gi;
    const collected: string[] = [];
    for (const pageText of pages) {
      for (const m of pageText.matchAll(ansKeyPattern)) {
        collected.push(m[1].toUpperCase());
      }
    }
    if (collected.length >= 5) {
      console.log(`[AnswerKey] Strategy 0 (Ans.: X positional): ${collected.length} answers collected`);
      for (let i = 0; i < collected.length; i++) {
        answerMap.set(i + 1, collected[i]);
      }
    }
  }

  // ── Strategy 1: numbered format  "1. A", "1.(A)", "1) B", "1-C" ──
  // Only runs when Strategy 0 found nothing, because this pattern also matches
  // question option labels ("1. (A) Kingdom…") which would produce wrong answers.
  if (answerMap.size === 0) {
    const pattern = /\b(\d{1,3})\s*[.\-\)]\s*\(?([A-Da-d])\)?(?:\s|$)/g;

    for (const pageText of pages) {
      const matches = [...pageText.matchAll(pattern)];
      if (matches.length < 3) continue;

      const candidates = new Map<number, string>();
      for (const m of matches) {
        const n = parseInt(m[1]);
        const opt = m[2].toUpperCase();
        if (n >= 1 && n <= 200) candidates.set(n, opt);
      }

      if (candidates.size >= 5) {
        for (const [n, opt] of candidates) {
          if (!answerMap.has(n)) answerMap.set(n, opt);
        }
      }
    }
  }

  // ── Strategy 2: positional bare-letter sequence "C B C D A B D A …" ──
  // Triggered only if Strategy 1 found nothing (the numbered format takes precedence).
  if (answerMap.size === 0) {
    // Returns the single-letter A-D value if the token reduces to exactly one such letter,
    // otherwise null. Strips surrounding punctuation like ( ) [ ] . but not internal chars.
    const singleAnswerLetter = (token: string): string | null => {
      const letters = token.replace(/[^A-Za-z]/g, "");
      if (letters.length === 1 && /^[A-Da-d]$/.test(letters)) {
        return letters.toUpperCase();
      }
      return null;
    };

    for (const pageText of pages) {
      const tokens = pageText.split(/\s+/).filter(t => t.trim().length > 0);
      if (tokens.length < 15) continue;

      // Find the 30-token window with the highest count of single A-D tokens.
      const windowSize = 30;
      let bestStart = -1;
      let bestCount = 0;
      for (let i = 0; i + windowSize <= tokens.length; i++) {
        let count = 0;
        for (let j = i; j < i + windowSize; j++) {
          if (singleAnswerLetter(tokens[j]) !== null) count++;
        }
        if (count > bestCount) { bestCount = count; bestStart = i; }
      }

      // Need ≥20/30 to be answer letters (question pages max out around 13/30).
      if (bestCount < 20 || bestStart === -1) continue;

      // Find the first actual A-D token inside the best window
      // (the window start index may be a few non-answer tokens before the cluster begins).
      let seqStart = bestStart;
      while (seqStart < bestStart + windowSize && singleAnswerLetter(tokens[seqStart]) === null) seqStart++;
      if (seqStart >= bestStart + windowSize) continue;

      // Walk backwards to include answer letters that come just before the window.
      while (seqStart > 0 && singleAnswerLetter(tokens[seqStart - 1]) !== null) seqStart--;

      // Walk forward collecting letters, tolerating gaps of exactly 1 non-letter token
      // (handles one OCR noise token like "14" inserted mid-sequence, but stops before
      // a stray isolated letter that appears 2+ positions after the real sequence ends).
      const answerLetters: string[] = [];
      let gapCount = 0;
      for (let i = seqStart; i < tokens.length; i++) {
        const letter = singleAnswerLetter(tokens[i]);
        if (letter !== null) {
          answerLetters.push(letter);
          gapCount = 0;
        } else {
          gapCount++;
          if (gapCount > 1) break; // End of the dense cluster
        }
      }

      if (answerLetters.length >= 15) {
        console.log(`[AnswerKey] Found positional sequential key: ${answerLetters.length} answers`);
        for (let i = 0; i < answerLetters.length; i++) {
          if (!answerMap.has(i + 1)) answerMap.set(i + 1, answerLetters[i]);
        }
        break; // First qualifying page wins
      }
    }
  }

  // ── Strategy 3: vision fallback — render the answer-key page and ask AI ──
  // Triggered when OCR scrambles the table layout (columns get reordered or lost).
  // Identifies answer-key pages by their characteristic header text, then reads
  // the table directly from the rendered page image.
  if (answerMap.size === 0 && pdfPath) {
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const lower = pages[pageIndex].toLowerCase();
      // Answer key pages from these exam systems have a Universal_QueId column header
      const looksLikeKeyPage = (
        lower.includes("universal_queid") ||
        lower.includes("universal_queld") ||
        (lower.includes("ans") && lower.includes("chap") && lower.includes("sec") && lower.includes("que"))
      );
      if (!looksLikeKeyPage) continue;

      console.log(`[AnswerKey] Text extraction failed — trying vision on page ${pageIndex + 1}...`);
      const imageBase64 = renderPageToBase64(pdfPath, pageIndex);
      if (!imageBase64) continue;

      const visionPrompt = `This page shows an answer key table from an exam paper.
The table has columns like: No (question number) | Ans (correct answer A/B/C/D) | Chap | Sec | Que | ...

Extract EVERY row from the table. Return JSON only:
{
  "answers": [
    {"questionNumber": 1, "answer": "C"},
    {"questionNumber": 2, "answer": "B"}
  ]
}

Rules:
- "answer" must be exactly one of: A, B, C, D (uppercase)
- Include every row you can read
- If a row is unclear, skip it
- Return only valid JSON, no markdown`;

      const visionResult = await generateVisionContent(visionPrompt, imageBase64);
      if (!visionResult) continue;

      try {
        const startIdx = visionResult.indexOf("{");
        const endIdx = visionResult.lastIndexOf("}");
        if (startIdx === -1 || endIdx === -1) continue;
        const parsed = JSON.parse(visionResult.substring(startIdx, endIdx + 1));
        const answers: Array<{ questionNumber: number; answer: string }> = parsed.answers || [];
        let added = 0;
        for (const a of answers) {
          if (typeof a.questionNumber === "number" && a.questionNumber >= 1 && a.questionNumber <= 200) {
            const letter = String(a.answer || "").toUpperCase().trim();
            if (/^[A-D]$/.test(letter) && !answerMap.has(a.questionNumber)) {
              answerMap.set(a.questionNumber, letter);
              added++;
            }
          }
        }
        if (added > 0) {
          console.log(`[AnswerKey] Vision extracted ${added} answers from page ${pageIndex + 1}`);
          break; // Stop after first successful page
        }
      } catch (e) {
        console.warn(`[AnswerKey] Vision parse failed for page ${pageIndex + 1}:`, e);
      }
    }
  }

  if (answerMap.size > 0) {
    console.log(`[AnswerKey] Final key has ${answerMap.size} answers: ${[...answerMap.entries()].slice(0, 10).map(([k,v])=>`${k}:${v}`).join(", ")}...`);
  } else {
    console.log("[AnswerKey] No answer key found in any page — AI domain knowledge will be used for all questions.");
  }

  return answerMap;
}

const VISION_PROMPT = `You are reading an exam paper image (JEE/NEET style). Extract EVERY multiple-choice question visible in this page.

RULES:
- If the page has two columns (questions left, solutions/answers right) — extract ONLY the left column questions.
- If the page is single-column — extract all questions on the page.
- Extract each question with its exact number, full text, and all 4 options (A, B, C, D) exactly as written.
- LaTeX math: use $...$ for inline, $$...$$ for block. In JSON strings write EVERY backslash as TWO backslashes: \\frac, \\sqrt, \\text, \\alpha, \\begin, \\right, \\left.
- Chemical formulas: use LaTeX with subscripts/superscripts — $\\text{H}_2\\text{O}$, $\\text{K}_2\\text{SO}_4$, $\\text{CO}_2$.
- Chemical structures drawn as diagrams: output [SMILES: ...] notation (e.g. [SMILES: c1ccccc1] for benzene, [SMILES: CC(=O)O] for acetic acid).
- Graphs and geometric figures: describe the axes and key features concisely in the question text (e.g. "The graph shows concentration on y-axis vs time on x-axis, with an exponential decay curve.").
- Set hasDiagram: true if ANY drawn structural formula, graph, geometric figure, or chemical structure image appears in the question stem OR in the options.
- Do NOT invent questions. If a page has no MCQ questions, return {"questions": []}.
- NEVER leave an option value empty.
- Output ONLY valid JSON, no markdown fences.

JSON FORMAT:
{
  "questions": [
    {
      "questionNumber": 1,
      "prompt": "Full question text with LaTeX math",
      "hasDiagram": false,
      "difficulty": "medium",
      "marks": 4,
      "negativeMarks": 1,
      "options": [
        { "label": "A", "value": "option text", "isCorrect": false },
        { "label": "B", "value": "option text", "isCorrect": false },
        { "label": "C", "value": "option text", "isCorrect": false },
        { "label": "D", "value": "option text", "isCorrect": false }
      ],
      "explanation": ""
    }
  ]
}

Set isCorrect: true only if there is an explicit answer marker on this page (circled option, asterisk, bold). Otherwise leave all options as isCorrect: false — the answer key will be applied separately.`;


const TEXT_PROMPT = (chunk: string) => `You are extracting MCQ questions from exam paper text. Extract EVERY multiple-choice question present.

RULES:
- The text may be from a two-column PDF and can appear scrambled — use question numbers to identify boundaries.
- Do NOT invent questions. If no MCQs are present return {"questions": []}.
- Format math in LaTeX ($...$ for inline, $$...$$ for block). In JSON strings write EVERY backslash as TWO backslashes: \\frac, \\sqrt, \\text, \\alpha, \\begin, \\right.
- Chemical formulas: $\\text{H}_2\\text{O}$, $\\text{CO}_2$, $\\text{K}_2\\text{SO}_4$.
- Chemical structures (SMILES or structural): output [SMILES: ...] notation.
- Leave isCorrect: false for all options — the answer key is applied separately.
- Output ONLY valid JSON.

JSON FORMAT: { "questions": [{ "questionNumber": 1, "prompt": "...", "difficulty": "medium", "marks": 4, "negativeMarks": 1, "options": [{"label":"A","value":"...","isCorrect":false},{"label":"B","value":"...","isCorrect":false},{"label":"C","value":"...","isCorrect":false},{"label":"D","value":"...","isCorrect":false}], "explanation": "" }] }

TEXT:
---
${chunk}
---`;

async function extractFromChunkText(chunkText: string, pageImageBase64?: string): Promise<any[]> {
  let rawResponse = "";
  let repaired = "";
  try {
    if (pageImageBase64) {
      // Vision-only path: send the page image with NO OCR text.
      // Two-column OCR text confuses the model — the image is always cleaner.
      console.log("[Extract] Using vision-only extraction (image sent, OCR text discarded).");
      const visionResult = await generateVisionContent(VISION_PROMPT, pageImageBase64);
      if (visionResult) {
        rawResponse = visionResult;
      } else {
        console.warn("[Extract] Vision failed, falling back to text-only.");
        rawResponse = await generateContentWithFallback(TEXT_PROMPT(chunkText), '{"questions": []}');
      }
    } else {
      rawResponse = await generateContentWithFallback(TEXT_PROMPT(chunkText), '{"questions": []}');
    }

    const startIdx = rawResponse.indexOf("{");
    const endIdx = rawResponse.lastIndexOf("}");
    if (startIdx !== -1 && endIdx !== -1) rawResponse = rawResponse.substring(startIdx, endIdx + 1);

    repaired = repairJsonString(rawResponse);
    let questions: any[];
    try {
      const parsedObj = JSON.parse(repaired);
      questions = parsedObj.questions || (Array.isArray(parsedObj) ? parsedObj : []);
    } catch {
      questions = extractQuestionsFromBrokenJson(rawResponse);
      console.warn(`[Extract] Full JSON parse failed, recovered ${questions.length} questions via fragment extraction`);
    }
    return questions.map(q => ({
      ...q,
      _questionNumber: (typeof q.questionNumber === "number" && q.questionNumber > 0) ? q.questionNumber : undefined,
      _hasDiagram: q.hasDiagram === true
    }));
  } catch (error: any) {
    console.error("[Extract] Chunk extraction failed:", error.message);
    try {
      fs.writeFileSync("scratch/failed_json_raw.json", rawResponse, "utf8");
      fs.writeFileSync("scratch/failed_json_repaired.json", repaired, "utf8");
    } catch (e) {}
    return [];
  }
}

function chunkPageText(pageText: string, maxQuestionsPerChunk = 6): string[] {
  const preprocessed = pageText.replace(/(?:\r?\n|^)\s*(\d+)\.\s+/g, (match, num) => {
    return `\n\n[QUESTION ${num}]\n`;
  });

  const regex = /\[QUESTION \d+\]/g;
  const matches = [...preprocessed.matchAll(regex)];

  if (matches.length <= maxQuestionsPerChunk) {
    return [preprocessed];
  }

  const chunks: string[] = [];
  let lastIndex = 0;

  for (let i = maxQuestionsPerChunk; i < matches.length; i += maxQuestionsPerChunk) {
    const match = matches[i];
    const startIndex = match.index!;
    const chunkText = preprocessed.substring(lastIndex, startIndex).trim();
    if (chunkText) {
      chunks.push(chunkText);
    }
    lastIndex = startIndex;
  }

  const lastChunkText = preprocessed.substring(lastIndex).trim();
  if (lastChunkText) {
    chunks.push(lastChunkText);
  }

  return chunks;
}

export async function extractQuestionsFromPdfText(params: {
  text: string;
  subjectId: string;
  topicId: string;
  sourceType: QuestionSource;
  bookId?: string;
  pdfPath?: string;
  diagrams?: Array<{ page: number; url: string; bbox: number[]; isQuestionImage?: boolean }>;
  onProgress?: (message: string) => void;
}): Promise<Question[]> {
  const pageDelimiter = /--- PAGE \d+ ---/gi;
  const parts = params.text.split(pageDelimiter);
  const pages = parts.map(p => p.trim()).filter(Boolean);

  const allParsedQuestions: any[] = [];

  // Derive expected question count from the highest numbered question marker in the source.
  // Pattern requirements to avoid false positives from decimals (5.4), table captions, equations:
  //   - must be at the very start of a line (after optional whitespace)
  //   - followed by a period and at least one space
  //   - next non-space char must be a letter or '(' (question text / option preamble), NOT a digit
  //   - number must be in realistic question-count range (1–200)
  let maxQuestionNumber = 0;
  const seenNumbers = new Set<number>();
  for (const pageText of pages) {
    for (const m of pageText.matchAll(/^[ \t]*(\d{1,3})\.\s+(?=[A-Za-z(])/gm)) {
      const n = parseInt(m[1]);
      if (!isNaN(n) && n >= 1 && n <= 200) {
        seenNumbers.add(n);
        if (n > maxQuestionNumber) maxQuestionNumber = n;
      }
    }
  }
  // Sanity check: if the numbers are not roughly sequential (e.g. gap > 5 between consecutive),
  // they are likely section/table numbers rather than question numbers — discard.
  if (maxQuestionNumber > 0) {
    const sorted = [...seenNumbers].sort((a, b) => a - b);
    // Expect at least half the numbers from 1..max to be present for sequential questions
    const expectedCoverage = maxQuestionNumber * 0.5;
    if (sorted.length < expectedCoverage) {
      console.log(`[Extract] maxQuestionNumber=${maxQuestionNumber} but only ${sorted.length} distinct numbers found — likely not a question paper. Skipping count cap.`);
      maxQuestionNumber = 0;
    } else {
      console.log(`[Extract] Highest question number in source: ${maxQuestionNumber} (${sorted.length} distinct question numbers found). Using as extraction cap.`);
    }
  }

  // Fallback if no page delimiters are found
  if (pages.length <= 1) {
    const chunkSize = 6000;
    const chunks: string[] = [];
    for (let i = 0; i < params.text.length; i += chunkSize) {
      chunks.push(params.text.substring(i, i + chunkSize));
    }
    for (let i = 0; i < chunks.length; i++) {
      console.log(`Extracting from chunk ${i + 1}/${chunks.length} sequentially...`);
      const qList = await extractFromChunkText(chunks[i]);
      
      const validList = qList.filter((q: any) => {
        const prompt = q.prompt || "";
        if (!prompt) return false;
        if (prompt.length < 15) return true;
        const cleanPrompt = prompt.toLowerCase().replace(/[^a-z0-9\s]/g, "");
        const cleanSource = chunks[i].toLowerCase().replace(/[^a-z0-9\s]/g, "");
        const words = cleanPrompt.split(/\s+/).filter((w: string) => w.length > 3);
        if (words.length === 0) return true;
        let matchCount = 0;
        for (const word of words) {
          if (cleanSource.includes(word)) {
            matchCount++;
          }
        }
        const ratio = matchCount / words.length;
        if (ratio < 0.35) {
          console.log(`[Validation] Discarded hallucinated question: "${prompt.substring(0, 60)}..." (match ratio: ${ratio})`);
          return false;
        }
        return true;
      });

      allParsedQuestions.push(...validList.map(q => ({ ...q, pageNumber: 1 })));
      if (i < chunks.length - 1) {
        const delay = 8000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  } else {
    // Process page-by-page sequentially
    let prevPageTail = ""; // last 400 chars of previous page, prepended to handle cross-boundary questions
    for (let i = 0; i < pages.length; i++) {
      const pageText = pages[i];
      if (shouldSkipPage(pageText)) {
        console.log(`Skipping page ${i + 1}/${pages.length} (OMR/key/blank)...`);
        prevPageTail = "";
        continue;
      }

      // Render page image for vision-based math extraction if PDF path is available
      let pageImageBase64: string | undefined;
      if (params.pdfPath) {
        const rendered = renderPageToBase64(params.pdfPath, i);
        if (rendered) {
          pageImageBase64 = rendered;
          console.log(`  Rendered page ${i + 1} image for vision extraction (${Math.round(rendered.length * 0.75 / 1024)} KB)`);
        }
      }

      const pageMsg = `Reading page ${i + 1} of ${pages.length}...`;
      console.log(`Extracting from page ${i + 1}/${pages.length} sequentially...`);
      params.onProgress?.(pageMsg);

      // Prepend tail of previous page so questions that span a page boundary are complete
      const pageTextWithOverlap = prevPageTail ? prevPageTail + "\n" + pageText : pageText;
      prevPageTail = pageText.slice(-400);

      if (pageImageBase64) {
        // Vision path: one call per page, no chunking needed — model reads the full page image
        const qList = await extractFromChunkText(pageTextWithOverlap, pageImageBase64);
        allParsedQuestions.push(...qList.map((q: any) => ({ ...q, pageNumber: i + 1 })));
        await new Promise(resolve => setTimeout(resolve, 15000));
      } else {
        // Text-only path: chunk large pages to stay within token limits
        const chunks = chunkPageText(pageTextWithOverlap, 6);
        for (let c = 0; c < chunks.length; c++) {
          if (chunks.length > 1) {
            console.log(`  Processing sub-chunk ${c + 1}/${chunks.length}...`);
            params.onProgress?.(`Reading page ${i + 1} of ${pages.length}, part ${c + 1}/${chunks.length}...`);
          }
          const qList = await extractFromChunkText(chunks[c]);
          const validList = qList.filter((q: any) => {
            const prompt = q.prompt || "";
            if (!prompt || prompt.length < 15) return !!prompt;
            const cleanPrompt = prompt.toLowerCase().replace(/[^a-z0-9\s]/g, "");
            const cleanSource = chunks[c].toLowerCase().replace(/[^a-z0-9\s]/g, "");
            const words = cleanPrompt.split(/\s+/).filter((w: string) => w.length > 3);
            if (words.length === 0) return true;
            const matchCount = words.filter((w: string) => cleanSource.includes(w)).length;
            if (matchCount / words.length < 0.35) {
              console.log(`[Validation] Discarded hallucinated question: "${prompt.substring(0, 60)}..."`);
              return false;
            }
            return true;
          });
          allParsedQuestions.push(...validList.map((q: any) => ({ ...q, pageNumber: i + 1 })));
          await new Promise(resolve => setTimeout(resolve, 15000));
        }
      }
    }
  }

  // Extract answer key from ALL pages (including answer-key-only pages skipped above).
  // Vision fallback is used when OCR scrambles the table layout.
  const answerKey = await extractAnswerKey(pages, params.pdfPath);

  // First pass: deduplicate by question number (same number = same question from PDF)
  // This is authoritative — no similarity heuristics needed when numbers match.
  const byNumber = new Map<number, any>();
  const noNumberQuestions: any[] = [];
  for (const q of allParsedQuestions) {
    const n = q._questionNumber;
    if (typeof n === "number" && n > 0) {
      if (!byNumber.has(n)) {
        byNumber.set(n, q);
      } else {
        const existing = byNumber.get(n)!;
        // Keep the version with a longer explanation; merge prompt to shortest clean version
        if (!existing.explanation && q.explanation) existing.explanation = q.explanation;
        if (q.prompt && q.prompt.length < existing.prompt.length && q.prompt.length > 20) {
          existing.prompt = q.prompt;
        }
      }
    } else {
      noNumberQuestions.push(q);
    }
  }
  // Rebuild: numbered questions in order, then unnumbered ones
  const deduplicatedByNumber = [...byNumber.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, q]) => q);
  const allAfterNumberDedup = [...deduplicatedByNumber, ...noNumberQuestions];

  // Second pass: text-similarity dedup for any remaining near-duplicates
  const uniqueQuestions: any[] = [];

  function isDuplicateQuestion(q1: any, q2: any, primaryThreshold = 0.75): boolean {
    const p1 = (q1.prompt || "").replace(/\[image:[^\]]+\]/gi, "").trim();
    const p2 = (q2.prompt || "").replace(/\[image:[^\]]+\]/gi, "").trim();

    const unicodeMap: Record<string, string> = {
      '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
      '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
      '⁻': '-'
    };

    const stripLaTeX = (str: string) => {
      let norm = str.split('').map(char => unicodeMap[char] || char).join('');
      return norm.toLowerCase()
        .replace(/\\text\s*\{([^}]+)\}/g, "$1")
        .replace(/\\mathrm\s*\{([^}]+)\}/g, "$1")
        .replace(/\\mathbf\s*\{([^}]+)\}/g, "$1")
        .replace(/\\vec\s*\{([^}]+)\}/g, "$1")
        .replace(/\\bold\s*\{([^}]+)\}/g, "$1")
        .replace(/\\text/g, "")
        .replace(/\\mathrm/g, "")
        .replace(/\$\$/g, "")
        .replace(/\$/g, "")
        .replace(/[\{\}\_\^\\]/g, "")
        .replace(/[^a-z0-9]/g, "");
    };

    const clean1 = stripLaTeX(p1);
    const clean2 = stripLaTeX(p2);

    // Substring check (if one prompt contains another and is long enough)
    if (clean1.length >= 20 && clean2.length >= 20) {
      if (clean1.includes(clean2) || clean2.includes(clean1)) {
        return true;
      }
    }

    // Trigram Jaccard similarity
    const getCharNgrams = (str: string, n: number) => {
      const ngrams = new Set<string>();
      const clean = stripLaTeX(str);
      for (let i = 0; i <= clean.length - n; i++) {
        ngrams.add(clean.substring(i, i + n));
      }
      return ngrams;
    };

    const charNgramSimilarity = (str1: string, str2: string, n: number = 3) => {
      const set1 = getCharNgrams(str1, n);
      const set2 = getCharNgrams(str2, n);
      if (set1.size === 0 || set2.size === 0) return 0;
      let intersection = 0;
      for (const item of set1) {
        if (set2.has(item)) {
          intersection++;
        }
      }
      return intersection / (set1.size + set2.size - intersection);
    };

    const similarity = charNgramSimilarity(p1, p2, 3);

    // Normalize and extract numbers
    const normalizeNums = (str: string) => {
      let norm = str.split('').map(char => unicodeMap[char] || char).join('');
      const matches = norm.match(/-?\d+(\.\d+)?/g) || [];
      return matches.map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
    };
    
    const nums1 = normalizeNums(p1);
    const nums2 = normalizeNums(p2);
    
    let numbersMatch = false;
    if (nums1.length === nums2.length && nums1.length > 0) {
      numbersMatch = true;
      for (let i = 0; i < nums1.length; i++) {
        if (Math.abs(nums1[i] - nums2[i]) > 0.0001) {
          numbersMatch = false;
          break;
        }
      }
    }
    
    const getOptVal = (o: any) => typeof o === 'string' ? o : (o?.value || '');
    
    const normalizeOptionValue = (str: string) => {
      let norm = str.split('').map(char => unicodeMap[char] || char).join('');
      return norm.toLowerCase()
        .replace(/\\text\s*\{([^}]+)\}/g, "$1")
        .replace(/\\mathrm\s*\{([^}]+)\}/g, "$1")
        .replace(/\\mathbf\s*\{([^}]+)\}/g, "$1")
        .replace(/\\vec\s*\{([^}]+)\}/g, "$1")
        .replace(/\\bold\s*\{([^}]+)\}/g, "$1")
        .replace(/\\text/g, "")
        .replace(/\\mathrm/g, "")
        .replace(/\$\$/g, "")
        .replace(/\$/g, "")
        .replace(/[\{\}\_\^\\]/g, "")
        .replace(/i/g, "l")
        .replace(/1/g, "l")
        .replace(/[^a-z]/g, "");
    };

    const opts1 = q1.options || [];
    const opts2 = q2.options || [];
    let optionsMatch = false;
    if (opts1.length > 0 && opts2.length > 0) {
      const vals1 = opts1.map((o: any) => normalizeOptionValue(getOptVal(o)));
      const vals2 = opts2.map((o: any) => normalizeOptionValue(getOptVal(o)));
      let matchCount = 0;
      for (const v1 of vals1) {
        if (!v1) continue;
        for (const v2 of vals2) {
          if (!v2) continue;
          if (v1 === v2 || v1.includes(v2) || v2.includes(v1)) {
            matchCount++;
            break;
          }
        }
      }
      const minOptions = Math.min(opts1.length, opts2.length);
      optionsMatch = matchCount >= Math.max(2, Math.floor(minOptions * 0.75));
    }
    
    if (similarity >= primaryThreshold) {
      if (opts1.length > 0 && opts2.length > 0 && !optionsMatch) {
        return false;
      }
      return true;
    }
    if (similarity >= 0.45) {
      if (numbersMatch || optionsMatch) return true;
    }
    
    return false;
  }

  for (const q of allAfterNumberDedup) {
    let foundIndex = -1;
    for (let j = 0; j < uniqueQuestions.length; j++) {
      if (isDuplicateQuestion(uniqueQuestions[j], q)) {
        foundIndex = j;
        break;
      }
    }

    if (foundIndex !== -1) {
      const existing = uniqueQuestions[foundIndex];
      
      // Preserve minimum page number
      const p1 = existing.pageNumber || 1;
      const p2 = q.pageNumber || 1;
      existing.pageNumber = Math.min(p1, p2);
      
      // Merge prompt (keep shorter clean one, preserving image tag)
      const imgMatchExisting = existing.prompt.match(/\[image:[^\]]+\]/i);
      const imgMatchNew = q.prompt.match(/\[image:[^\]]+\]/i);
      const imageTag = imgMatchExisting ? imgMatchExisting[0] : (imgMatchNew ? imgMatchNew[0] : null);

      const cleanPromptExisting = existing.prompt.replace(/\[image:[^\]]+\]/gi, "").trim();
      const cleanPromptNew = q.prompt.replace(/\[image:[^\]]+\]/gi, "").trim();

      let bestPrompt = cleanPromptExisting;
      if (cleanPromptNew.length > 0 && cleanPromptNew.length < cleanPromptExisting.length) {
        bestPrompt = cleanPromptNew;
      }

      if (imageTag) {
        existing.prompt = `${bestPrompt}\n${imageTag}`;
      } else {
        existing.prompt = bestPrompt;
      }

      if (!existing.explanation && q.explanation) {
        existing.explanation = q.explanation;
      }
      // Keep the lower question number (more reliable source wins)
      if (q._questionNumber !== undefined) {
        existing._questionNumber = existing._questionNumber !== undefined
          ? Math.min(existing._questionNumber, q._questionNumber)
          : q._questionNumber;
      }
    } else {
      uniqueQuestions.push(q);
    }
  }

  // Second-pass dedup: if we extracted more questions than expected, tighten the threshold to 0.65
  params.onProgress?.(`Deduplicating ${uniqueQuestions.length} extracted questions...`);
  if (maxQuestionNumber > 0 && uniqueQuestions.length > maxQuestionNumber) {
    console.log(`[Dedup] ${uniqueQuestions.length} questions extracted, expected ~${maxQuestionNumber}. Running second-pass dedup (threshold 0.65)...`);
    const strictUnique: any[] = [];
    for (const q of uniqueQuestions) {
      const foundIdx = strictUnique.findIndex(existing => isDuplicateQuestion(existing, q, 0.65));
      if (foundIdx === -1) {
        strictUnique.push(q);
      } else {
        const existing = strictUnique[foundIdx];
        if (!existing.explanation && q.explanation) existing.explanation = q.explanation;
        if (q._questionNumber !== undefined) {
          existing._questionNumber = existing._questionNumber !== undefined
            ? Math.min(existing._questionNumber, q._questionNumber)
            : q._questionNumber;
        }
      }
    }
    console.log(`[Dedup] After second pass: ${strictUnique.length} questions.`);
    uniqueQuestions.length = 0;
    uniqueQuestions.push(...strictUnique);
  }

  // Sort by question number so stored order matches PDF order
  uniqueQuestions.sort((a, b) => {
    const an = a._questionNumber ?? 9999;
    const bn = b._questionNumber ?? 9999;
    if (an !== bn) return an - bn;
    return (a.pageNumber ?? 0) - (b.pageNumber ?? 0);
  });

  // Diagnostic + recovery: find missing question numbers and attempt cross-page recovery
  const foundNumbers = uniqueQuestions
    .map(q => q._questionNumber)
    .filter((n): n is number => typeof n === "number")
    .sort((a, b) => a - b);
  if (foundNumbers.length > 0) {
    const expectedMax = Math.max(...foundNumbers);
    const missing = Array.from({ length: expectedMax }, (_, i) => i + 1)
      .filter(n => !foundNumbers.includes(n));
    console.log(`[Diagnostic] Found question numbers: ${foundNumbers.join(", ")}`);
    if (missing.length > 0) {
      console.log(`[Diagnostic] MISSING question numbers: ${missing.join(", ")} — attempting cross-page recovery`);

      for (const missingNum of missing) {
        if (!params.pdfPath) break;

        // Find the pages where the surrounding questions live
        const prevQ = uniqueQuestions.find(q => q._questionNumber === missingNum - 1);
        const nextQ = uniqueQuestions.find(q => q._questionNumber === missingNum + 1);
        const startPage = Math.max(1, prevQ?.pageNumber ?? 1);
        const endPage   = Math.min(pages.length, nextQ?.pageNumber ?? pages.length);

        // Render all pages from startPage to endPage (0-based for renderer)
        const recoveryImages: string[] = [];
        for (let p = startPage; p <= endPage; p++) {
          const img = renderPageToBase64(params.pdfPath, p - 1);
          if (img) recoveryImages.push(img);
        }
        if (recoveryImages.length === 0) continue;

        console.log(`[Recovery] Q${missingNum}: sending pages ${startPage}–${endPage} (${recoveryImages.length} images) for targeted recovery...`);
        const recoveryPrompt = `These ${recoveryImages.length} exam page image(s) together contain question number ${missingNum}. The question may start on one page and its options continue on the next page.

Extract ONLY question number ${missingNum} — its full text and all 4 options (A, B, C, D) exactly as printed.

Return JSON:
{
  "questions": [{
    "questionNumber": ${missingNum},
    "prompt": "full question text in LaTeX where needed",
    "difficulty": "medium",
    "marks": 4,
    "negativeMarks": 1,
    "options": [
      {"label":"A","value":"...","isCorrect":false},
      {"label":"B","value":"...","isCorrect":false},
      {"label":"C","value":"...","isCorrect":false},
      {"label":"D","value":"...","isCorrect":false}
    ],
    "explanation": ""
  }]
}`;

        try {
          let recoveryRaw: string | null = null;

          // Try OpenRouter with multiple images in content array
          if (process.env.OPENROUTER_API_KEY) {
            const model = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.2-90b-vision-instruct:free";
            const imageContent = recoveryImages.map(img => ({
              type: "image_url" as const,
              image_url: { url: `data:image/png;base64,${img}`, detail: "high" as const }
            }));
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://railway.app",
                "X-Title": "Coaching Portal Exam Gen"
              },
              body: JSON.stringify({
                model,
                messages: [{ role: "user", content: [
                  ...imageContent,
                  { type: "text", text: recoveryPrompt }
                ]}],
                response_format: { type: "json_object" },
                max_tokens: 4000
              })
            });
            if (response.ok) {
              const data = await response.json();
              recoveryRaw = data.choices?.[0]?.message?.content ?? null;
            } else {
              console.warn(`[Recovery] OpenRouter failed: ${(await response.text()).slice(0, 200)}`);
            }
          }

          // Fallback: Gemini with first image only
          if (!recoveryRaw) {
            const clients = getGeminiClients();
            for (const { client, name } of clients) {
              try {
                const parts: any[] = recoveryImages.map(img => ({ inlineData: { mimeType: "image/png", data: img } }));
                parts.push({ text: recoveryPrompt });
                const result = await client.models.generateContent({
                  model: GEMINI_MODEL,
                  contents: [{ parts }],
                  config: { responseMimeType: "application/json", maxOutputTokens: 4096 }
                });
                if (result.text) { recoveryRaw = result.text; break; }
              } catch (e: any) {
                console.warn(`[Recovery] Gemini ${name} failed:`, e?.message);
              }
            }
          }

          if (!recoveryRaw) { console.warn(`[Recovery] Q${missingNum}: all providers failed.`); continue; }

          const start = recoveryRaw.indexOf("{");
          const end   = recoveryRaw.lastIndexOf("}");
          if (start === -1 || end === -1) continue;
          const parsed = JSON.parse(repairJsonString(recoveryRaw.substring(start, end + 1)));
          const recovered = (parsed.questions || [])[0];
          if (recovered && recovered.prompt) {
            recovered._questionNumber = missingNum;
            recovered.pageNumber = startPage;
            uniqueQuestions.push(recovered);
            console.log(`[Recovery] Q${missingNum} successfully recovered: "${String(recovered.prompt).slice(0, 60)}..."`);
            // Re-sort after inserting
            uniqueQuestions.sort((a, b) => (a._questionNumber ?? 9999) - (b._questionNumber ?? 9999));
          }
        } catch (e: any) {
          console.warn(`[Recovery] Q${missingNum} recovery threw:`, e.message);
        }
      }
    }
  }

  return uniqueQuestions.map((q: any, i: number) => {
    const correctOptionIds: string[] = [];
    const options: QuestionOption[] = (q.options || []).map((o: any, idx: number) => {
      const oId = `opt-pdf-${Date.now()}-${i}-${idx}-${Math.random().toString(36).substr(2, 4)}`;
      if (o.isCorrect) correctOptionIds.push(oId);
      return {
        id: oId,
        label: o.label || String.fromCharCode(65 + idx),
        value: o.value || ""
      };
    });

    // Override with answer key if available for this question number
    const qNum = q._questionNumber;
    if (qNum && answerKey.has(qNum)) {
      const correctLabel = answerKey.get(qNum)!;
      const matchingOpt = options.find(o => o.label.toUpperCase() === correctLabel);
      if (matchingOpt) {
        // Replace whatever AI guessed with the authoritative answer key answer
        correctOptionIds.length = 0;
        correctOptionIds.push(matchingOpt.id);
        console.log(`[AnswerKey] Q${qNum}: set correct → ${correctLabel}`);
      }
    }

    let promptText = q.prompt || "";
    const pageNum = q.pageNumber;

    if (pageNum && params.diagrams) {
      // Filter: must be on the right page and large enough to be a real diagram (≥0.5% area).
      // Watermarks in header/footer are already excluded by extract_diagrams.py, but guard
      // against anything in the top 15% or bottom 10% that slipped through.
      const pageDiagrams = params.diagrams.filter(d => {
        if (d.page !== pageNum) return false;
        if (Array.isArray(d.bbox) && d.bbox.length === 4) {
          const [y1, x1, y2, x2] = d.bbox;
          const area = Math.abs(x2 - x1) * Math.abs(y2 - y1);
          if (area < 0.005) return false;
          if (y2 <= 0.15 || y1 >= 0.90) return false; // header/footer guard
        }
        return true;
      });

      // Sort by vertical position (top of page first) so we can match by question order
      pageDiagrams.sort((a, b) => {
        const ay1 = Array.isArray(a.bbox) ? a.bbox[0] : 0;
        const by1 = Array.isArray(b.bbox) ? b.bbox[0] : 0;
        return ay1 - by1;
      });

      if (pageDiagrams.length > 0) {
        const lowerPrompt = promptText.toLowerCase();

        // Vision model may report hasDiagram: true when structural formulas appear in question/options
        const visionReportedDiagram = q._hasDiagram === true;

        // Detect if any option value is missing or suspiciously short AND is not a plain number.
        // Pure numeric options like "3", "5", "2" should NOT trigger image assignment.
        const hasImageOnlyOption = q.options?.some((opt: any) => {
          const val = (opt.value || "").trim();
          if (val.length >= 4) return false;
          if (/^d+(.d+)?$/.test(val)) return false;  // skip pure numbers
          if (val === opt.label || val === `(${opt.label})`) return true;
          return val.length < 3; // very short non-numeric value = likely image placeholder
        }) ?? false;

        const mentionsFigure = (
          lowerPrompt.includes("figure") ||
          lowerPrompt.includes("diagram") ||
          lowerPrompt.includes("image") ||
          lowerPrompt.includes("shown below") ||
          lowerPrompt.includes("given below") ||
          lowerPrompt.includes("above reaction") ||
          lowerPrompt.includes("following structure") ||
          lowerPrompt.includes("the structure") ||
          lowerPrompt.includes("given :") ||
          lowerPrompt.includes("given:") ||
          lowerPrompt.includes("piston") ||
          lowerPrompt.includes("semi-permeable") ||
          lowerPrompt.includes("membrane")
        );

        const needsDiagram = visionReportedDiagram || mentionsFigure || hasImageOnlyOption;

        if (needsDiagram && !promptText.includes("[IMAGE:")) {
          // Prefer question-area images (above the Ans. marker on the page).
          // Only fall back to all diagrams when there is exactly one on the page
          // (unambiguous single-diagram page where classification is uncertain).
          const qImgDiagrams = pageDiagrams.filter((d: any) => d.isQuestionImage !== false);
          const candidateDiagrams = qImgDiagrams.length > 0
            ? qImgDiagrams
            : pageDiagrams.length === 1 ? pageDiagrams : [];

          if (candidateDiagrams.length > 0) {
            // Use question ordering to pick among multiple candidates on the same page.
            const questionsOnPage = allParsedQuestions.filter(
              (pq: any) => pq.pageNumber === pageNum
            );
            const questionIndexOnPage = Math.max(
              questionsOnPage.findIndex(
                (pq: any) => pq._questionNumber === q._questionNumber || pq.prompt === q.prompt
              ),
              0
            );
            const diagramIndex = Math.min(questionIndexOnPage, candidateDiagrams.length - 1);
            promptText += `
[IMAGE: ${candidateDiagrams[diagramIndex].url}]`;
          }
        }
      }
    }

    const normalizedPrompt = promptText.toLowerCase().replace(/[^a-z0-9]/g, "");
    const promptHash = crypto.createHash("sha256").update(normalizedPrompt).digest("hex").substring(0, 16);
    const qId = `que-pdf-${params.bookId || "book"}-${promptHash}`;

    return {
      id: qId,
      subjectId: params.subjectId,
      topicId: params.topicId,
      type: correctOptionIds.length > 1 ? "multi_correct" : "single_correct",
      prompt: promptText,
      difficulty: q.difficulty || "medium",
      marks: q.marks || 1,
      negativeMarks: q.negativeMarks || 0,
      correctOptionIds,
      options,
      explanation: q.explanation || "",
      sourceType: params.sourceType,
      bookId: params.bookId,
      // Mark unverified if no correct answer was detected (garbled OCR, missing answer key)
      isVerified: correctOptionIds.length > 0,
      pageNumber: pageNum,
      questionNumber: q._questionNumber
    };
  });
}
