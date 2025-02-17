const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, 'images');
const targetDir = path.join(__dirname, 'public', 'images');

if (!fs.existsSync(sourceDir)) {
  console.error('Source images directory does not exist');
  process.exit(1);
}

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

fs.readdir(sourceDir, (err, files) => {
  if (err) {
    console.error('Error reading source directory:', err);
    return;
  }

  files.forEach(file => {
    const sourceFile = path.join(sourceDir, file);
    const targetFile = path.join(targetDir, file);
    
    fs.copyFile(sourceFile, targetFile, err => {
      if (err) {
        console.error(`Error copying ${file}:`, err);
      } else {
        console.log(`Copied ${file}`);
      }
    });
  });
});
