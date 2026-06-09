const token = "daeacb06-24eb-4dad-8ac7-685077d4d8e8";
const projectId = "c5bfb0f3-83db-4fc4-bc69-c3df01d18e45";
const environmentId = "e72e9338-eb4b-4f6b-a557-fb351c5198f6";
const serviceId = "4c7e3e2e-9b79-424e-8fb9-1c4b29ac3ddd";

const mutation = `
mutation variableUpsert($input: VariableUpsertInput!) {
  variableUpsert(input: $input)
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
          input: {
            projectId,
            environmentId,
            serviceId,
            name: "NIXPACKS_RUN_APT_PKGS",
            value: "libstdc++6 tesseract-ocr tesseract-ocr-eng",
            skipDeploys: false
          }
        }
      })
    });

    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error upserting runtime packages variable:", err);
  }
}

run();
