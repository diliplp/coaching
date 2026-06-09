const baseUrl = "https://coaching.suakshatam.com";
const bookId = "book-1780939156542";

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

    console.log(`Found ${bookQuestions.length} total questions:`);
    bookQuestions.forEach((q, idx) => {
      console.log(`[${idx + 1}] ID: ${q.id}`);
      console.log(`    Prompt: ${q.prompt}`);
    });
  } catch (err) {
    console.error(err);
  }
}

run();
