import fs from "node:fs/promises";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

async function run() {
  try {
    const filePath = "backend/uploads/books/1780918077439-UnitTest_D07-Jun-2026.pdf";
    const dataBuffer = await fs.readFile(filePath);
    const uint8Array = new Uint8Array(dataBuffer);
    
    const loadingTask = pdfjs.getDocument({
      data: uint8Array,
      useSystemFonts: true,
      disableFontFace: true, 
    });
    
    const pdfDocument = await loadingTask.promise;
    console.log(`Total pages: ${pdfDocument.numPages}`);
    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(" ");
      if (pageText.toLowerCase().includes("piston") || pageText.toLowerCase().includes("semipermeable")) {
        console.log(`Found "piston" or "semipermeable" on page: ${i}`);
      }
    }
  } catch (err) {
    console.error(err);
  }
}

run();
