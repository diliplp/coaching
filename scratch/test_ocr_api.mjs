import fs from "node:fs";
import path from "node:path";

const baseUrl = "https://coaching.suakshatam.com";

async function run() {
  try {
    // 1. Login to get token
    console.log("Logging in as admin...");
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin@coaching.local",
        password: "admin123"
      })
    });

    const loginData = await loginRes.json();
    if (!loginData.token) {
      console.error("Login failed:", loginData);
      return;
    }

    const token = loginData.token;
    console.log("Login successful. Fetching subjects...");

    // 2. Fetch subject books to get a valid subject ID
    const booksRes = await fetch(`${baseUrl}/api/subject-books`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const booksData = await booksRes.json();
    const subjects = booksData.subjects || [];
    if (subjects.length === 0) {
      console.error("No subjects found to attach the book to.");
      return;
    }

    const subjectId = subjects[0].id;
    console.log(`Using subject: ${subjects[0].name} (ID: ${subjectId})`);

    // 3. Upload Sample.pdf with OCR
    console.log("Uploading Sample.pdf with OCR = true (this may take a few seconds)...");
    const pdfPath = "Sample.pdf";
    const fileBuffer = fs.readFileSync(pdfPath);
    const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
    
    // Construct raw multipart body manually since Node 18 fetch supports FormData but manual construct is extremely robust
    const parts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="subjectId"\r\n\r\n${subjectId}\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nTest OCR PDF\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="bookType"\r\n\r\nreference\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="ocr"\r\n\r\ntrue\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="pdf"; filename="Sample.pdf"\r\nContent-Type: application/pdf\r\n\r\n`
    ];

    const partBuffers = parts.map(p => Buffer.from(p));
    const closingBuffer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const bodyBuffer = Buffer.concat([
      partBuffers[0],
      partBuffers[1],
      partBuffers[2],
      partBuffers[3],
      partBuffers[4],
      fileBuffer,
      closingBuffer
    ]);

    const uploadRes = await fetch(`${baseUrl}/api/subject-books`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`
      },
      body: bodyBuffer
    });

    const uploadText = await uploadRes.text();
    console.log("Upload response status:", uploadRes.status);
    console.log("Upload response body:\n", uploadText);
  } catch (err) {
    console.error("Error in OCR test script:", err);
  }
}

run();
