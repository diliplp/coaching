import fs from "node:fs";
import { extractQuestionsFromPdfText } from "../backend/src/utils/ai-generator.js";

const text = fs.readFileSync("scratch/UnitTest_extracted.txt", "utf8");
const pageDelimiter = /--- PAGE \d+ ---/gi;
const parts = text.split(pageDelimiter);
const pages = parts.map(p => p.trim()).filter(Boolean);

// Page 2 is index 1
const page2Text = pages[1];

console.log("=== Page 2 Text ===");
console.log(page2Text.substring(0, 300));

const dummyText = `--- PAGE 2 ---\n` + page2Text;

const questions = await extractQuestionsFromPdfText({
  text: dummyText,
  subjectId: "dummy",
  topicId: "dummy",
  sourceType: "pdf"
});

console.log(`Extracted ${questions.length} questions.`);
