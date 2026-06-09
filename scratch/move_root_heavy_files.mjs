import fs from 'node:fs';
import path from 'node:path';

const backupDir = 'C:\\Users\\dell\\Desktop\\coaching_node_modules_backup\\root_heavy';
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const rootFiles = fs.readdirSync('.');
rootFiles.forEach(file => {
  const ext = path.extname(file).toLowerCase();
  if (['.pdf', '.docx', '.pptx', '.png', '.jpeg', '.jpg'].includes(ext)) {
    const dest = path.join(backupDir, file);
    fs.renameSync(file, dest);
    console.log(`Moved root file ${file} to ${dest}`);
  }
});
