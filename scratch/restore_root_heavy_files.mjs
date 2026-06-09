import fs from 'node:fs';
import path from 'node:path';

const backupDir = 'C:\\Users\\dell\\Desktop\\coaching_node_modules_backup\\root_heavy';
if (fs.existsSync(backupDir)) {
  const files = fs.readdirSync(backupDir);
  files.forEach(file => {
    const src = path.join(backupDir, file);
    fs.renameSync(src, file);
    console.log(`Restored root file ${file}`);
  });
}
