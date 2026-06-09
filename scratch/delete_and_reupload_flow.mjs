import fs from "node:fs";
import path from "node:path";

const baseUrl = "https://coaching.suakshatam.com";

async function run() {
  try {
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

    // Fetch existing books to clean them up
    console.log("Fetching existing books...");
    const bookRes = await fetch(`${baseUrl}/api/subject-books`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const booksData = await bookRes.json();
    const books = booksData.books || [];

    for (const book of books) {
      console.log(`Deleting existing book ${book.id} (${book.title})...`);
      const delRes = await fetch(`${baseUrl}/api/subject-books/${book.id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      console.log(`Deleted. Status: ${delRes.status}`);
    }

    // Get a valid subjectId to upload to
    const subjects = booksData.subjects || [];
    if (subjects.length === 0) {
      console.error("No subjects found to attach the book to.");
      return;
    }
    const subjectId = subjects[0].id;
    console.log(`Using Subject: ${subjects[0].name} (ID: ${subjectId})`);

    const filePath = "UnitTest_D07-Jun-2026.pdf";
    const fileBuffer = fs.readFileSync(filePath);
    const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
    
    const parts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="subjectId"\r\n\r\n${subjectId}\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nChemistry MCQ Live Test\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="bookType"\r\n\r\nreference\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="ocr"\r\n\r\ntrue\r\n`,
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

    const newBook = await uploadRes.json();
    console.log(`Uploaded book successfully. ID: ${newBook.id}`);

    // Trigger MCQ questions extraction
    console.log(`Triggering question & diagram extraction for book ${newBook.id}...`);
    const extractRes = await fetch(`${baseUrl}/api/subject-books/${newBook.id}/extract-mcq-questions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        topicIds: []
      })
    });
    const extractResult = await extractRes.json();
    console.log("Extraction Triggered:", extractResult);
    console.log("\nNew Book ID to query is:", newBook.id);
  } catch (err) {
    console.error("Error in flow:", err);
  }
}

run();
