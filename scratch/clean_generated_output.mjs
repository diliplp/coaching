import fs from "node:fs";

const INPUT_PATH = "scratch/full_generated_output.json";
const OUTPUT_PATH = "scratch/full_generated_output_cleaned.json";

function normalizeBackslashes(str) {
  // Collapse double backslashes to a single backslash (JSON escape handling)
  return str.replace(/\\\\/g, "\\");
}

function cleanExplanation(text) {
  if (!text) return text;
  // Remove leading and trailing backslashes and whitespace
  let cleaned = text.trim();
  // Remove leading \ characters
  cleaned = cleaned.replace(/^\\+/g, "");
  // Remove trailing \ characters
  cleaned = cleaned.replace(/\\+$/g, "");
  return cleaned;
}

function cleanOption(option) {
  const newOption = { ...option };
  if (newOption.value) {
    newOption.value = normalizeBackslashes(newOption.value);
  }
  if (newOption.label) {
    newOption.label = normalizeBackslashes(newOption.label);
  }
  return newOption;
}

function main() {
  const raw = fs.readFileSync(INPUT_PATH, "utf8");
  let questions = JSON.parse(raw);

  const seen = new Set();
  const cleaned = [];

  for (const q of questions) {
    // Normalize prompt for duplicate detection
    const normPrompt = q.prompt?.toLowerCase().replace(/\s+/g, " ").trim();
    if (normPrompt && seen.has(normPrompt)) {
      // duplicate – skip
      continue;
    }
    if (normPrompt) seen.add(normPrompt);

    // Clean explanations
    const cleanedExplanation = cleanExplanation(q.explanation);

    // Clean options values (collapse double backslashes)
    const cleanedOptions = (q.options || []).map(cleanOption);

    // Also fix any stray double backslashes in prompt itself
    const cleanedPrompt = normalizeBackslashes(q.prompt || "");

    const newQ = {
      ...q,
      prompt: cleanedPrompt,
      explanation: cleanedExplanation,
      options: cleanedOptions,
    };
    cleaned.push(newQ);
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(cleaned, null, 2), "utf8");
  console.log(`Cleaned ${questions.length} -> ${cleaned.length} questions written to ${OUTPUT_PATH}`);
}

main();
