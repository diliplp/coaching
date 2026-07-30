// usage: npx tsx scripts/fix-math-delimiters.ts [--commit] [--limit=N]
//
// Re-runs every stored question's prompt/options/explanation through the same
// ensureMathDelimited()/hasUndelimitedLatex() logic the generation pipelines now use
// (backend/src/utils/ai-generator.ts), so questions saved before that fix (raw "x^2",
// "H_2O", "sqrt(x)" showing as literal text) get the same $...$ wrapping retroactively.
// Defaults to dry-run: prints a diff summary and writes nothing. Pass --commit to persist.
import { pool } from "../src/data/database.js";
import { ensureMathDelimited, hasUndelimitedLatex } from "../src/utils/ai-generator.js";
import type { Question } from "../src/types.js";

const commit = process.argv.includes("--commit");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;

function fixQuestion(q: Question): { changed: boolean; next: Question; fields: string[] } {
  const fields: string[] = [];

  const nextPrompt = ensureMathDelimited(q.prompt || "", false);
  if (nextPrompt !== q.prompt) fields.push("prompt");

  const nextExplanation = ensureMathDelimited(q.explanation || "", false);
  if (nextExplanation !== (q.explanation || "")) fields.push("explanation");

  let optionsChanged = false;
  const nextOptions = (q.options || []).map((opt) => {
    const nextValue = ensureMathDelimited(opt.value || "");
    if (nextValue !== opt.value) optionsChanged = true;
    return { ...opt, value: nextValue };
  });
  if (optionsChanged) fields.push("options");

  const stillFlagged =
    hasUndelimitedLatex(nextPrompt) || hasUndelimitedLatex(nextExplanation);
  const existingFlags = (q.qaFlags || []).filter((f) => f !== "undelimited_latex");
  const nextFlags = stillFlagged ? [...existingFlags, "undelimited_latex"] : existingFlags;
  const flagsChanged = JSON.stringify(nextFlags) !== JSON.stringify(q.qaFlags || []);
  if (flagsChanged) fields.push("qaFlags");

  const changed = fields.length > 0;
  const next: Question = {
    ...q,
    prompt: nextPrompt,
    explanation: nextExplanation,
    options: nextOptions,
    qaFlags: nextFlags.length > 0 ? nextFlags : undefined
  };
  return { changed, next, fields };
}

async function main() {
  const result = await pool.query(
    `SELECT id, data FROM app_records WHERE collection = 'questions' ORDER BY updated_at DESC${
      limit ? " LIMIT $1" : ""
    }`,
    limit ? [limit] : []
  );

  console.log(`Scanning ${result.rows.length} questions${commit ? " (COMMIT mode)" : " (dry run)"}...\n`);

  let changedCount = 0;
  const fieldCounts: Record<string, number> = {};

  for (const row of result.rows) {
    const q = row.data as Question;
    const { changed, next, fields } = fixQuestion(q);
    if (!changed) continue;

    changedCount++;
    for (const f of fields) fieldCounts[f] = (fieldCounts[f] || 0) + 1;

    console.log(`--- ${q.id} (bookId=${q.bookId ?? "n/a"}) fields=[${fields.join(", ")}]`);
    if (fields.includes("prompt")) {
      console.log(`  prompt before: ${JSON.stringify(q.prompt).slice(0, 160)}`);
      console.log(`  prompt after:  ${JSON.stringify(next.prompt).slice(0, 160)}`);
    }
    if (fields.includes("explanation")) {
      console.log(`  explanation before: ${JSON.stringify(q.explanation).slice(0, 160)}`);
      console.log(`  explanation after:  ${JSON.stringify(next.explanation).slice(0, 160)}`);
    }
    if (fields.includes("options")) {
      for (let i = 0; i < (q.options || []).length; i++) {
        const before = q.options[i]?.value;
        const after = next.options[i]?.value;
        if (before !== after) {
          console.log(`  option[${i}] before: ${JSON.stringify(before)}`);
          console.log(`  option[${i}] after:  ${JSON.stringify(after)}`);
        }
      }
    }
    if (fields.includes("qaFlags")) {
      console.log(`  qaFlags before: ${JSON.stringify(q.qaFlags || [])}`);
      console.log(`  qaFlags after:  ${JSON.stringify(next.qaFlags || [])}`);
    }

    if (commit) {
      await pool.query(
        `UPDATE app_records SET data = $1::jsonb, updated_at = NOW() WHERE collection = 'questions' AND id = $2`,
        [JSON.stringify(next), q.id]
      );
    }
  }

  console.log(`\n${changedCount} of ${result.rows.length} questions ${commit ? "updated" : "would be updated"}.`);
  console.log("By field:", fieldCounts);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
