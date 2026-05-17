import fs from "node:fs/promises";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

export async function extractPdfText(filePath: string) {
  try {
    const dataBuffer = await fs.readFile(filePath);
    const uint8Array = new Uint8Array(dataBuffer);
    
    const loadingTask = pdfjs.getDocument({
      data: uint8Array,
      useSystemFonts: true,
      disableFontFace: true, 
    });
    
    const pdfDocument = await loadingTask.promise;
    const pageCount = pdfDocument.numPages;
    let fullText = "";

    for (let i = 1; i <= pageCount; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ");
      fullText += pageText + "\n\n";
    }

    const extractedText = fullText.trim();
    const previewText = extractedText.substring(0, 2000);

    return {
      pageCount,
      extractedText,
      previewText,
    };
  } catch (err: any) {
    console.error("PDF extraction failed:", err);
    throw new Error(`PDF extraction failed: ${err.message}`);
  }
}
