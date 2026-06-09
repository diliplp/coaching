const token = "daeacb06-24eb-4dad-8ac7-685077d4d8e8";
const deploymentId = "6630b3fc-1514-45ac-8f09-eb1a8d22a36c";

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
        variables: { deploymentId, limit: 100 }
      })
    });

    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error fetching runtime logs:", err);
  }
}

run();
