import fs from "node:fs";

const baseUrl = "https://coaching.suakshatam.com";
const bookId = "book-1780977881603";

async function run() {
  try {
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

    const qbRes = await fetch(`${baseUrl}/api/question-bank`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const qbData = await qbRes.json();
    const questions = qbData.questions || [];
    const bookQuestions = questions.filter(q => q.bookId === bookId);

    console.log(`Total questions for ${bookId}: ${bookQuestions.length}`);
    const withImages = bookQuestions.filter(q => q.prompt.includes("IMAGE:"));
    console.log(`Questions with images: ${withImages.length}`);
    withImages.forEach((q, idx) => {
      console.log(`\n[${idx + 1}] Question Prompt: ${q.prompt}`);
    });
  } catch (err) {
    console.error(err);
  }
}

run();
