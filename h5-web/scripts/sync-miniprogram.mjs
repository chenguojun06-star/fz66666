import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const miniappRoot = path.join(projectRoot, 'miniprogram');
const outputRoot = path.join(projectRoot, 'h5-web', 'source-miniapp');
const publicMirrorRoot = path.join(projectRoot, 'h5-web', 'public', 'source-miniapp');

const copyEntries = [
  'app.js',
  'app.json',
  'app.wxss',
  'config.js',
  'pages',
  'components',
  'utils',
  'styles',
  'assets',
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function removeDirContent(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return;
  }
  for (const entry of fs.readdirSync(dirPath)) {
    fs.rmSync(path.join(dirPath, entry), { recursive: true, force: true });
  }
}

function copyRecursive(sourcePath, targetPath) {
  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    ensureDir(targetPath);
    for (const entry of fs.readdirSync(sourcePath)) {
      copyRecursive(path.join(sourcePath, entry), path.join(targetPath, entry));
    }
    return;
  }
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function main() {
  if (!fs.existsSync(miniappRoot)) {
    throw new Error(`未找到小程序目录: ${miniappRoot}`);
  }

  ensureDir(outputRoot);
  ensureDir(publicMirrorRoot);
  removeDirContent(outputRoot);
  removeDirContent(publicMirrorRoot);

  for (const entry of copyEntries) {
    const sourcePath = path.join(miniappRoot, entry);
    if (!fs.existsSync(sourcePath)) {
      continue;
    }
    copyRecursive(sourcePath, path.join(outputRoot, entry));
    copyRecursive(sourcePath, path.join(publicMirrorRoot, entry));
  }

  const meta = {
    copiedAt: new Date().toISOString(),
    sourceRoot: 'miniprogram',
    copiedEntries: copyEntries,
  };
  fs.writeFileSync(
    path.join(outputRoot, '_sync-meta.json'),
    JSON.stringify(meta, null, 2),
    'utf8'
  );
  fs.writeFileSync(
    path.join(publicMirrorRoot, '_sync-meta.json'),
    JSON.stringify(meta, null, 2),
    'utf8'
  );

  console.log(`[sync-miniprogram] completed: ${outputRoot} + ${publicMirrorRoot}`);
}

main();
