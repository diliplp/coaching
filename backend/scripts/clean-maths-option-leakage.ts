import { pool, upsertRecord } from "../src/data/database.js";
import type { Question } from "../src/types.js";

async function cleanMathsOptions() {
  console.log("Cleaning Maths option leakages...");
  const { rows } = await pool.query("SELECT id, data FROM app_records WHERE collection='questions' AND (data->>'subjectId' LIKE '%math%')");

  let fixedCount = 0;
  for (const r of rows) {
    const q = r.data as Question;
    let changed = false;

    if (q.options && Array.isArray(q.options)) {
      for (const opt of q.options) {
        let val = opt.value || "";
        if (val.length > 80 || val.includes("\n") || val.includes("Ans") || val.includes("---") || val.includes("If from") || val.includes("In a certain") || val.includes("In a town") || val.includes("A point moves")) {
          // Keep only the first line or first formula part before question text
          let cleanVal = val.split("\n")[0].trim();
          cleanVal = cleanVal.replace(/--- PAGE BREAK ---/g, "").trim();
          cleanVal = cleanVal.replace(/\s*Ans\s*\.\s*:?\s*\(?\s*[a-d]\s*\)?\s*/gi, "").trim();

          // Cut off if question preamble was attached
          const cutIdx = cleanVal.search(/(If\s+|In\s+|A\s+point|Suppose|Which|Consider|Boys\s+and|The\s+equation|Sliding|Sliding\s+contact)/i);
          if (cutIdx > 0) {
            cleanVal = cleanVal.substring(0, cutIdx).trim();
          }

          if (cleanVal !== val) {
            opt.value = cleanVal || val;
            changed = true;
          }
        }
      }
    }

    if (changed) {
      await upsertRecord("questions", q);
      fixedCount++;
    }
  }

  console.log(`Cleaned ${fixedCount} Maths questions with option leakages.`);
  await pool.end();
}

cleanMathsOptions().catch(err => {
  console.error(err);
  process.exit(1);
});
