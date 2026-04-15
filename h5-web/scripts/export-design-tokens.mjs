import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const miniappRoot = path.join(projectRoot, 'miniprogram');
const outputDir = path.join(projectRoot, 'h5-web', 'generated');
const sourceFile = path.join(miniappRoot, 'styles', 'design-tokens.wxss');
const outputFile = path.join(outputDir, 'design-tokens.css');

function convertWxssToCss(content) {
  return content
    .replace(/^page\s*\{/m, ':root {')
    .replace(/\/\*[\s\S]*?\*\//g, match => match)
    .replace(/\brpx\b/g, 'px');
}

function main() {
  const source = fs.readFileSync(sourceFile, 'utf8');
  const output = convertWxssToCss(source);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputFile, output, 'utf8');
  console.log(`[export-design-tokens] generated: ${outputFile}`);
}

main();
