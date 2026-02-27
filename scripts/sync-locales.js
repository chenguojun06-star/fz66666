const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourceDir = path.join(root, 'shared-locales', 'source');
const frontendOut = path.join(root, 'frontend', 'src', 'i18n', 'locales.generated.ts');
const miniprogramOut = path.join(root, 'miniprogram', 'utils', 'i18n', 'locales.generated.js');

const languages = ['zh-CN', 'en-US', 'vi-VN', 'km-KH'];

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const localeData = {};
for (const lang of languages) {
  const filePath = path.join(sourceDir, `${lang}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing locale source file: ${filePath}`);
  }
  localeData[lang] = readJson(filePath);
}

const generatedBanner = `/**\n * AUTO-GENERATED FILE.\n * Source: shared-locales/source/*.json\n * Run: node scripts/sync-locales.js\n */\n`;

const frontendContent = `${generatedBanner}\nexport const LOCALES = ${JSON.stringify(localeData, null, 2)} as const;\n\nexport type LocaleCode = keyof typeof LOCALES;\n`;

const miniProgramContent = `${generatedBanner}\nmodule.exports = ${JSON.stringify(localeData, null, 2)};\n`;

ensureDir(frontendOut);
ensureDir(miniprogramOut);
fs.writeFileSync(frontendOut, frontendContent, 'utf8');
fs.writeFileSync(miniprogramOut, miniProgramContent, 'utf8');

console.log('✅ Synced locales to frontend and miniprogram');
console.log(` - ${frontendOut}`);
console.log(` - ${miniprogramOut}`);
