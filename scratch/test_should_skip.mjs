import fs from "node:fs";

function shouldSkipPage(pageText) {
  const lower = pageText.toLowerCase();
  
  if (
    lower.includes("omr answer sheet") || 
    lower.includes("omr sheet") || 
    lower.includes("answer sheet") ||
    lower.includes("bubble sheet") ||
    lower.includes("student name:") ||
    lower.includes("rollnumber:") ||
    (lower.includes("abcd") && lower.includes("oooo"))
  ) {
    return true;
  }

  if (
    lower.includes("universal_queid") || 
    lower.includes("universal_queld") ||
    (lower.match(/qp26/g) || []).length > 5 ||
    (lower.match(/qp25/g) || []).length > 5
  ) {
    return true;
  }

  if (
    lower.includes("explanation :") ||
    lower.includes("explanation:") ||
    lower.includes("ans. (") ||
    lower.includes("ans.(") ||
    lower.includes("ans:") ||
    lower.includes("ans :")
  ) {
    return true;
  }

  if (pageText.trim().length < 100) {
    return true;
  }
  return false;
}

const text = fs.readFileSync("scratch/UnitTest_extracted.txt", "utf8");
const pageDelimiter = /--- PAGE \d+ ---/gi;
const parts = text.split(pageDelimiter);
const pages = parts.map(p => p.trim()).filter(Boolean);

console.log("Total pages found:", pages.length);

pages.forEach((pageText, idx) => {
  const skipped = shouldSkipPage(pageText);
  console.log(`Page ${idx + 1}: length=${pageText.length}, skipped=${skipped}`);
});
