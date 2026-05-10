import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { seedData, type AppStore } from "./seed-data.js";
import type { UserAccount } from "../types.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/coaching_saas";

export const pool = new Pool({
  connectionString: databaseUrl
});

type RecordWithId = { id: string };

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_records (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (collection, id)
    )
  `);
}

async function countCollection(collection: string) {
  const result = await pool.query(
    "SELECT COUNT(*)::int AS count FROM app_records WHERE collection = $1",
    [collection]
  );
  return result.rows[0]?.count ?? 0;
}

export async function listRecords<T>(collection: string): Promise<T[]> {
  const result = await pool.query(
    "SELECT data FROM app_records WHERE collection = $1 ORDER BY updated_at DESC, id ASC",
    [collection]
  );
  return result.rows.map((row) => row.data as T);
}

export async function findRecordByField<T>(
  collection: string,
  field: string,
  value: string
): Promise<T | null> {
  const result = await pool.query(
    `
      SELECT data
      FROM app_records
      WHERE collection = $1
        AND data ->> $2 = $3
      LIMIT 1
    `,
    [collection, field, value]
  );
  return (result.rows[0]?.data as T | undefined) ?? null;
}

export async function getRecord<T>(collection: string, id: string): Promise<T | null> {
  const result = await pool.query(
    "SELECT data FROM app_records WHERE collection = $1 AND id = $2",
    [collection, id]
  );
  return (result.rows[0]?.data as T | undefined) ?? null;
}

export async function upsertRecord<T extends RecordWithId>(collection: string, data: T) {
  await pool.query(
    `
      INSERT INTO app_records (collection, id, data, updated_at)
      VALUES ($1, $2, $3::jsonb, NOW())
      ON CONFLICT (collection, id)
      DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    `,
    [collection, data.id, JSON.stringify(data)]
  );
}

export async function deleteRecord(collection: string, id: string) {
  await pool.query(
    "DELETE FROM app_records WHERE collection = $1 AND id = $2",
    [collection, id]
  );
}

async function seedCollection<T extends RecordWithId>(collection: string, records: T[]) {
  for (const record of records) {
    await upsertRecord(collection, record);
  }
}

async function seedUsers() {
  const passwordsByEmail: Record<string, string> = {
    "admin@coaching.local": "admin123",
    "teacher@coaching.local": "teacher123",
    "student@coaching.local": "student123"
  };

  const usersWithHashes = await Promise.all(
    seedData.users.map(async (user) => ({
      ...user,
      passwordHash: await bcrypt.hash(passwordsByEmail[user.email], 10)
    }))
  );

  await seedCollection<UserAccount>("users", usersWithHashes);
}

async function seedIfEmpty() {
  await seedCollection("classes", seedData.classes);
  await seedCollection("streams", seedData.streams);
  await seedCollection("batches", seedData.batches);
  await seedCollection("students", seedData.students);
  await seedCollection("subjects", seedData.subjects);
  await seedCollection("chapters", seedData.chapters);
  await seedCollection("topics", seedData.topics);
  await seedCollection("questions", seedData.questions);
  await seedCollection("blueprints", seedData.blueprints);
  if ((await countCollection("users")) === 0) {
    await seedUsers();
  }
}

export async function initDatabase() {
  await ensureSchema();
  await seedIfEmpty();
}

export async function getAppState(): Promise<AppStore> {
  const [
    classes,
    streams,
    batches,
    students,
    subjects,
    subjectBooks,
    chapters,
    topics,
    questions,
    blueprints,
    exams,
    submissions,
    users
  ] = await Promise.all([
    listRecords<AppStore["classes"][number]>("classes"),
    listRecords<AppStore["streams"][number]>("streams"),
    listRecords<AppStore["batches"][number]>("batches"),
    listRecords<AppStore["students"][number]>("students"),
    listRecords<AppStore["subjects"][number]>("subjects"),
    listRecords<AppStore["subjectBooks"][number]>("subjectBooks"),
    listRecords<AppStore["chapters"][number]>("chapters"),
    listRecords<AppStore["topics"][number]>("topics"),
    listRecords<AppStore["questions"][number]>("questions"),
    listRecords<AppStore["blueprints"][number]>("blueprints"),
    listRecords<AppStore["exams"][number]>("exams"),
    listRecords<AppStore["submissions"][number]>("submissions"),
    listRecords<AppStore["users"][number]>("users")
  ]);

  return {
    classes,
    streams,
    batches,
    students,
    subjects,
    subjectBooks,
    chapters,
    topics,
    questions,
    blueprints,
    exams,
    submissions,
    users
  };
}
