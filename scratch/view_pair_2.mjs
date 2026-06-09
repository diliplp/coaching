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

    const match = bookQuestions.filter(q => q.prompt.toLowerCase().includes("vapour pressure of water (in torr)"));
    console.log(`Found ${match.length} matches:`);
    
    match.forEach((q, idx) => {
      console.log(`\n--- MATCH ${idx + 1} ---`);
      console.log(`ID: ${q.id}`);
      console.log(`Prompt: ${q.prompt}`);
      console.log(`Options:`, JSON.stringify(q.options, null, 2));
    });
  } catch (err) {
    console.error(err);
  }
}

run();
