import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const srcDir = 'C:\\Users\\dell\\Desktop\\coaching';
const destDir = 'C:\\Users\\dell\\Desktop\\coaching\\coaching_deploy_tmp';

// Files/folders to copy
const itemsToCopy = [
  'backend',
  'frontend',
  'package.json',
  'package-lock.json',
  'Dockerfile',
  'railway.json',
  'requirements.txt',
  '.dockerignore',
  '.railwayignore',
  'README.md',
  'move_git_out.mjs',
  'move_git_back.mjs'
];

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  
  if (isDirectory) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(childItemName => {
      // Skip node_modules, uploads, or temp deploy folder
      if (childItemName === 'node_modules' || childItemName === 'uploads' || childItemName === 'coaching_deploy_tmp') {
        return;
      }
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

async function run() {
  try {
    // 1. Clean up destDir if exists
    if (fs.existsSync(destDir)) {
      console.log('Cleaning up existing temp directory...');
      fs.rmSync(destDir, { recursive: true, force: true });
    }
    fs.mkdirSync(destDir, { recursive: true });

    // 2. Copy files
    console.log('Copying lightweight files...');
    itemsToCopy.forEach(item => {
      const srcPath = path.join(srcDir, item);
      const destPath = path.join(destDir, item);
      if (fs.existsSync(srcPath)) {
        copyRecursiveSync(srcPath, destPath);
        console.log(`Copied ${item}`);
      }
    });

    // 3. Link and Deploy
    console.log('Initializing empty git repo in temp directory to prevent parent folder scanning...');
    execSync('git init', { cwd: destDir, stdio: 'ignore' });

    console.log('Linking project on Railway...');
    execSync('railway link -e production -p c5bfb0f3-83db-4fc4-bc69-c3df01d18e45 -s 4c7e3e2e-9b79-424e-8fb9-1c4b29ac3ddd', {
      cwd: destDir,
      stdio: 'inherit'
    });

    console.log('Uploading code to Railway...');
    execSync('railway up', {
      cwd: destDir,
      stdio: 'inherit'
    });

    console.log('Deployment upload completed successfully!');
  } catch (err) {
    console.error('Error during deployment:', err);
  } finally {
    // Clean up
    if (fs.existsSync(destDir)) {
      console.log('Cleaning up temp directory...');
      fs.rmSync(destDir, { recursive: true, force: true });
    }
  }
}

run();
