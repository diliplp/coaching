import fs from "node:fs";
import crypto from "node:crypto";

// Set API keys
process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY; // key is read from .env
process.env.GEMINI_MODEL = "gemini-2.5-flash";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
let isGeminiQuotaExceeded = true; // FORCE OpenRouter directly!

async function generateContentWithFallback(prompt, fallbackJson = "{}") {
  const keysToTry = isGeminiQuotaExceeded ? [] : [
    { key: process.env.GEMINI_API_KEY, name: "Primary Gemini API Key" },
    { key: process.env.GEMINI_API_KEY_BACKUP, name: "Backup Gemini API Key" }
  ].filter(item => !!item.key);

  let lastError = null;

  for (const { key, name } of keysToTry) {
    let attempts = 0;
    const maxAttempts = 3;
    let delay = 3000;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        console.log(`[LLM] Attempting generation with ${name}...`);
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
          })
        });

        if (response.ok) {
          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) return text;
        } else {
          const errStatus = response.status;
          const errText = await response.text();
          console.warn(`[LLM] ${name} failed with status ${errStatus}: ${errText}`);
          lastError = new Error(`Gemini API error (${name}): Status ${errStatus}`);
          if (errStatus === 429) {
            console.log(`Rate limited. Waiting 20s...`);
            await new Promise(resolve => setTimeout(resolve, 20000));
            continue;
          }
        }
        break;
      } catch (e) {
        console.warn(`[LLM] ${name} threw exception:`, e.message || e);
        lastError = e;
      }
    }
  }

  // 2. OpenRouter fallback
  if (process.env.OPENROUTER_API_KEY) {
    const openRouterModels = [
      "openai/gpt-4o-mini",
      "deepseek/deepseek-chat",
      "google/gemini-1.5-flash",
      "meta-llama/llama-3-8b-instruct:free"
    ];

    for (const model of openRouterModels) {
      try {
        console.log(`[LLM] Attempting OpenRouter failover with model ${model}...`);
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://railway.app", 
            "X-Title": "Coaching Portal Exam Gen"
          },
          body: JSON.stringify({
            model: model, 
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            max_tokens: 8000
          })
        });

        if (response.ok) {
          const data = await response.json();
          const text = data.choices?.[0]?.message?.content;
          if (text) return text;
        } else {
          const errText = await response.text();
          console.warn(`[LLM] OpenRouter model ${model} failed: ${errText}`);
          lastError = new Error(`OpenRouter API error (${model}): ${errText}`);
        }
      } catch (e) {
        console.warn(`[LLM] OpenRouter model ${model} threw error:`, e.message || e);
        lastError = e;
      }
    }
  }

  if (lastError) throw lastError;
  return fallbackJson;
}

function repairJsonString(raw) {
  return raw.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match, p1) => {
    const parts = p1.split('\\\\');
    const processedParts = parts.map(part => part.replace(/\\(?!n|")/g, '\\\\'));
    return '"' + processedParts.join('\\\\') + '"';
  });
}

function shouldSkipPage(pageText) {
  const lower = pageText.toLowerCase();
  if (lower.includes("omr answer sheet") || lower.includes("omr sheet") || lower.includes("answer sheet")) {
    return true;
  }
  if (pageText.trim().length < 100) {
    return true;
  }
  return false;
}

async function extractFromChunkText(chunkText) {
  const prompt = `You are an expert data extraction assistant. Your task is to read the textbook/paper text below and extract EVERY multiple-choice question (MCQ) present in it.
Do NOT generate new questions, and do NOT invent any questions.

CRITICAL: Only extract questions that are explicitly written in the source text. If the text does not contain any actual multiple-choice questions (e.g. it is just metadata, instructions, student name, roll number, blank page, OMR sheet, or a list of codes), you MUST return an empty array of questions: {"questions": []}. Do NOT invent, hallucinate, or generate any new questions under any circumstances.

For each question, find:
1. The question prompt/text.
2. The options (A, B, C, D, etc.) with their values.
3. Identify which option is the correct one based on the text or solutions provided in the text.
4. The explanation if provided in the text.

OCR ERROR RECONSTRUCTION RULES:
- The source text comes from a scanned PDF; mathematical equations, LaTeX fractions, and variables may look like garbage. You MUST use your domain knowledge of chemistry and physics to intelligently reconstruct these expressions into correct, standard, readable math formulas formatted in LaTeX.
- Ensure all four options are mathematically clean, scientifically coherent, and matching standard JEE/NEET patterns.
- Strip away hanging braces, floating characters, page numbers, and random OCR scanner artifacts.

STRICT FORMATTING RULES:
1. LaTeX: Use $...$ for inline and $$...$$ for blocks.
2. JSON ESCAPING: In the JSON, use FOUR backslashes for LaTeX (e.g., "\\\\frac").
3. Chemistry: Use [SMILES: notation] for chemical structures.
4. Chemical Formulas and Equations (Subscripts/Superscripts): You MUST format ALL chemical formulas (e.g., H2O, CO2, NaCl, K2SO4, Al2(SO4)3) and chemical equations in standard LaTeX using subscripts and superscripts (e.g., use $\\text{H}_2\\text{O}$ or $\\text{K}_2\\text{SO}_4$). Never output plain text chemical formulas like H2O or K2SO4.
5. Output ONLY the JSON object, no markdown code blocks.

JSON STRUCTURE:
{
  "questions": [
    {
      "prompt": "Question text here",
      "difficulty": "medium",
      "marks": 1,
      "negativeMarks": 0,
      "options": [
        { "label": "A", "value": "Option 1", "isCorrect": true },
        { "label": "B", "value": "Option 2", "isCorrect": false },
        { "label": "C", "value": "Option 3", "isCorrect": false },
        { "label": "D", "value": "Option 4", "isCorrect": false }
      ],
      "explanation": "Detailed explanation of the solution"
    }
  ]
}

TEXT TO EXTRACT FROM:
---
${chunkText}
---
`;

  try {
    let rawResponse = await generateContentWithFallback(prompt, '{"questions": []}');
    const startIdx = rawResponse.indexOf("{");
    const endIdx = rawResponse.lastIndexOf("}");
    if (startIdx !== -1 && endIdx !== -1) {
      rawResponse = rawResponse.substring(startIdx, endIdx + 1);
    }
    const repaired = repairJsonString(rawResponse);
    const parsedObj = JSON.parse(repaired);
    return parsedObj.questions || (Array.isArray(parsedObj) ? parsedObj : []);
  } catch (error) {
    console.error("MCQ chunk extraction failed:", error.message);
    return [];
  }
}

function isDuplicateQuestion(q1, q2) {
  const p1 = q1.prompt || "";
  const p2 = q2.prompt || "";

  const clean1 = p1.toLowerCase().replace(/[^a-z0-9\s]/g, "");
  const clean2 = p2.toLowerCase().replace(/[^a-z0-9\s]/g, "");
  
  const words1 = clean1.split(/\s+/).filter((w) => w.length > 2);
  const words2 = clean2.split(/\s+/).filter((w) => w.length > 2);
  
  if (words1.length === 0 || words2.length === 0) return false;
  
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  
  let intersection = 0;
  for (const w of set1) {
    if (set2.has(w)) {
      intersection++;
    }
  }
  const union = set1.size + set2.size - intersection;
  const similarity = intersection / union;
  
  if (similarity < 0.5) return false;
  
  const unicodeMap = {
    '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
    '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
    '⁻': '-'
  };
  const normalizeNums = (str) => {
    let norm = str.split('').map(char => unicodeMap[char] || char).join('');
    const matches = norm.match(/-?\d+(\.\d+)?/g) || [];
    return matches.map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
  };
  
  const nums1 = normalizeNums(p1);
  const nums2 = normalizeNums(p2);
  
  let numbersMatch = false;
  if (nums1.length === nums2.length) {
    numbersMatch = true;
    for (let i = 0; i < nums1.length; i++) {
      if (Math.abs(nums1[i] - nums2[i]) > 0.0001) {
        numbersMatch = false;
        break;
      }
    }
  }
  
  const opts1 = q1.options || [];
  const opts2 = q2.options || [];
  let optionsMatch = false;
  if (opts1.length > 0 && opts1.length === opts2.length) {
    const vals1 = opts1.map((o) => (o.value || "").toLowerCase().replace(/[^a-z0-9]/g, "")).sort();
    const vals2 = opts2.map((o) => (o.value || "").toLowerCase().replace(/[^a-z0-9]/g, "")).sort();
    let matchCount = 0;
    for (let i = 0; i < vals1.length; i++) {
      if (vals1[i] === vals2[i] || vals1[i].includes(vals2[i]) || vals2[i].includes(vals1[i])) {
        matchCount++;
      }
    }
    optionsMatch = matchCount >= 3;
  }
  
  if (similarity >= 0.85) return true;
  if (similarity >= 0.5) {
    if (numbersMatch || optionsMatch) return true;
  }
  
  return false;
}

async function run() {
  try {
    const text = fs.readFileSync("scratch/UnitTest_extracted.txt", "utf8");
    const pageDelimiter = /--- PAGE \d+ ---/gi;
    const parts = text.split(pageDelimiter);
    const pages = parts.map(p => p.trim()).filter(Boolean);

    const allParsedQuestions = [];

    for (let i = 0; i < pages.length; i++) {
      const pageText = pages[i];
      if (shouldSkipPage(pageText)) {
        console.log(`Skipping page ${i + 1}/${pages.length}`);
        continue;
      }
      console.log(`Extracting from page ${i + 1}/${pages.length}...`);
      const qList = await extractFromChunkText(pageText);
      console.log(`Extracted ${qList.length} questions from page ${i + 1}.`);
      
      const tagged = qList.map(q => ({ ...q, pageNumber: i + 1 }));
      allParsedQuestions.push(...tagged);
      
      // Delay to avoid rate limit
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log(`Saving allParsedQuestions to scratch/local_extracted_questions.json...`);
    fs.writeFileSync("scratch/local_extracted_questions.json", JSON.stringify(allParsedQuestions, null, 2));

    // Now run deduplication loop with logs
    console.log("\n--- RUNNING DEDUPLICATION LOOP ---");
    const uniqueQuestions = [];
    for (const q of allParsedQuestions) {
      let foundIndex = -1;
      for (let j = 0; j < uniqueQuestions.length; j++) {
        const dup = isDuplicateQuestion(uniqueQuestions[j], q);
        console.log(`Comparing q(page:${q.pageNumber}) with uniqueQuestions[${j}](page:${uniqueQuestions[j].pageNumber}) -> result: ${dup}`);
        if (dup) {
          foundIndex = j;
          break;
        }
      }

      if (foundIndex !== -1) {
        console.log(`--> MERGED with index ${foundIndex}`);
        const existing = uniqueQuestions[foundIndex];
        const hasExplExisting = !!existing.explanation && existing.explanation.trim().length > 0;
        const hasExplNew = !!q.explanation && q.explanation.trim().length > 0;
        if (hasExplNew && !hasExplExisting) {
          uniqueQuestions[foundIndex] = { ...existing, ...q };
        } else if (!hasExplNew && !hasExplExisting && q.prompt.length > existing.prompt.length) {
          uniqueQuestions[foundIndex] = { ...existing, ...q };
        } else {
          if (!existing.explanation && q.explanation) {
            existing.explanation = q.explanation;
          }
        }
      } else {
        console.log(`--> ADDED as new unique question`);
        uniqueQuestions.push(q);
      }
    }

    console.log(`\nFinal uniqueQuestions count: ${uniqueQuestions.length}`);
    fs.writeFileSync("scratch/page_by_page_extracted_questions.json", JSON.stringify(uniqueQuestions, null, 2));
  } catch (err) {
    console.error(err);
  }
}

run();
