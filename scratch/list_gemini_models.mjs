const keys = {
  primary: "AIzaSyAd6YxCJL1XUrBg2cCO0iGC3CuF7RTvyHo",
  backup: "AIzaSyDcTUQjyb-eA7MVfEiyzCMSVyY_yw3dV9s"
};

async function checkModels(keyName, key) {
  try {
    console.log(`Checking models for ${keyName}...`);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    const data = await res.json();
    if (data.models) {
      console.log(`${keyName} has access to ${data.models.length} models:`);
      data.models.forEach(m => {
        console.log(` - Name: ${m.name}, Supported Actions: ${m.supportedGenerationMethods.join(', ')}`);
      });
    } else {
      console.error(`${keyName} failed:`, data);
    }
  } catch (err) {
    console.error(`Error checking ${keyName}:`, err);
  }
}

async function run() {
  await checkModels("Primary Key", keys.primary);
  console.log("\n--------------------\n");
  await checkModels("Backup Key", keys.backup);
}

run();
