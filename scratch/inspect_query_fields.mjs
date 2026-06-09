const token = "daeacb06-24eb-4dad-8ac7-685077d4d8e8";

const query = `
query introspectQueryFields {
  __type(name: "Query") {
    name
    fields {
      name
      args {
        name
        type {
          name
          kind
          ofType {
            name
            kind
          }
        }
      }
      type {
        name
        kind
        ofType {
          name
          kind
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
      body: JSON.stringify({ query })
    });

    const data = await res.json();
    const buildLogsField = data.data.__type.fields.find(f => f.name === "buildLogs");
    console.log(JSON.stringify(buildLogsField, null, 2));
  } catch (err) {
    console.error("Error introspecting Query fields:", err);
  }
}

run();
