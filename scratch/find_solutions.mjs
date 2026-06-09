import fs from "node:fs";

const text = fs.readFileSync("scratch/UnitTest_extracted.txt", "utf8");
const lines = text.split("\n");

function find(term) {
  console.log(`\nSearching for "${term}":`);
  lines.forEach((line, idx) => {
    if (line.toLowerCase().includes(term.toLowerCase())) {
      console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
  });
}

find("sucrose");
find("72 gm");
find("342 gm");
