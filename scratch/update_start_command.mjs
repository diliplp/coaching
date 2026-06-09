const token = "daeacb06-24eb-4dad-8ac7-685077d4d8e8";
const environmentId = "e72e9338-eb4b-4f6b-a557-fb351c5198f6";
const serviceId = "4c7e3e2e-9b79-424e-8fb9-1c4b29ac3ddd";

const mutation = `
mutation serviceInstanceUpdate($environmentId: String, $serviceId: String!, $input: ServiceInstanceUpdateInput!) {
  serviceInstanceUpdate(environmentId: $environmentId, serviceId: $serviceId, input: $input)
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
          environmentId,
          serviceId,
          input: {
            startCommand: "LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu:/lib/x86_64-linux-gnu:/usr/local/lib node backend/dist/index.js"
          }
        }
      })
    });

    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error updating service start command:", err);
  }
}

run();
