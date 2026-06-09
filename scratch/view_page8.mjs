import fs from "node:fs";

const text = fs.readFileSync("scratch/UnitTest_extracted.txt", "utf8");
const pageDelimiter = /--- PAGE \d+ ---/gi;
const pages = text.split(pageDelimiter).map(p => p.trim()).filter(Boolean);

console.log("=== PAGE 8 ===");
console.log(pages[7]); // index 7 is Page 8
