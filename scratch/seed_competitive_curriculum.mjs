// Seed JEE and NEET curriculum structure: class, streams, subjects, chapters, topics
// Run: node scratch/seed_competitive_curriculum.mjs [local|prod]

const env = process.argv[2] || "prod";
const BASE_URL = env === "local"
  ? "http://localhost:3030/api"
  : "https://coaching-saas-production-7fba.up.railway.app/api";

async function login() {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@coaching.local", password: "admin123" })
  });
  const data = await res.json();
  if (!data.token) throw new Error("Login failed: " + JSON.stringify(data));
  console.log("Logged in as", data.user.email);
  return data.token;
}

async function post(token, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`POST ${path} failed: ${JSON.stringify(data)}`);
  return data;
}

async function getAll(token, path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.json();
}

async function findOrCreate(token, listPath, createPath, match, createBody) {
  const items = await getAll(token, listPath);
  const existing = items.find(match);
  if (existing) {
    console.log(`  [exists] ${JSON.stringify(createBody)}`);
    return existing;
  }
  const created = await post(token, createPath, createBody);
  console.log(`  [created] id=${created.id} ${JSON.stringify(createBody)}`);
  return created;
}

async function main() {
  const token = await login();

  // 1. Class: "12th"
  console.log("\n--- Class ---");
  const cls = await findOrCreate(
    token,
    "/admin/classes",
    "/admin/classes",
    c => c.name === "12th",
    { name: "12th" }
  );

  // 2. Streams
  console.log("\n--- Streams ---");
  const jeeStream = await findOrCreate(
    token,
    "/admin/streams",
    "/admin/streams",
    s => s.name === "JEE" && s.classId === cls.id,
    { name: "JEE", classId: cls.id }
  );
  const neetStream = await findOrCreate(
    token,
    "/admin/streams",
    "/admin/streams",
    s => s.name === "NEET" && s.classId === cls.id,
    { name: "NEET", classId: cls.id }
  );

  // 3. Subjects
  console.log("\n--- Subjects ---");
  const subjects = {
    jeePhysics: await findOrCreate(token, "/admin/subjects", "/admin/subjects",
      s => s.name === "Physics" && s.streamId === jeeStream.id,
      { name: "Physics", classId: cls.id, streamId: jeeStream.id }),
    jeeChemistry: await findOrCreate(token, "/admin/subjects", "/admin/subjects",
      s => s.name === "Chemistry" && s.streamId === jeeStream.id,
      { name: "Chemistry", classId: cls.id, streamId: jeeStream.id }),
    jeeMaths: await findOrCreate(token, "/admin/subjects", "/admin/subjects",
      s => s.name === "Mathematics" && s.streamId === jeeStream.id,
      { name: "Mathematics", classId: cls.id, streamId: jeeStream.id }),
    neetPhysics: await findOrCreate(token, "/admin/subjects", "/admin/subjects",
      s => s.name === "Physics" && s.streamId === neetStream.id,
      { name: "Physics", classId: cls.id, streamId: neetStream.id }),
    neetChemistry: await findOrCreate(token, "/admin/subjects", "/admin/subjects",
      s => s.name === "Chemistry" && s.streamId === neetStream.id,
      { name: "Chemistry", classId: cls.id, streamId: neetStream.id }),
    neetBiology: await findOrCreate(token, "/admin/subjects", "/admin/subjects",
      s => s.name === "Biology" && s.streamId === neetStream.id,
      { name: "Biology", classId: cls.id, streamId: neetStream.id }),
  };

  // 4. Chapters
  console.log("\n--- Chapters ---");
  const chapters = {};
  for (const [key, subject] of Object.entries(subjects)) {
    const name = `${subject.name} Questions`;
    chapters[key] = await findOrCreate(token, "/admin/chapters", "/admin/chapters",
      c => c.name === name && c.subjectId === subject.id,
      { name, subjectId: subject.id });
  }

  // 5. Topics
  console.log("\n--- Topics ---");
  const topics = {};
  for (const [key, chapter] of Object.entries(chapters)) {
    const subject = subjects[key];
    const name = `${subject.name} PYQ`;
    topics[key] = await findOrCreate(token, "/admin/topics", "/admin/topics",
      t => t.name === name && t.chapterId === chapter.id,
      { name, subjectId: subject.id, chapterId: chapter.id });
  }

  console.log("\n=== Curriculum created! Subject IDs: ===");
  for (const [key, subject] of Object.entries(subjects)) {
    console.log(`  ${key}: ${subject.id}  (topic: ${topics[key].id})`);
  }

  // Save IDs for use by other scripts
  import("node:fs").then(fs => {
    fs.writeFileSync("scratch/competitive_ids.json", JSON.stringify({
      classId: cls.id,
      jeeStreamId: jeeStream.id,
      neetStreamId: neetStream.id,
      subjects: Object.fromEntries(Object.entries(subjects).map(([k, v]) => [k, v.id])),
      topics: Object.fromEntries(Object.entries(topics).map(([k, v]) => [k, v.id])),
    }, null, 2));
    console.log("\nSaved to scratch/competitive_ids.json");
  });
}

main().catch(e => { console.error(e); process.exit(1); });
