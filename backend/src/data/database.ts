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

let schemaEnsured = false;

export async function ensureSchema() {
  if (schemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_records (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (collection, id)
    )
  `);
  await pool.query(`CREATE SEQUENCE IF NOT EXISTS question_serial_seq`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_app_records_collection ON app_records (collection)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_app_records_subject_id ON app_records ((data->>'subjectId')) WHERE collection = 'questions'`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_app_records_topic_id ON app_records ((data->>'topicId')) WHERE collection = 'questions'`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_app_records_difficulty ON app_records ((data->>'difficulty')) WHERE collection = 'questions'`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_app_records_book_id ON app_records ((data->>'bookId')) WHERE collection = 'questions'`);
  schemaEnsured = true;
}

export interface QuestionBankQueryParams {
  page?: number;
  limit?: number;
  subjectId?: string;
  chapterId?: string;
  topicId?: string;
  difficulty?: string;
  tag?: string;
  sourceType?: string;
  bookId?: string;
  search?: string;
}

export async function queryPaginatedQuestions(
  params: QuestionBankQueryParams,
  topicsList: Array<{ id: string; chapterId: string }>
) {
  await ensureSchema();

  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
  const offset = (page - 1) * limit;

  const conditions: string[] = ["collection = 'questions'"];
  const values: any[] = [];
  let paramIdx = 1;

  if (params.subjectId) {
    conditions.push(`data->>'subjectId' = $${paramIdx++}`);
    values.push(params.subjectId);
  }

  if (params.topicId) {
    conditions.push(`data->>'topicId' = $${paramIdx++}`);
    values.push(params.topicId);
  } else if (params.chapterId) {
    const topicIds = topicsList.filter(t => t.chapterId === params.chapterId).map(t => t.id);
    if (topicIds.length > 0) {
      conditions.push(`data->>'topicId' = ANY($${paramIdx++})`);
      values.push(topicIds);
    } else {
      conditions.push("1 = 0");
    }
  }

  if (params.difficulty) {
    conditions.push(`data->>'difficulty' = $${paramIdx++}`);
    values.push(params.difficulty);
  }

  if (params.sourceType) {
    conditions.push(`data->>'sourceType' = $${paramIdx++}`);
    values.push(params.sourceType);
  }

  if (params.bookId) {
    conditions.push(`data->>'bookId' = $${paramIdx++}`);
    values.push(params.bookId);
  }

  if (params.tag) {
    conditions.push(`data->'tags' @> jsonb_build_array($${paramIdx++})`);
    values.push(params.tag);
  }

  if (params.search && params.search.trim()) {
    const s = params.search.trim();
    conditions.push(`(data->>'prompt' ILIKE '%' || $${paramIdx} || '%' OR data->>'id' ILIKE '%' || $${paramIdx} || '%' OR data->>'serialNumber' = $${paramIdx})`);
    values.push(s);
    paramIdx++;
  }

  const whereClause = conditions.join(" AND ");

  const countSql = `SELECT COUNT(*)::int AS count FROM app_records WHERE ${whereClause}`;
  const countResult = await pool.query(countSql, values);
  const totalCount = countResult.rows[0]?.count ?? 0;

  const dataSql = `
    SELECT data
    FROM app_records
    WHERE ${whereClause}
    ORDER BY updated_at DESC, id ASC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
  `;
  const dataValues = [...values, limit, offset];
  const dataResult = await pool.query(dataSql, dataValues);
  const questions = dataResult.rows.map(r => r.data);

  return {
    questions,
    totalCount,
    page,
    limit,
    totalPages: Math.ceil(totalCount / limit) || 1
  };
}

export async function nextQuestionSerial(): Promise<number> {
  await ensureSchema();
  const result = await pool.query(`SELECT nextval('question_serial_seq') AS n`);
  return Number(result.rows[0].n);
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
  // Assign a serial once, on first save, and never again — edits (which re-upsert the
  // same id with serialNumber already set) must keep the original number so it stays a
  // stable reference, not a re-issued one.
  if (collection === "questions" && (data as any).serialNumber == null) {
    (data as any).serialNumber = await nextQuestionSerial();
  }
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
  if ((await countCollection("classes")) === 0) await seedCollection("classes", seedData.classes);
  if ((await countCollection("streams")) === 0) await seedCollection("streams", seedData.streams);
  if ((await countCollection("batches")) === 0) await seedCollection("batches", seedData.batches);
  if ((await countCollection("students")) === 0) await seedCollection("students", seedData.students);
  if ((await countCollection("subjects")) === 0) await seedCollection("subjects", seedData.subjects);
  if ((await countCollection("chapters")) === 0) await seedCollection("chapters", seedData.chapters);
  if ((await countCollection("topics")) === 0) await seedCollection("topics", seedData.topics);
  if ((await countCollection("questions")) === 0) await seedCollection("questions", seedData.questions);
  if ((await countCollection("blueprints")) === 0) await seedCollection("blueprints", seedData.blueprints);
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
