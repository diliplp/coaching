import fs from "node:fs";

try {
  const raw = fs.readFileSync("scratch/failed_json_raw.json", "utf8");
  const repaired = fs.readFileSync("scratch/failed_json_repaired.json", "utf8");
  
  console.log("Raw length:", raw.length);
  console.log("Repaired length:", repaired.length);
  
  const pos = 11699;
  console.log("\n=== CONTEXT AROUND FAILED POSITION IN REPAIRED ===");
  console.log(repaired.substring(pos - 150, pos + 150));
} catch (e) {
  console.error(e);
}
