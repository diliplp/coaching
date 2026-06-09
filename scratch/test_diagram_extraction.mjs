import { execSync } from "child_process";

try {
  const pdfPath = "backend/uploads/books/1780973231956-UnitTest_D07-Jun-2026.pdf";
  const outputDir = "scratch/diagrams_test";
  const cmd = `python backend/scripts/extract_diagrams.py "${pdfPath}" "${outputDir}" "book-test"`;
  console.log("Running:", cmd);
  const out = execSync(cmd, { encoding: "utf8" });
    console.log("Output:");
    const parsed = JSON.parse(out.substring(out.indexOf("[")));
    console.log(JSON.stringify(parsed.filter(d => d.page === 1), null, 2));
} catch (err) {
  console.error(err);
}
