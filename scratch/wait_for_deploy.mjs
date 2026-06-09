const token = "daeacb06-24eb-4dad-8ac7-685077d4d8e8";
const serviceId = "4c7e3e2e-9b79-424e-8fb9-1c4b29ac3ddd";

const query = `
query getDeployments($serviceId: String!) {
  service(id: $serviceId) {
    deployments {
      edges {
        node {
          id
          status
          createdAt
        }
      }
    }
  }
}
`;

async function check() {
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
  const deployments = data?.data?.service?.deployments?.edges || [];
  if (deployments.length > 0) {
    return deployments[0].node;
  }
  return null;
}

async function run() {
  console.log("Monitoring active deployment...");
  while (true) {
    const node = await check();
    if (!node) {
      console.log("No deployments found.");
      break;
    }
    console.log(`[${new Date().toLocaleTimeString()}] Deployment ID: ${node.id} | Status: ${node.status}`);
    if (node.status !== "BUILDING" && node.status !== "INITIALIZING") {
      console.log(`Finished with status: ${node.status}`);
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}

run();
