const token = "daeacb06-24eb-4dad-8ac7-685077d4d8e8";
const serviceId = "4c7e3e2e-9b79-424e-8fb9-1c4b29ac3ddd";
const environmentId = "e72e9338-eb4b-4f6b-a557-fb351c5198f6";
const commitSha = "7d673f9ce3687659b0f0c9b51fd226a1a53276f9";

const mutation = `
mutation serviceInstanceDeployV2($environmentId: String!, $serviceId: String!, $commitSha: String) {
  serviceInstanceDeployV2(environmentId: $environmentId, serviceId: $serviceId, commitSha: $commitSha)
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
        query: mutation,
        variables: { 
          serviceId, 
          environmentId,
          commitSha
        }
      })
    });

    const text = await res.text();
    console.log("Response status:", res.status);
    console.log("Response text:", text.substring(0, 1000));
  } catch (err) {
    console.error("Error triggering redeployment:", err);
  }
}

run();
