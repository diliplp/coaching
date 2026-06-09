const url = "https://coaching.suakshatam.com/uploads/diagrams/book-1780979417876_p9_d1.png";

async function run() {
  try {
    console.log(`Checking image URL: ${url}`);
    const res = await fetch(url, { method: "HEAD" });
    console.log(`Status: ${res.status} ${res.statusText}`);
    console.log(`Content-Type: ${res.headers.get("content-type")}`);
    console.log(`Content-Length: ${res.headers.get("content-length")}`);
  } catch (err) {
    console.error("Failed to fetch image:", err);
  }
}

run();
