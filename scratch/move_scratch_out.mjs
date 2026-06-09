import fs from 'node:fs';
import path from 'node:path';

const backupDir = 'C:\\Users\\dell\\Desktop\\coaching_node_modules_backup';
const fullPath = path.resolve('scratch');
if (fs.existsSync(fullPath)) {
  const destPath = path.join(backupDir, 'scratch');
  if (fs.existsSync(destPath)) {
    fs.rmSync(destPath, { recursive: true, force: true });
  }
  fs.renameSync(fullPath, destPath);
  console.log(`Moved scratch to ${destPath}`);
} else {
  console.log(`scratch does not exist`);
}
