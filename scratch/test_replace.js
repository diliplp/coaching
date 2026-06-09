const content = `const { stdout, stderr } = await execPromise(\`"\${pythonPath}" "\${scriptPath}" "\${filePath}" "\${tempPdfPath}" "\${tempTxtPath}"\`);`;
console.log("Original content:", content);

// Let's test the replacement we did in update_start_command_with_patch
const targetStr = 'execPromise(\`\"';
console.log("Target string character codes:", [...targetStr].map(c => c.charCodeAt(0)));

const replaced = content.replace('execPromise(\`\"', 'execPromise(\`LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu:/lib/x86_64-linux-gnu \"');
console.log("Replaced:", replaced);
console.log("Success?", replaced !== content);
