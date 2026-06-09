import fs from "node:fs";
import { extractPdfText } from "../backend/dist/utils/pdf.js";

async function run() {
  try {
    const pdfPath = "UnitTest_D07-Jun-2026.pdf";
    console.log("Extracting text from:", pdfPath);
    const result = await extractPdfText(pdfPath, true); // ocr=true
    fs.writeFileSync("scratch/local_extracted_text.txt", result.extractedText);
    console.log("Successfully extracted text. Length:", result.extractedText.length);
  } catch (err) {
    console.error(err);
  }
}

run();
