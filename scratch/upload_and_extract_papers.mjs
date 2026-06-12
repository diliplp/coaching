// Upload PDFs from papers/ folder and trigger MCQ extraction
// Run AFTER seed_competitive_curriculum.mjs
// Run: node scratch/upload_and_extract_papers.mjs [local|prod]

import fs from "node:fs";
import path from "node:path";

const env = process.argv[2] || "prod";
const BASE_URL = env === "local"
  ? "http://localhost:3030/api"
  : "https://coaching-saas-production-7fba.up.railway.app/api";

const ids = JSON.parse(fs.readFileSync("scratch/competitive_ids.json", "utf8"));

// Map each question PDF to its subject key
// useVision: true → send PDF to Gemini Vision for accurate subscript/superscript extraction
const PAPERS = [
  { file: "12th_jee_physics.pdf",     subjectKey: "jeePhysics",    title: "JEE Physics 2024",    bookType: "pyq", useVision: true },
  { file: "12th JEE Chemistry.pdf",   subjectKey: "jeeChemistry",  title: "JEE Chemistry 2024",  bookType: "pyq", useVision: true },
  { file: "12th jee maths.pdf",       subjectKey: "jeeMaths",      title: "JEE Mathematics 2024",bookType: "pyq", useVision: true },
  { file: "12th_neet_physics.pdf",    subjectKey: "neetPhysics",   title: "NEET Physics 2024",   bookType: "pyq", useVision: true },
  { file: "12th_neet_chemistry.pdf",  subjectKey: "neetChemistry", title: "NEET Chemistry 2024", bookType: "pyq", useVision: true },
  { file: "12_neet_biology.pdf",      subjectKey: "neetBiology",   title: "NEET Biology 2024",   bookType: "pyq", useVision: false },
];

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

async function uploadBook(token, filePath, subjectId, title, bookType) {
  const form = new FormData();
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: "application/pdf" });
  form.append("pdf", blob, path.basename(filePath));
  form.append("subjectId", subjectId);
  form.append("title", title);
  form.append("bookType", bookType);

  const res = await fetch(`${BASE_URL}/subject-books`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Upload failed: ${JSON.stringify(data)}`);
  return data;
}

async function triggerExtraction(token, bookId, topicId, useVision = false) {
  const res = await fetch(`${BASE_URL}/subject-books/${bookId}/extract-mcq-questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ topicId, useVision })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Extraction trigger failed: ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  const token = await login();
  console.log("Logged in.\n");

  const results = [];

  for (const paper of PAPERS) {
    const filePath = path.join("papers", paper.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`  [SKIP] File not found: ${filePath}`);
      continue;
    }

    const subjectId = ids.subjects[paper.subjectKey];
    const topicId = ids.topics[paper.subjectKey];

    if (!subjectId || !topicId) {
      console.error(`  [ERROR] No subject/topic ID for key: ${paper.subjectKey}. Run seed script first.`);
      continue;
    }

    console.log(`Uploading: ${paper.file} → subject=${subjectId}`);
    try {
      const book = await uploadBook(token, filePath, subjectId, paper.title, paper.bookType);
      console.log(`  Uploaded book id=${book.id}`);

      console.log(`  Triggering extraction (topicId=${topicId}, useVision=${paper.useVision})...`);
      const extractResult = await triggerExtraction(token, book.id, topicId, paper.useVision);
      console.log(`  Extraction started: ${extractResult.message || JSON.stringify(extractResult)}`);
      results.push({ file: paper.file, bookId: book.id, subjectKey: paper.subjectKey, status: "extraction_triggered", useVision: paper.useVision });
    } catch (err) {
      console.error(`  [ERROR] ${err.message}`);
      results.push({ file: paper.file, subjectKey: paper.subjectKey, status: "error", error: err.message });
    }

    // Small delay between uploads to avoid overwhelming the server
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log("\n=== Upload Summary ===");
  console.table(results);
  console.log("\nNote: Extraction runs in background. Wait ~5-10 min per PDF before creating exams.");
  console.log("Check question counts: GET /api/question-bank");
}

main().catch(e => { console.error(e); process.exit(1); });
