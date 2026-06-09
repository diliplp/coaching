import fs from "node:fs";

// Load .env
if (typeof process.loadEnvFile === "function") {
  process.loadEnvFile("backend/.env");
} else {
  const envText = fs.readFileSync("backend/.env", "utf8");
  for (const line of envText.split("\n")) {
    const parts = line.split("=");
    if (parts.length >= 2) {
      const key = parts[0].trim().replace(/^export\s+/, "").replace(/['"]/g, "");
      const value = parts.slice(1).join("=").trim().replace(/['"]/g, "");
      process.env[key] = value;
    }
  }
}

const token = process.env.RAILWAY_TOKEN;
const serviceId = "4c7e3e2e-9b79-424e-8fb9-1c4b29ac3ddd";

const query = `
query getDeployments($serviceId: String!) {
  service(id: $serviceId) {
    deployments {
      edges {
        node {
          id
          status
          meta
          createdAt
        }
      }
    }
  }
}
`;

async function run() {
  try {
    const res = await fetch("https://backboard.railway.app/graphql/v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        query,
        variables: { serviceId }
      })
    });

    const data = await res.json();
    const deployments = data?.data?.service?.deployments?.edges?.map(e => ({
      id: e.node.id,
      status: e.node.status,
      createdAt: e.node.createdAt,
      commitHash: e.node.meta?.commitHash,
      commitMessage: e.node.meta?.commitMessage
    })) || [];
    console.log(JSON.stringify(deployments.slice(0, 5), null, 2));
  } catch (err) {
    console.error("Error fetching deployments:", err);
  }
}

run();
