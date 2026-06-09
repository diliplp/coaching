import fs from "node:fs";
import { extractQuestionsFromPdfText } from "../backend/src/utils/ai-generator.js";

const text = fs.readFileSync("scratch/UnitTest_extracted.txt", "utf8");
const pages = text.split("--- PAGE ");
const page12Text = pages[12];

// Make a dummy text with PAGE delimiter
const dummyText = `--- PAGE 12 ---\n` + page12Text;

const questions = await extractQuestionsFromPdfText({
  text: dummyText,
  subjectId: "dummy",
  topicId: "dummy",
  sourceType: "pdf"
});

console.log("Writing output to scratch/raw_output.json...");
fs.writeFileSync("scratch/raw_output.json", JSON.stringify(questions, null, 2), "utf8");

