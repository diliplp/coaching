const baseUrl = "https://coaching.suakshatam.com";
const bookId = "book-1780939156542";

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

    // 2. Fetch question bank
    console.log("Fetching question bank...");
    const qbRes = await fetch(`${baseUrl}/api/question-bank`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const qbData = await qbRes.json();
    const questions = qbData.questions || [];
    const bookQuestions = questions.filter(q => q.bookId === bookId);

    console.log(`\nTotal questions extracted so far for book ${bookId}: ${bookQuestions.length}`);
    if (bookQuestions.length > 0) {
      console.log("\nSample questions:");
      bookQuestions.forEach((q, index) => {
        console.log(`\n[${index + 1}] ID: ${q.id}`);
        console.log(`Prompt: ${q.prompt.substring(0, 150)}...`);
        console.log(`Diagram URLs:`, q.diagrams || q.metadata?.diagrams || q.metadata?.diagramUrls || "None");
      });
    }
  } catch (err) {
    console.error("Failed to check questions:", err);
  }
}

run();
