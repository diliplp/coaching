import fetch from "node-fetch";

async function main() {
  const url = "http://localhost:3030/api/questions/q-ai-1780812744511-0-1";
  
  const loginRes = await fetch("http://localhost:3030/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@coaching.local", password: "admin123" })
  });
  
  const { token } = await loginRes.json();

  const getRes = await fetch("http://localhost:3030/api/question-bank", {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const data = await getRes.json();
  const currentQ = data.questions.find(q => q.id === "q-ai-1780812744511-0-1");

  const restoredPayload = {
    ...currentQ,
    prompt: currentQ.prompt.replace(" (Edited)", "")
  };

  await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(restoredPayload)
  });
  console.log("Restored original question prompt.");
}

main().catch(console.error);
