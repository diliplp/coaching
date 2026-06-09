const token = "daeacb06-24eb-4dad-8ac7-685077d4d8e8";
const deploymentId = "528b1e83-c4e2-4592-9d2c-822d158597ed";

const query = `
query deployment($id: String!) {
  deployment(id: $id) {
    id
    status
    meta
    createdAt
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
        variables: { id: deploymentId }
      })
    });

    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error fetching deployment:", err);
  }
}

run();
