import pkg from "pg";
const { Pool } = pkg;

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/coaching_saas";
const pool = new Pool({ connectionString: databaseUrl });

async function run() {
  try {
    const bookId = "book-1780935566823";
    console.log(`Cleaning up questions for book ${bookId} in database...`);
    
    const result = await pool.query(
      "DELETE FROM app_records WHERE collection = $1 AND data ->> $2 = $3",
      ["questions", "bookId", bookId]
    );

    console.log(`Successfully deleted ${result.rowCount} questions.`);
  } catch (err) {
    console.error("Cleanup failed:", err);
  } finally {
    await pool.end();
  }
}

run();
