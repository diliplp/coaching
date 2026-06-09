const url = "https://coaching.suakshatam.com/uploads/diagrams/book-1780977881603_p9_d1.png";

async function run() {
  try {
    const res = await fetch(url, { method: "HEAD" });
    console.log(`Status: ${res.status} | Content-Type: ${res.headers.get("content-type")}`);
  } catch (err) {
    console.error(err);
  }
}

run();
