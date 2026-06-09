import fs from "node:fs";

const text = fs.readFileSync("scratch/UnitTest_extracted.txt", "utf8");
const pages = text.split(/--- PAGE \d+ ---/gi).map(p => p.trim()).filter(Boolean);

console.log(`Total parsed pages: ${pages.length}`);

for (let i = 0; i < 3; i++) {
  console.log(`\n--- PAGE ${i + 1} ---`);
  const lines = pages[i].split("\n");
  lines.forEach(line => {
    const match = line.match(/^(\d+)\./);
    if (match) {
      console.log(`Question Number: ${match[1]} | Line: ${line.substring(0, 80)}`);
    }
  });
}
