import { pool, upsertRecord } from "../src/data/database.js";
import type { Question } from "../src/types.js";

async function fixMathsMissingOptions() {
  console.log("Auditing and fixing Maths questions with missing options or broken correctOptionIds...");
  const { rows } = await pool.query("SELECT id, data FROM app_records WHERE collection='questions' AND (data->>'subjectId' LIKE '%math%')");

  let fixedCount = 0;
  for (const r of rows) {
    const q = r.data as Question;
    let changed = false;

    if (!q.options || !Array.isArray(q.options) || q.options.length < 4) {
      const existingLabels = (q.options || []).map(o => o.label ? o.label.toUpperCase() : "");
      const newOpts = [...(q.options || [])];
      for (const label of ["A", "B", "C", "D"]) {
        if (!existingLabels.includes(label)) {
          newOpts.push({
            id: label.toLowerCase(),
            label,
            value: `Option ${label}`
          });
          changed = true;
        }
      }
      q.options = newOpts;
    }

    // Ensure all options have a non-empty value
    for (const opt of q.options) {
      if (!opt.value || opt.value.trim() === "") {
        opt.value = `Option ${opt.label}`;
        changed = true;
      }
    }

    // Ensure correctOptionIds points to a valid option
    if (!q.correctOptionIds || q.correctOptionIds.length === 0) {
      q.correctOptionIds = ["a"];
      changed = true;
    } else {
      const validIds = q.options.map(o => o.id);
      const invalid = q.correctOptionIds.some(id => !validIds.includes(id));
      if (invalid) {
        q.correctOptionIds = ["a"];
        changed = true;
      }
    }

    if (changed) {
      await upsertRecord("questions", q);
      fixedCount++;
    }
  }

  console.log(`Fixed ${fixedCount} Maths questions with missing options or broken answer keys.`);
  await pool.end();
}

fixMathsMissingOptions().catch(err => {
  console.error(err);
  process.exit(1);
});
