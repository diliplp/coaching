import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { scriptsRoot } from "./paths.js";

const execFileAsync = promisify(execFile);
function getPythonBinary() {
  if (process.env.PDF_PYTHON_PATH) {
    return process.env.PDF_PYTHON_PATH;
  }
  return "python3";
}

export async function extractPdfText(filePath: string) {
  const python = getPythonBinary();
  const scriptPath = path.join(scriptsRoot, "extract_pdf_text.py");
  
  try {
    const { stdout, stderr } = await execFileAsync(python, [scriptPath, filePath]);
    if (stderr) {
      console.warn("Python script stderr:", stderr);
    }
    return JSON.parse(stdout) as {
      pageCount: number;
      extractedText: string;
      previewText: string;
    };
  } catch (err: any) {
    console.error("PDF extraction command failed:", {
      command: `${python} ${scriptPath} ${filePath}`,
      error: err.message,
      stack: err.stack,
      stderr: err.stderr
    });
    throw new Error(`PDF extraction failed: ${err.message}${err.stderr ? " - " + err.stderr : ""}`);
  }
}
