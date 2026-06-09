const token = "daeacb06-24eb-4dad-8ac7-685077d4d8e8";
const serviceId = "4c7e3e2e-9b79-424e-8fb9-1c4b29ac3ddd";

const query = `
query deployments($serviceId: String!) {
  deployments(input: { serviceId: $serviceId }) {
    edges {
      node {
        id
        status
        createdAt
      }
    }
  }
}
`;

async function run() {
  while (true) {
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

      const body = await res.json();
      const deployment = body?.data?.deployments?.edges?.[0]?.node;
      if (!deployment) {
        console.log("No deployments found.");
        break;
      }

      console.log(`[${new Date().toISOString()}] Deployment ${deployment.id}: ${deployment.status}`);
      if (deployment.status !== "BUILDING" && deployment.status !== "INITIALIZING" && deployment.status !== "REMOVING" && deployment.status !== "DEPLOYING") {
        console.log(`Finished with status: ${deployment.status}`);
        break;
      }
    } catch (e) {
      console.error("Fetch failed:", e);
    }
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}

run();
