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
    console.log(JSON.stringify(data.data.service.deployments.edges[0], null, 2));
  } catch (err) {
    console.error("Error fetching deployment details:", err);
  }
}

run();
