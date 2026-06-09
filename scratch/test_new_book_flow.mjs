import fs from "node:fs";
import path from "node:path";

const baseUrl = "https://coaching.suakshatam.com";
const filePath = "backend/uploads/books/1780918077439-UnitTest_D07-Jun-2026.pdf";
const subjectId = "sub-1778814775832";

async function run() {
  try {
    // 1. Login
    console.log("Logging in...");
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin@coaching.local",
        password: "admin123"
      })
    });
    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log("Logged in successfully.");

    // 2. Upload Book
    console.log("Uploading PDF as a new book...");
    const fileBuffer = fs.readFileSync(filePath);
    const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
    
    // Construct multipart form-data body manually to avoid external dependencies
    const parts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="subjectId"\r\n\r\n${subjectId}\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nChemistry MCQ Live Test\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="bookType"\r\n\r\nreference\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="ocr"\r\n\r\nfalse\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="pdf"; filename="UnitTest_D07-Jun-2026.pdf"\r\nContent-Type: application/pdf\r\n\r\n`
    ];

    const bodyBuffer = Buffer.concat([
      Buffer.from(parts[0]),
      Buffer.from(parts[1]),
      Buffer.from(parts[2]),
      Buffer.from(parts[3]),
      Buffer.from(parts[4]),
      fileBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const uploadRes = await fetch(`${baseUrl}/api/subject-books`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`
      },
      body: bodyBuffer
    });

    if (!uploadRes.ok) {
      throw new Error(`Upload failed: ${await uploadRes.text()}`);
    }

    const book = await uploadRes.json();
    console.log(`Uploaded book successfully. ID: ${book.id}`);

    // 3. Trigger extraction
    console.log(`Triggering question & diagram extraction for book ${book.id} (this will take 30-60s)...`);
    const extractRes = await fetch(`${baseUrl}/api/subject-books/${book.id}/extract-mcq-questions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });

    if (!extractRes.ok) {
      throw new Error(`Extraction failed: ${await extractRes.text()}`);
    }

    const extractData = await extractRes.json();
    console.log("Extraction Completed:", extractData);

    // 4. Verify questions and diagrams in Question Bank
    console.log("Fetching question bank to verify...");
    const qbRes = await fetch(`${baseUrl}/api/question-bank`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const qbData = await qbRes.json();
    const questions = qbData.questions || [];
    const bookQuestions = questions.filter(q => q.bookId === book.id);

    console.log(`Total questions extracted for new book: ${bookQuestions.length}`);
    const q6 = bookQuestions.find(q => q.prompt.toLowerCase().includes("piston") || q.prompt.toLowerCase().includes("figure"));
    
    if (q6) {
      console.log("\nFound Question 6 in the database:");
      console.log(JSON.stringify(q6, null, 2));
    } else {
      console.log("\nQuestion 6 was not found for the new book.");
    }

  } catch (err) {
    console.error("Test failed:", err);
  }
}

run();
