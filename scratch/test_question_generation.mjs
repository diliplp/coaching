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

    // 2. Fetch books
    console.log("Fetching books list...");
    const booksRes = await fetch(`${baseUrl}/api/subject-books`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const booksData = await booksRes.json();
    
    // Flatten subjects to books
    const books = booksData.books || [];

    if (books.length === 0) {
      console.error("No books found to test generation on.");
      return;
    }

    // Sort by uploadedAt descending or find our Test OCR PDF
    const targetBook = books.find(b => b.title === "Test OCR PDF") || books[0];
    console.log(`Using target book: ${targetBook.title} (ID: ${targetBook.id})`);

    // 3. Trigger generation
    console.log("Triggering question generation (this may take up to 30 seconds)...");
    const genRes = await fetch(`${baseUrl}/api/subject-books/${targetBook.id}/generate-questions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        questionCount: 3
      })
    });

    console.log("Status code:", genRes.status);
    const genText = await genRes.text();
    console.log("Response body:", genText);
  } catch (err) {
    console.error("Error in test generation script:", err);
  }
}

run();
