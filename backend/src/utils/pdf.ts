import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { scriptsRoot } from "./paths.js";

const execFileAsync = promisify(execFile);
const bundledPython =
  "/Users/dilipparmar/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";

function getPythonBinary() {
  if (process.env.PDF_PYTHON_PATH) {
    return process.env.PDF_PYTHON_PATH;
  }

  if (fs.existsSync(bundledPython)) {
    return bundledPython;
  }

  return "python3";
}

export async function extractPdfText(filePath: string) {
  const python = getPythonBinary();
  const scriptPath = path.join(scriptsRoot, "extract_pdf_text.py");
  const { stdout } = await execFileAsync(python, [scriptPath, filePath]);
  return JSON.parse(stdout) as {
    pageCount: number;
    extractedText: string;
    previewText: string;
  };
}
