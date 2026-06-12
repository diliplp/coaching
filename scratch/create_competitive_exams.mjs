// Create JEE and NEET competitive exams from extracted questions
// Run AFTER upload_and_extract_papers.mjs completes extraction
// Run: node scratch/create_competitive_exams.mjs [local|prod]

import fs from "node:fs";

const env = process.argv[2] || "prod";
const BASE_URL = env === "local"
  ? "http://localhost:3030/api"
  : "https://coaching-saas-production-7fba.up.railway.app/api";

const ids = JSON.parse(fs.readFileSync("scratch/competitive_ids.json", "utf8"));

async function login() {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@coaching.local", password: "admin123" })
  });
  const data = await res.json();
  if (!data.token) throw new Error("Login failed: " + JSON.stringify(data));
  return data.token;
}

async function checkQuestionCounts(token) {
  const res = await fetch(`${BASE_URL}/question-bank`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();

  const counts = {};
  for (const [key, subjectId] of Object.entries(ids.subjects)) {
    counts[key] = data.questions.filter(q => q.subjectId === subjectId).length;
  }
  return counts;
}

async function createExam(token, payload) {
  const res = await fetch(`${BASE_URL}/exams/create-competitive`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Exam creation failed: ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  const token = await login();
  console.log("Logged in.\n");

  // Check available question counts
  console.log("Checking question counts per subject...");
  const counts = await checkQuestionCounts(token);
  console.log("Question counts:", counts);

  // Validate we have enough questions
  const jeeNeeds = { jeePhysics: 25, jeeChemistry: 25, jeeMaths: 25 };
  const neetNeeds = { neetPhysics: 45, neetChemistry: 45, neetBiology: 90 };

  let ok = true;
  for (const [key, needed] of Object.entries({ ...jeeNeeds, ...neetNeeds })) {
    if ((counts[key] || 0) < needed) {
      console.error(`  [WARNING] ${key}: need ${needed}, have ${counts[key] || 0} — extraction may still be running`);
      ok = false;
    }
  }

  if (!ok) {
    const proceed = process.argv[3] === "--force";
    if (!proceed) {
      console.log("\nSome subjects don't have enough questions yet.");
      console.log("Wait for extraction to finish and re-run, or use --force to create with available questions.");
      process.exit(1);
    }
    console.log("\n--force passed, proceeding anyway...");
  }

  // Create JEE exam
  console.log("\nCreating JEE exam...");
  try {
    const jeeResult = await createExam(token, {
      name: "JEE Main 2024 — Full Paper",
      durationMinutes: 180,
      classId: ids.classId,
      streamId: ids.jeeStreamId,
      sections: [
        { subjectId: ids.subjects.jeePhysics,   questionCount: 25, label: "Physics" },
        { subjectId: ids.subjects.jeeChemistry,  questionCount: 25, label: "Chemistry" },
        { subjectId: ids.subjects.jeeMaths,      questionCount: 25, label: "Mathematics" },
      ]
    });
    console.log(`  JEE exam created! id=${jeeResult.exam.id}, questions=${jeeResult.questions.length}`);
  } catch (err) {
    console.error("  [ERROR] JEE:", err.message);
  }

  // Create NEET exam
  console.log("\nCreating NEET exam...");
  try {
    const neetResult = await createExam(token, {
      name: "NEET 2024 — Full Paper",
      durationMinutes: 180,
      classId: ids.classId,
      streamId: ids.neetStreamId,
      sections: [
        { subjectId: ids.subjects.neetPhysics,   questionCount: 45, label: "Physics" },
        { subjectId: ids.subjects.neetChemistry,  questionCount: 45, label: "Chemistry" },
        { subjectId: ids.subjects.neetBiology,   questionCount: 90, label: "Biology" },
      ]
    });
    console.log(`  NEET exam created! id=${neetResult.exam.id}, questions=${neetResult.questions.length}`);
  } catch (err) {
    console.error("  [ERROR] NEET:", err.message);
  }

  console.log("\nDone! Exams are now live and visible in the Exams list.");
}

main().catch(e => { console.error(e); process.exit(1); });
