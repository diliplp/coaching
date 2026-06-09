import fs from "node:fs";

const text = fs.readFileSync("scratch/UnitTest_extracted.txt", "utf8");
const pages = text.split("--- PAGE ");
pages.forEach((pageContent, pageIdx) => {
  if (pageIdx === 3) {
    console.log(`=== PAGE ${pageIdx} ===`);
    console.log(pageContent);
  }
});

