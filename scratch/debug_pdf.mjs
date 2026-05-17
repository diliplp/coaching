import fs from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// Use absolute path for safety
const pdfjs = require("c:/Users/dell/Desktop/coaching/backend/node_modules/pdfjs-dist/legacy/build/pdf.js");

async function test() {
  try {
    const filePath = "c:/Users/dell/Desktop/coaching/1. Classification and Nomenclature of Organic Compounds.pdf";
    const dataBuffer = await fs.readFile(filePath);
    const uint8Array = new Uint8Array(dataBuffer);
    
    const loadingTask = pdfjs.getDocument({
      data: uint8Array,
      useSystemFonts: true,
      disableFontFace: true,
    });
    
    const pdfDocument = await loadingTask.promise;
    console.log("Pages:", pdfDocument.numPages);
    
    const page = await pdfDocument.getPage(1);
    const textContent = await page.getTextContent();
    console.log("Item count:", textContent.items.length);
    console.log("Items:", textContent.items.slice(0, 10).map(i => i.str));
  } catch (err) {
    console.error(err);
  }
}

test();
