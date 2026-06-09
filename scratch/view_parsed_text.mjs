const baseUrl = "https://coaching.suakshatam.com";
const bookId = "book-1780937099021";

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

    // Fetch the book detail to get the parsed text
    const bookRes = await fetch(`${baseUrl}/api/subject-books`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const booksData = await bookRes.json();
    const books = booksData.books || [];
    const book = books.find(b => b.id === bookId);

    if (!book) {
      console.log("Book not found!");
      return;
    }

    console.log("Book Title:", book.title);
    const parsedText = book.parsedText || "";
    console.log("Total parsed text length:", parsedText.length);

    const pageDelimiter = /--- PAGE \d+ ---/gi;
    const parts = parsedText.split(pageDelimiter);
    console.log(`Parsed text has ${parts.length} pages.`);

    parts.forEach((p, idx) => {
      console.log(`\n--- PAGE ${idx} (length: ${p.length}) ---`);
      console.log(p.substring(0, 400) + "...");
    });
  } catch (err) {
    console.error(err);
  }
}

run();
