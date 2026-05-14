import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { scriptsRoot } from "./paths.js";

const execPromise = promisify(exec);

export async function parseCurriculumDocx(filePath: string) {
  const scriptPath = path.join(scriptsRoot, "extract_docx_curriculum.py");
  const pythonPath = process.env.PDF_PYTHON_PATH || "python3";
  
  try {
    const { stdout, stderr } = await execPromise(`"${pythonPath}" "${scriptPath}" "${filePath}"`);
    if (stderr && !stdout) {
      throw new Error(stderr);
    }
    return JSON.parse(stdout);
  } catch (error: any) {
    console.error("Error parsing docx curriculum:", error);
    // Fallback if python3 fails, try 'python'
    if (error.message.includes("not found") || error.message.includes("is not recognized")) {
       const { stdout } = await execPromise(`python "${scriptPath}" "${filePath}"`);
       return JSON.parse(stdout);
    }
    throw error;
  }
}
