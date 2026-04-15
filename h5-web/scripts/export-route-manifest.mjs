import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const miniappRoot = path.join(projectRoot, 'miniprogram');
const outputDir = path.join(projectRoot, 'h5-web', 'generated');
const outputFile = path.join(outputDir, 'route-manifest.json');

function buildRoutes(appJson) {
  const tabPages = new Set((appJson.tabBar?.list || []).map(item => item.pagePath));
  const routes = [];

  for (const pagePath of appJson.pages || []) {
    routes.push({
      source: pagePath,
      h5Path: '/' + pagePath.replace(/^pages\//, '').replace(/\/index$/, ''),
      type: tabPages.has(pagePath) ? 'tab' : 'page',
    });
  }

  for (const pkg of appJson.subpackages || []) {
    for (const page of pkg.pages || []) {
      const source = `${pkg.root}/${page}`;
      routes.push({
        source,
        h5Path: '/' + source.replace(/^pages\//, '').replace(/\/index$/, ''),
        type: 'subpackage',
        packageName: pkg.name,
      });
    }
  }

  return routes;
}

function main() {
  const appJson = JSON.parse(fs.readFileSync(path.join(miniappRoot, 'app.json'), 'utf8'));
  const manifest = {
    generatedAt: new Date().toISOString(),
    tabBar: appJson.tabBar || null,
    window: appJson.window || null,
    preloadRule: appJson.preloadRule || {},
    routes: buildRoutes(appJson),
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`[export-route-manifest] generated: ${outputFile}`);
}

main();
