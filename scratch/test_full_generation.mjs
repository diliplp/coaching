import fs from "node:fs";
import { extractQuestionsFromPdfText } from "../backend/src/utils/ai-generator.js";

const text = fs.readFileSync("scratch/UnitTest_extracted.txt", "utf8");

console.log("Running full extraction on all pages...");
const questions = await extractQuestionsFromPdfText({
  text: text,
  subjectId: "chemistry",
  topicId: "solutions",
  sourceType: "pdf"
});

console.log(`Generated ${questions.length} questions in total.`);
fs.writeFileSync("scratch/full_generated_output.json", JSON.stringify(questions, null, 2), "utf8");
