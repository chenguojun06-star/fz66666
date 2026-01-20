import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');
const frontendRoot = path.resolve(projectRoot, 'frontend');
const backendRoot = path.resolve(projectRoot, 'backend');

const exists = p => {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
};

const safeReadText = p => {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
};

const listFiles = (dir, predicate) => {
  const out = [];
  const walk = current => {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist' || e.name === 'target') {
        continue;
      }
      const full = path.join(current, e.name);
      if (e.isDirectory()) {
        walk(full);
        continue;
      }
      if (!predicate || predicate(full)) {
        out.push(full);
      }
    }
  };
  walk(dir);
  return out;
};

const countOccurrences = (rootDir, extSet, needle) => {
  const files = listFiles(rootDir, p => {
    const ext = path.extname(p).toLowerCase();
    return extSet.has(ext);
  });
  let count = 0;
  for (const f of files) {
    const text = safeReadText(f);
    if (!text) continue;
    let idx = 0;
    while (true) {
      idx = text.indexOf(needle, idx);
      if (idx === -1) break;
      count += 1;
      idx += needle.length;
    }
  }
  return count;
};

const backendAppYml = path.resolve(backendRoot, 'src/main/resources/application.yml');
const backendPom = path.resolve(backendRoot, 'pom.xml');
const backendDockerfile = path.resolve(backendRoot, 'Dockerfile');
const workflowCiCd = path.resolve(projectRoot, '.github/workflows/ci-cd.yml');
const frontendEslint = path.resolve(frontendRoot, '.eslintrc.json');

const testJavaRoot = path.resolve(backendRoot, 'src/test/java');
const backendTestFiles = exists(testJavaRoot)
  ? listFiles(testJavaRoot, p => p.endsWith('.java'))
  : [];

const frontendTsFiles = listFiles(path.resolve(frontendRoot, 'src'), p => {
  const ext = path.extname(p).toLowerCase();
  return ext === '.ts' || ext === '.tsx';
});

const backendJavaRoot = path.resolve(backendRoot, 'src/main/java');
const backendJavaFiles = listFiles(backendJavaRoot, p => p.endsWith('.java'));

const allowCircularReferencesEnabled = (() => {
  const yml = safeReadText(backendAppYml);
  if (!yml) return null;
  const normalized = yml.replace(/\r\n/g, '\n');
  const match = normalized.match(/\n\s*allow-circular-references\s*:\s*(true|false)\s*(\n|$)/i);
  if (!match) return null;
  return match[1].toLowerCase() === 'true';
})();

const frontendEslintRules = (() => {
  try {
    return JSON.parse(safeReadText(frontendEslint) || '{}')?.rules || {};
  } catch {
    return {};
  }
})();

const disabledLintRules = Object.entries(frontendEslintRules)
  .filter(([, v]) => v === 'off' || (Array.isArray(v) && v[0] === 'off'))
  .map(([k]) => k);

const backendAutowiredCount = countOccurrences(backendJavaRoot, new Set(['.java']), '@Autowired');
const backendMapReturnCount = countOccurrences(backendJavaRoot, new Set(['.java']), 'Map<String, Object>');
const frontendAnyCount = countOccurrences(path.resolve(frontendRoot, 'src'), new Set(['.ts', '.tsx']), ': any');

const hasOpenApi = safeReadText(backendPom).includes('springdoc-openapi-ui');
const hasFlyway = safeReadText(backendPom).includes('flyway-core');
const hasActuator = safeReadText(backendPom).includes('spring-boot-starter-actuator');

const metrics = {
  repo: {
    frontendTsFiles: frontendTsFiles.length,
    backendJavaFiles: backendJavaFiles.length,
    backendTestFiles: backendTestFiles.length,
  },
  qualitySignals: {
    hasCiCdWorkflow: exists(workflowCiCd),
    hasDockerfileBackend: exists(backendDockerfile),
    hasOpenApi,
    hasFlyway,
    hasActuator,
    allowCircularReferencesEnabled,
    backendAutowiredCount,
    backendMapReturnCount,
    frontendAnyCount,
    disabledLintRuleCount: disabledLintRules.length,
  },
  meta: {
    evaluatedAt: new Date().toISOString(),
  },
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const computeScore100 = m => {
  let score = 100;

  if (!m.qualitySignals.hasCiCdWorkflow) score -= 40;
  if (!m.qualitySignals.hasDockerfileBackend) score -= 15;
  if (!m.qualitySignals.hasOpenApi) score -= 15;
  if (!m.qualitySignals.hasActuator) score -= 5;
  if (!m.qualitySignals.hasFlyway) score -= 5;

  if (m.repo.backendTestFiles === 0) score -= 30;
  if (m.repo.backendTestFiles > 0 && m.repo.backendTestFiles < 5) score -= 10;

  if (m.qualitySignals.allowCircularReferencesEnabled === true) score -= 5;

  return clamp(score, 0, 100);
};

const score100 = computeScore100(metrics);
const score10 = Math.round((score100 / 10) * 10) / 10;
const result = {
  score100,
  score10,
  metrics,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

const min = Number(process.env.QUALITY_SCORE_MIN || '') || 0;
if (min > 0 && score100 < min) {
  process.stderr.write(`quality score ${score100} is below QUALITY_SCORE_MIN ${min}\n`);
  process.exitCode = 2;
}
