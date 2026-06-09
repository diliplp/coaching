const token = "daeacb06-24eb-4dad-8ac7-685077d4d8e8";
const deploymentId = "0aa2a9ef-867f-43f6-9045-31a90afabd13";

const query = `
query buildLogs($deploymentId: String!) {
  buildLogs(deploymentId: $deploymentId) {
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
        variables: { deploymentId }
      })
    });

    const data = await res.json();
    const logs = data?.data?.buildLogs || [];
    console.log(`Logs count: ${logs.length}`);
    for (let i = 0; i < Math.min(logs.length, 30); i++) {
      const log = logs[i];
      console.log(`[${log.severity}] ${log.message}`);
    }
  } catch (err) {
    console.error("Error fetching build logs:", err);
  }
}

run();
