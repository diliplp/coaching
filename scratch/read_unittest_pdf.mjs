import fs from "node:fs/promises";
import * as pdfjs from "../node_modules/pdfjs-dist/legacy/build/pdf.mjs";

async function extract() {
  try {
    const filePath = "c:/Users/dell/Desktop/coaching/UnitTest_D07-Jun-2026.pdf";
    const dataBuffer = await fs.readFile(filePath);
    const uint8Array = new Uint8Array(dataBuffer);
    
    const loadingTask = pdfjs.getDocument({
      data: uint8Array,
      useSystemFonts: true,
      disableFontFace: true,
    });
    
    const pdfDocument = await loadingTask.promise;
    console.log("Total Pages:", pdfDocument.numPages);
    
    let fullText = "";
    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(" ");
      fullText += `--- PAGE ${i} ---\n` + pageText + "\n\n";
    }
    
    await fs.writeFile("c:/Users/dell/Desktop/coaching/scratch/UnitTest_extracted.txt", fullText, "utf-8");
    console.log("Extraction complete. Written to scratch/UnitTest_extracted.txt");
  } catch (err) {
    console.error("Extraction error:", err);
  }
}

extract();
