import pg from "pg";
const { Client } = pg;

const connectionString = "postgresql://postgres:Gsecl%409988@127.0.0.1:5432/coaching_saas";

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    // 1. Update first question: que-pdf-1780824194294-7-hftf
    const res1 = await client.query(
      "SELECT data FROM app_records WHERE collection = 'questions' AND id = 'que-pdf-1780824194294-7-hftf'"
    );
    if (res1.rows.length > 0) {
      const data = res1.rows[0].data;
      data.options = [
        { id: "opt-1", label: "A", value: "$\\text{K}_2\\text{SO}_4 \\cdot \\text{Al}_2(\\text{SO}_4)_3 \\cdot 24\\text{H}_2\\text{O}$" },
        { id: "opt-2", label: "B", value: "$\\text{K}_2\\text{SO}_4 \\cdot \\text{Al}_2(\\text{SO}_4)_4 \\cdot 24\\text{H}_2\\text{O}$" },
        { id: "opt-3", label: "C", value: "$\\text{K}_2\\text{SO}_4 \\cdot \\text{Al}_2(\\text{SO}_4)_3 \\cdot 12\\text{H}_2\\text{O}$" },
        { id: "opt-4", label: "D", value: "$\\text{K}_2\\text{SO}_4 \\cdot \\text{Al}(\\text{SO}_4)_3 \\cdot 12\\text{H}_2\\text{O}$" }
      ];
      data.correctOptionIds = ["opt-1"];
      data.explanation = "Potash alum is a double sulfate salt of potassium and aluminum with the formula $\\text{K}_2\\text{SO}_4 \\cdot \\text{Al}_2(\\text{SO}_4)_3 \\cdot 24\\text{H}_2\\text{O}$.";
      
      await client.query(
        "UPDATE app_records SET data = $1::jsonb WHERE collection = 'questions' AND id = 'que-pdf-1780824194294-7-hftf'",
        [JSON.stringify(data)]
      );
      console.log("Updated first potash alum question.");
    }

    // 2. Update second question: que-pdf-1780838982158-7-kjnz
    const res2 = await client.query(
      "SELECT data FROM app_records WHERE collection = 'questions' AND id = 'que-pdf-1780838982158-7-kjnz'"
    );
    if (res2.rows.length > 0) {
      const data = res2.rows[0].data;
      data.options = [
        { id: "opt-1", label: "A", value: "$\\text{KAl}(\\text{SO}_4)_2 \\cdot 24\\text{H}_2\\text{O}$" },
        { id: "opt-2", label: "B", value: "$\\text{K}_2\\text{SO}_4 \\cdot \\text{Al}_2(\\text{SO}_4)_3 \\cdot 24\\text{H}_2\\text{O}$" },
        { id: "opt-3", label: "C", value: "$\\text{K}_2\\text{SO}_4 \\cdot \\text{Al}(\\text{SO}_4)_3 \\cdot 12\\text{H}_2\\text{O}$" },
        { id: "opt-4", label: "D", value: "$\\text{K}_2\\text{SO}_4 \\cdot \\text{Al}_2(\\text{SO}_4)_3 \\cdot 12\\text{H}_2\\text{O}$" }
      ];
      data.correctOptionIds = ["opt-2"];
      data.explanation = "Potash alum is potassium aluminum sulfate dodecahydrate $\\text{KAl}(\\text{SO}_4)_2 \\cdot 12\\text{H}_2\\text{O}$, which is equivalently represented in its double salt form as $\\text{K}_2\\text{SO}_4 \\cdot \\text{Al}_2(\\text{SO}_4)_3 \\cdot 24\\text{H}_2\\text{O}$.";
      
      await client.query(
        "UPDATE app_records SET data = $1::jsonb WHERE collection = 'questions' AND id = 'que-pdf-1780838982158-7-kjnz'",
        [JSON.stringify(data)]
      );
      console.log("Updated second potash alum question.");
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
