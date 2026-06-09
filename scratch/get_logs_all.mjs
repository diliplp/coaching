const token = "daeacb06-24eb-4dad-8ac7-685077d4d8e8";
const deploymentId = "8601ad66-8fe6-4aa6-afb4-e40b698e75ae";

const query = `
query deploymentLogs($deploymentId: String!, $limit: Int) {
  deploymentLogs(deploymentId: $deploymentId, limit: $limit) {
    timestamp
    message
    severity
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
        variables: { deploymentId, limit: 300 }
      })
    });

    const data = await res.json();
    const logs = data?.data?.deploymentLogs || [];
    // Sort logs by timestamp ascending
    logs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    for (const log of logs) {
      console.log(`[${log.severity}] ${log.message}`);
    }
  } catch (err) {
    console.error("Error fetching logs:", err);
  }
}

run();
