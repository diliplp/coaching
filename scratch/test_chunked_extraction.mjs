import fs from "node:fs";

// Set environment variables for local execution using the API keys from Railway
process.env.GEMINI_API_KEY = "AIzaSyAd6YxCJL1XUrBg2cCO0iGC3CuF7RTvyHo";
process.env.GEMINI_API_KEY_BACKUP = "AIzaSyDcTUQjyb-eA7MVfEiyzCMSVyY_yw3dV9s";
process.env.GEMINI_MODEL = "gemini-2.5-flash";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

async function generateContentWithFallback(prompt, fallbackJson = "{}") {
  const keysToTry = [
    { key: process.env.GEMINI_API_KEY, name: "Primary Gemini API Key" },
    { key: process.env.GEMINI_API_KEY_BACKUP, name: "Backup Gemini API Key" }
  ].filter(item => !!item.key);

  let lastError = null;

  for (const { key, name } of keysToTry) {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json"
            }
          })
        });

        if (response.ok) {
          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            return text;
          }
        } else {
          const errStatus = response.status;
          const errText = await response.text();
          console.warn(`${name} failed with status ${errStatus}: ${errText}`);
          lastError = new Error(`Gemini API error (${name}): Status ${errStatus} - ${errText}`);
        }
        break;
      } catch (e) {
        console.warn(`${name} threw exception:`, e.message || e);
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
    const processedParts = parts.map(part => {
      return part.replace(/\\(?!n|")/g, '\\\\');
    });
    return '"' + processedParts.join('\\\\') + '"';
  });
}

async function extractQuestionsFromChunk(chunk, chunkIndex) {
  const prompt = `You are an expert data extraction assistant. Your task is to read the textbook/paper text below and extract EVERY multiple-choice question (MCQ) present in it.
Do NOT generate new questions, but DO identify and reconstruct any mathematical equations, variables, or chemical formulas that were garbled during the OCR/scanning process.

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
${chunk}
---
`;

  try {
    console.log(`Sending chunk ${chunkIndex + 1} to Gemini...`);
    const rawResponse = await generateContentWithFallback(prompt, '{"questions": []}');
    
    let jsonStr = rawResponse;
    const startIdx = jsonStr.indexOf("{");
    const endIdx = jsonStr.lastIndexOf("}");
    if (startIdx !== -1 && endIdx !== -1) {
      jsonStr = jsonStr.substring(startIdx, endIdx + 1);
    }

    const repaired = repairJsonString(jsonStr);
    const parsed = JSON.parse(repaired);
    const qs = parsed.questions || [];
    console.log(`Chunk ${chunkIndex + 1}: successfully extracted ${qs.length} questions.`);
    return qs;
  } catch (err) {
    console.error(`Chunk ${chunkIndex + 1} failed:`, err.message);
    return [];
  }
}

async function run() {
  try {
    console.log("Reading UnitTest_extracted.txt...");
    const text = fs.readFileSync("scratch/UnitTest_extracted.txt", "utf8");

    const pageDelimiter = /--- PAGE \d+ ---/gi;
    const parts = text.split(pageDelimiter);
    const pages = parts.map(p => p.trim()).filter(Boolean);

    console.log(`Found ${pages.length} pages.`);

    let chunks = [];
    const pageSize = 3;
    for (let i = 0; i < pages.length; i += pageSize) {
      const group = pages.slice(i, i + pageSize);
      chunks.push(group.join("\n\n--- NEXT PAGE ---\n\n"));
    }

    console.log(`Split into ${chunks.length} chunks.`);

    const chunkPromises = chunks.map((chunk, index) => extractQuestionsFromChunk(chunk, index));
    const results = await Promise.all(chunkPromises);
    const allQuestions = results.flat();

    console.log(`\nAll done! Total questions extracted: ${allQuestions.length}`);
    fs.writeFileSync("scratch/chunked_extracted_questions.json", JSON.stringify(allQuestions, null, 2));
    
    // Check if Question 6 is in the output (prompt containing piston or figure)
    const q6 = allQuestions.find(q => q.prompt.toLowerCase().includes("piston") || q.prompt.toLowerCase().includes("figure"));
    if (q6) {
      console.log("\nFound Question 6!");
      console.log(JSON.stringify(q6, null, 2));
    } else {
      console.log("\nQuestion 6 was NOT found in the final set.");
    }
  } catch (err) {
    console.error("Run failed:", err);
  }
}

run();
