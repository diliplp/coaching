// usage: npx tsx scripts/backfill-question-serials.ts [--commit]
//
// One-off backfill for questions saved before serialNumber existed (see the
// upsertRecord hook in src/data/database.ts, which now assigns one to every NEW
// question automatically). Orders by updated_at ascending so older questions get
// lower numbers, then draws from the same question_serial_seq sequence so backfilled
// and future numbers never collide. Defaults to dry-run; pass --commit to persist.
import { pool, nextQuestionSerial } from "../src/data/database.js";
import type { Question } from "../src/types.js";

const commit = process.argv.includes("--commit");

async function main() {
  const result = await pool.query(
    `SELECT id, data FROM app_records WHERE collection = 'questions' AND data->>'serialNumber' IS NULL ORDER BY updated_at ASC`
  );

  console.log(`Found ${result.rows.length} questions without a serialNumber${commit ? " (COMMIT mode)" : " (dry run)"}...\n`);

  for (const row of result.rows) {
    const q = row.data as Question;
    const serial = commit ? await nextQuestionSerial() : "(preview)";
    console.log(`${q.id} (bookId=${q.bookId ?? "n/a"}, questionNumber=${q.questionNumber ?? "n/a"}) → #${serial}`);

    if (commit) {
      const next = { ...q, serialNumber: serial as number };
      await pool.query(
        `UPDATE app_records SET data = $1::jsonb WHERE collection = 'questions' AND id = $2`,
        [JSON.stringify(next), q.id]
      );
    }
  }

  console.log(`\n${result.rows.length} questions ${commit ? "backfilled" : "would be backfilled"}.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
