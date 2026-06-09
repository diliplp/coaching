const token = "daeacb06-24eb-4dad-8ac7-685077d4d8e8";
const deploymentId = "1119b587-ad2c-4c2d-b404-c969d93ac360";

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
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error fetching build logs:", err);
  }
}

run();
