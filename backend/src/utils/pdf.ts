import fs from "node:fs/promises";
import * as pdf from "pdf-parse";

export async function extractPdfText(filePath: string) {
  try {
    const dataBuffer = await fs.readFile(filePath);
    const data = await pdf(dataBuffer);

    const extractedText = data.text.trim();
    const previewText = extractedText.substring(0, 2000);
    
    return {
      pageCount: data.numpages,
      extractedText,
      previewText,
    };
  } catch (err: any) {
    console.error("PDF extraction failed with pdf-parse:", err);
    throw new Error(`PDF extraction failed: ${err.message}`);
  }
}
