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

    console.log("Fetching questions from question bank...");
    const qBankRes = await fetch(`${baseUrl}/api/question-bank`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const qBankData = await qBankRes.json();
    const questions = qBankData.questions || [];
    
    // Find questions with images
    const imgQuestions = questions.filter(q => q.prompt.includes("[IMAGE:"));
    console.log(`\nTotal questions: ${questions.length}`);
    console.log(`Questions with [IMAGE:]: ${imgQuestions.length}`);
    
    imgQuestions.forEach((q, i) => {
      console.log(`\n[Image Question ${i + 1}] ID: ${q.id}`);
      console.log(`Prompt: ${q.prompt}`);
    });
  } catch (err) {
    console.error(err);
  }
}

run();
