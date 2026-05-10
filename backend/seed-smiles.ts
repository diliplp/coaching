import { upsertRecord, getAppState } from './src/data/database.js';

const dummySmiles = [
  "C", "CC", "CCC", "CCCC", "CC(C)C", "C=C", "C#C", "c1ccccc1", "C1CCCCC1", "CCO",
  "CC(=O)C", "CC(=O)O", "CC(N)C(=O)O", "C[C@@H](Cl)C", "ClC(Cl)C(Cl)Cl", "C=CC=C",
  "c1ccncc1", "c1cc(O)ccc1", "CC(=O)Nc1ccc(O)cc1", "CC(=O)Oc1ccccc1C(=O)O",
  "O=C1CCC(=O)N1", "O=c1[nH]c(=O)n(C)c2cncn12", "C1=CC=C(C=C1)O", "C(C(C(=O)O)N)S",
  "C1C(O1)C"
];

async function seed() {
  const state = await getAppState();
  let subject = state.subjects.find(s => s.name.toLowerCase().includes('chemistry'));
  if (!subject) subject = state.subjects[0];
  
  let topic = state.topics.find(t => t.subjectId === subject.id);
  if (!topic) {
     topic = state.topics[0];
  }

  if (!subject || !topic) {
    console.error("No subject or topic found in database.");
    return;
  }

  console.log(`Using Subject: ${subject.name}, Topic: ${topic.name}`);

  for (let i = 0; i < 25; i++) {
    const smiles = dummySmiles[i];
    const qId = `q-smiles-test-${i}`;
    const options = [
      { id: `opt-${i}-A`, label: "A", value: `[SMILES: ${smiles}]` },
      { id: `opt-${i}-B`, label: "B", value: `[SMILES: ${dummySmiles[(i + 1) % 25]}]` },
      { id: `opt-${i}-C`, label: "C", value: `[SMILES: ${dummySmiles[(i + 2) % 25]}]` },
      { id: `opt-${i}-D`, label: "D", value: `[SMILES: ${dummySmiles[(i + 3) % 25]}]` }
    ];

    const q = {
      id: qId,
      subjectId: subject.id,
      topicId: topic.id,
      type: "single_correct" as const,
      prompt: `Identify the structure or match the property for: [SMILES: ${smiles}]`,
      difficulty: "medium" as const,
      marks: 4,
      negativeMarks: 1,
      correctOptionIds: [`opt-${i}-A`],
      options,
      explanation: `The correct structure is [SMILES: ${smiles}].`
    };

    await upsertRecord("questions", q);
  }

  console.log("Seeded 25 SMILES questions.");
}

seed().catch(console.error);
