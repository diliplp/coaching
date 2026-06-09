import fs from "node:fs";
import { execSync } from "node:child_process";

try {
  console.log("Running OCR test...");
  const output = execSync("node scratch/test_ocr_api.mjs", { encoding: "utf8" });
  fs.writeFileSync("scratch/test_ocr_output.txt", output);
  console.log("Test execution finished. Output saved to scratch/test_ocr_output.txt");
} catch (err) {
  console.error("Test execution failed.");
  if (err.stdout) {
    fs.writeFileSync("scratch/test_ocr_output.txt", err.stdout);
  }
  if (err.stderr) {
    fs.appendFileSync("scratch/test_ocr_output.txt", "\nSTDERR:\n" + err.stderr);
  }
}
