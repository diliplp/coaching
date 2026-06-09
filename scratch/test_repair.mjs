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

async function run() {
  try {
    const raw = fs.readFileSync("scratch/raw_response.txt", "utf8");
    let jsonStr = raw;
    const startIdx = jsonStr.indexOf("{");
    const endIdx = jsonStr.lastIndexOf("}");
    if (startIdx !== -1 && endIdx !== -1) {
      jsonStr = jsonStr.substring(startIdx, endIdx + 1);
    }

    console.log("Repairing JSON...");
    const repaired = repairJsonString(jsonStr);
    
    console.log("Parsing repaired JSON...");
    try {
      const parsed = JSON.parse(repaired);
      console.log(`Success! Parsed ${parsed.questions?.length} questions.`);
      
      // Print the prompt of question 6 (index 5)
      if (parsed.questions && parsed.questions[5]) {
        console.log("\n--- QUESTION 6 ---");
        console.log(JSON.stringify(parsed.questions[5], null, 2));
      }
    } catch (parseErr) {
      console.error("Repaired JSON.parse failed:", parseErr.message);
      const match = parseErr.message.match(/position (\d+)/);
      if (match) {
        const pos = parseInt(match[1], 10);
        console.error("Error context in repaired string:");
        console.error(repaired.substring(Math.max(0, pos - 50), Math.min(repaired.length, pos + 50)));
      }
    }
  } catch (err) {
    console.error("Repair test failed:", err);
  }
}

run();
