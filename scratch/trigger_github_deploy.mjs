const token = "daeacb06-24eb-4dad-8ac7-685077d4d8e8";
const projectId = "c5bfb0f3-83db-4fc4-bc69-c3df01d18e45";
const environmentId = "e72e9338-eb4b-4f6b-a557-fb351c5198f6";

const mutation = `
mutation githubRepoDeploy($input: GitHubRepoDeployInput!) {
  githubRepoDeploy(input: $input)
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
            repo: "diliplp/coaching",
            branch: "main"
          }
        }
      })
    });

    const text = await res.text();
    console.log("Response status:", res.status);
    console.log("Response text:", text);
  } catch (err) {
    console.error("Error triggering GitHub deploy:", err);
  }
}

run();
