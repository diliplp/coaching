import fs from "node:fs/promises";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { scriptsRoot } from "./paths.js";

const execPromise = promisify(exec);

export async function extractPdfText(filePath: string, runOcr?: boolean) {
  if (runOcr) {
    const pythonPath = process.env.PDF_PYTHON_PATH || "python3";
    const scriptPath = path.join(scriptsRoot, "make_searchable_pdf.py");
    const tempPdfPath = `${filePath}_ocr.pdf`;
    const tempTxtPath = `${filePath}_ocr.txt`;

    try {
      console.log(`Running Python OCR on: ${filePath}`);
      const { stdout, stderr } = await execPromise(`"${pythonPath}" "${scriptPath}" "${filePath}" "${tempPdfPath}" "${tempTxtPath}"`);
      console.log("OCR Stdout:", stdout);
      if (stderr) console.error("OCR Stderr:", stderr);

      // Overwrite the original PDF with the OCR/searchable version
      await fs.unlink(filePath);
      await fs.rename(tempPdfPath, filePath);

      // Read the extracted text from the output text file
      const extractedText = await fs.readFile(tempTxtPath, "utf-8");
      
      // Clean up text file
      await fs.unlink(tempTxtPath);

      // Extract page count using pdfjs-dist on the newly text-enabled PDF
      const dataBuffer = await fs.readFile(filePath);
      const uint8Array = new Uint8Array(dataBuffer);
      const loadingTask = pdfjs.getDocument({
        data: uint8Array,
        useSystemFonts: true,
        disableFontFace: true,
      });
      const pdfDocument = await loadingTask.promise;
      const pageCount = pdfDocument.numPages;

      return {
        pageCount,
        extractedText: extractedText.trim(),
        previewText: extractedText.trim().substring(0, 2000),
      };
    } catch (err: any) {
      console.error("Python OCR process failed:", err);
      // Clean up temporary files on error if they exist
      try { await fs.unlink(tempPdfPath); } catch {}
      try { await fs.unlink(tempTxtPath); } catch {}
      throw new Error(`OCR processing failed: ${err.message}. Ensure Python, Tesseract-OCR, PyMuPDF, and pypdf are installed.`);
    }
  }

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
