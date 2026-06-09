import fs from "node:fs";

const text = fs.readFileSync("scratch/UnitTest_extracted.txt", "utf8");
const pageDelimiter = /--- PAGE \d+ ---/gi;
const pages = text.split(pageDelimiter).map(p => p.trim()).filter(Boolean);

console.log(`Total pages: ${pages.length}`);
pages.forEach((p, idx) => {
  console.log(`\n=== PAGE ${idx + 1} (length: ${p.length}) ===`);
  console.log(p.substring(0, 150));
});
