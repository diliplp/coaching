import fs from "node:fs/promises";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { scriptsRoot, uploadsRoot } from "./paths.js";

const execPromise = promisify(exec);

export async function extractPdfText(filePath: string, runOcr?: boolean) {
  if (runOcr) {
    const defaultPython = process.platform === "win32" ? "python" : "python3";
    const pythonPath = process.env.PDF_PYTHON_PATH || defaultPython;
    const scriptPath = path.join(scriptsRoot, "make_searchable_pdf.py");
    const tempPdfPath = `${filePath}_ocr.pdf`;
    const tempTxtPath = `${filePath}_ocr.txt`;

    try {
      console.log(`Running Python OCR on: ${filePath}`);
      const { stdout, stderr } = await execPromise(`"${pythonPath}" "${scriptPath}" "${filePath}" "${tempPdfPath}" "${tempTxtPath}"`);
      console.log("OCR Stdout:", stdout);
      if (stderr) console.error("OCR Stderr:", stderr);

      // Overwrite the original PDF with the OCR/searchable version
      let activePdfPath = filePath;
      try {
        await fs.unlink(filePath);
        await fs.rename(tempPdfPath, filePath);
      } catch (err: any) {
        console.warn(`[OCR] Could not overwrite original PDF (locked on Windows): ${err.message}. Using temp OCR PDF path: ${tempPdfPath}`);
        activePdfPath = tempPdfPath;
      }
      
      // Clean up text file
      try { await fs.unlink(tempTxtPath); } catch {}

      // Extract page count and text using pdfjs-dist on the newly text-enabled PDF
      const dataBuffer = await fs.readFile(activePdfPath);
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
        fullText += `--- PAGE ${i} ---\n` + pageText + "\n\n";
      }

      const extractedText = fullText.trim();

      // Clean up temp pdf if it was not renamed
      if (activePdfPath === tempPdfPath) {
        try { await fs.unlink(tempPdfPath); } catch {}
      }

      return {
        pageCount,
        extractedText,
        previewText: extractedText.substring(0, 2000),
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
      fullText += `--- PAGE ${i} ---\n` + pageText + "\n\n";
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

export async function extractPdfDiagrams(
  filePath: string,
  bookId: string
): Promise<Array<{ page: number; url: string; bbox: number[] }>> {
  const defaultPython = process.platform === "win32" ? "python" : "python3";
  const pythonPath = process.env.PDF_PYTHON_PATH || defaultPython;
  const scriptPath = path.join(scriptsRoot, "extract_diagrams.py");
  const outputDir = path.join(uploadsRoot, "diagrams");

  try {
    await fs.mkdir(outputDir, { recursive: true });
    console.log(`Running Python diagram extraction on: ${filePath}`);
    const { stdout } = await execPromise(`"${pythonPath}" "${scriptPath}" "${filePath}" "${outputDir}" "${bookId}"`);
    
    const lines = stdout.split("\n");
    const jsonStr = lines.join("\n").trim();
    const startIdx = jsonStr.indexOf("[");
    const endIdx = jsonStr.lastIndexOf("]");
    if (startIdx !== -1 && endIdx !== -1) {
      return JSON.parse(jsonStr.substring(startIdx, endIdx + 1));
    }
    return [];
  } catch (err: any) {
    console.error("Python diagram extraction failed:", err);
    return [];
  }
}

