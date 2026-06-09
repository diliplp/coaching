const baseUrl = "https://coaching.suakshatam.com";

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

    // 2. Fetch subject books
    console.log("Fetching books...");
    const booksRes = await fetch(`${baseUrl}/api/subject-books`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const booksData = await booksRes.json();
    
    const relevant = booksData.books.map(b => ({
      id: b.id,
      title: b.title,
      fileName: b.fileName,
      fileUrl: b.fileUrl,
      pageCount: b.pageCount,
      uploadedAt: b.uploadedAt
    })).filter(b => b.title.toLowerCase().includes("chemistry") || b.fileName.toLowerCase().includes("unittest") || b.pageCount < 30);

    console.log("Filtered Books:");
    console.log(JSON.stringify(relevant, null, 2));
  } catch (err) {
    console.error(err);
  }
}

run();
