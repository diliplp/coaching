const baseUrl = "https://coaching.suakshatam.com";
const bookId = "book-1780925948069";

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

    // 2. Fetch Questions
    console.log("Fetching questions...");
    const qbRes = await fetch(`${baseUrl}/api/question-bank`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const qbData = await qbRes.json();
    const questions = qbData.questions || [];
    const bookQuestions = questions.filter(q => q.bookId === bookId);

    console.log(`Total questions in database for new book: ${bookQuestions.length}`);
    const q6 = bookQuestions.find(q => q.prompt.toLowerCase().includes("piston") || q.prompt.toLowerCase().includes("figure"));
    
    if (q6) {
      console.log("\nFound Question 6:");
      console.log(JSON.stringify(q6, null, 2));
    }
  } catch (err) {
    console.error(err);
  }
}

run();
