async function run() {
  const baseUrl = "https://coaching-saas-production-7fba.up.railway.app";
  try {
    // 1. Login to get token
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
    if (!loginData.token) {
      console.error("Login failed:", loginData);
      return;
    }

    console.log("Login successful. Fetching debug-env...");

    // 2. Fetch debug-env with Bearer token
    const debugRes = await fetch(`${baseUrl}/api/debug-env`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${loginData.token}`
      }
    });

    const debugText = await debugRes.text();
    console.log("Raw Response from /api/debug-env:\n", debugText);
    try {
      const debugData = JSON.parse(debugText);
      console.log("Parsed JSON:\n", JSON.stringify(debugData, null, 2));
    } catch (e) {
      console.log("Failed to parse response as JSON:", e.message);
    }
  } catch (err) {
    console.error("Error fetching debug-env:", err);
  }
}

run();
