const token = "daeacb06-24eb-4dad-8ac7-685077d4d8e8";

const query = `
query introspectVolumeMutations {
  __schema {
    mutationType {
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
    const fields = data.data.__schema.mutationType.fields.filter(f => f.name.toLowerCase().includes("volume"));
    console.log(JSON.stringify(fields, null, 2));
  } catch (err) {
    console.error("Error introspecting volume mutations:", err);
  }
}

run();
