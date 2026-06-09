async function run() {
  try {
    const res = await fetch("https://api.github.com/repos/diliplp/coaching/commits", {
      headers: {
        "User-Agent": "node-fetch"
      }
    });
    const json = await res.json();
    if (!Array.isArray(json)) {
      console.log("Response:", json);
      return;
    }
    const commits = json.slice(0, 5).map(c => ({
      sha: c.sha,
      message: c.commit.message,
      date: c.commit.author.date
    }));
    console.log(JSON.stringify(commits, null, 2));
  } catch (err) {
    console.error("Error fetching commits:", err);
  }
}
run();
