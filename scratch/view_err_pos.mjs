import fs from "node:fs";

function repairJsonString(raw) {
  let inString = false;
  let result = "";
  let i = 0;
  
  while (i < raw.length) {
    const char = raw[i];
    
    if (char === '"') {
      let backslashCount = 0;
      let j = i - 1;
      while (j >= 0 && raw[j] === '\\') {
        backslashCount++;
        j--;
      }
      
      if (backslashCount % 2 === 0) {
        inString = !inString;
      }
      result += char;
      i++;
    } else if (inString && char === '\\') {
      const nextChar = raw[i + 1] || "";
      let isValidEscape = false;
      if (['"', '\\', '/', 'b', 'f', 'n', 'r', 't'].includes(nextChar)) {
        isValidEscape = true;
      } else if (nextChar === 'u') {
        const hex = raw.substring(i + 2, i + 6);
        if (hex.length === 4 && /^[0-9a-fA-F]{4}$/.test(hex)) {
          isValidEscape = true;
        }
      }
      
      if (isValidEscape) {
        result += char + nextChar;
        i += 2;
      } else {
        result += '\\\\';
        i++;
      }
    } else {
      result += char;
      i++;
    }
  }
  return result;
}

const raw = fs.readFileSync("scratch/raw_response.txt", "utf8");
let jsonStr = raw;
const startIdx = jsonStr.indexOf("{");
const endIdx = jsonStr.lastIndexOf("}");
if (startIdx !== -1 && endIdx !== -1) {
  jsonStr = jsonStr.substring(startIdx, endIdx + 1);
}

const repaired = repairJsonString(jsonStr);
console.log("Repaired length:", repaired.length);
console.log("\n=== END OF REPAIRED ===");
console.log(repaired.substring(repaired.length - 200));

const pos = 36964;
console.log("\n=== CONTEXT AROUND ERROR POS ===");
console.log(repaired.substring(pos - 100, pos + 100));
