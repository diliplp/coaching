const baseUrl = "https://coaching.suakshatam.com";

async function run() {
  try {
    // 1. Login
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
    const token = loginData.token;
    console.log("Login successful.");

    // 2. Trigger extraction on the real chemistry MCQ book
    const targetBookId = "book-1780911377357";
    console.log(`Using target book ID: ${targetBookId}`);

    // 3. Trigger extraction
    console.log("Triggering question extraction (this may take up to 90 seconds due to live Gemini calls)...");
    const extractRes = await fetch(`${baseUrl}/api/subject-books/${targetBookId}/extract-mcq-questions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    console.log("Status code:", extractRes.status);
    const extractText = await extractRes.text();
    console.log("Response body:", extractText);
  } catch (err) {
    console.error("Error in test extraction script:", err);
  }
}

run();
