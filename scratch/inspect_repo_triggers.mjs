const token = "daeacb06-24eb-4dad-8ac7-685077d4d8e8";
const serviceId = "4c7e3e2e-9b79-424e-8fb9-1c4b29ac3ddd";

const query = `
query getRepoTriggers($serviceId: String!) {
  service(id: $serviceId) {
    repoTriggers {
      edges {
        node {
          id
          branch
          projectId
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
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error fetching repo triggers:", err);
  }
}

run();
