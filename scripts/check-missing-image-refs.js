#!/usr/bin/env node

/**
 * 缺图巡检脚本（样衣/大货共用图片引用）
 *
 * 功能：
 * 1. 从数据库抽取图片引用（style_info.cover / style_attachment.file_url / material_purchase.style_cover）
 * 2. 解析成 COS Key（tenants/{tenantId}/{filename}）
 * 3. 通过 COS V5 签名发起 HEAD 请求，判断对象是否存在
 * 4. 导出 JSON + CSV 报告到 reports/
 *
 * 依赖：仅 Node.js 内置模块
 * 前置：
 * - 本地可访问 docker 容器 fashion-mysql-simple
 * - 配置 COS 凭据（推荐放 .run/backend.env）
 *   COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_REGION
 *   或 FASHION_COS_SECRET_ID / FASHION_COS_SECRET_KEY / FASHION_COS_BUCKET / FASHION_COS_REGION
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'reports');
const ENV_FILE = path.join(ROOT, '.run', 'backend.env');

function readEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

function getConfig() {
  const fileEnv = readEnvFile(ENV_FILE);
  const pick = (...keys) => {
    for (const key of keys) {
      if (process.env[key]) return process.env[key];
      if (fileEnv[key]) return fileEnv[key];
    }
    return '';
  };

  return {
    cosSecretId: pick('COS_SECRET_ID', 'FASHION_COS_SECRET_ID'),
    cosSecretKey: pick('COS_SECRET_KEY', 'FASHION_COS_SECRET_KEY'),
    cosBucket: pick('COS_BUCKET', 'FASHION_COS_BUCKET'),
    cosRegion: pick('COS_REGION', 'FASHION_COS_REGION', 'FASHION_COS_REGION_NAME') || 'ap-shanghai',
  };
}

function runSql(sql) {
  const escaped = sql.replace(/"/g, '\\"').replace(/\n/g, ' ');
  const cmd = [
    'docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain --batch --skip-column-names',
    `-e "${escaped}"`,
  ].join(' ');
  const output = execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return output;
}

function loadImageRefsFromDb() {
  const sql = `
SELECT 't_style_info.cover' AS source_field, CAST(id AS CHAR) AS source_id, COALESCE(style_no,'') AS biz_no, cover AS file_url
FROM t_style_info
WHERE cover IS NOT NULL AND cover <> ''
UNION ALL
SELECT 't_style_attachment.file_url' AS source_field, CAST(id AS CHAR) AS source_id, COALESCE(style_id,'') AS biz_no, file_url AS file_url
FROM t_style_attachment
WHERE file_url IS NOT NULL AND file_url <> '' AND file_type LIKE '%image%'
UNION ALL
SELECT 't_material_purchase.style_cover' AS source_field, CAST(id AS CHAR) AS source_id, COALESCE(purchase_no,'') AS biz_no, style_cover AS file_url
FROM t_material_purchase
WHERE delete_flag = 0 AND style_cover IS NOT NULL AND style_cover <> ''
`;

  const raw = runSql(sql).trim();
  if (!raw) return [];

  return raw.split(/\r?\n/).map((line) => {
    const parts = line.split('\t');
    return {
      sourceField: parts[0] || '',
      sourceId: parts[1] || '',
      bizNo: parts[2] || '',
      fileUrl: parts.slice(3).join('\t') || '',
    };
  });
}

function parseTenantFileUrl(fileUrl) {
  const url = String(fileUrl || '').trim();
  if (!url) return null;

  const matchTenantDownload = url.match(/\/api\/file\/tenant-download\/(\d+)\/([^?]+)/);
  if (matchTenantDownload) {
    const tenantId = matchTenantDownload[1];
    const filename = decodeURIComponent(matchTenantDownload[2]);
    return {
      tenantId,
      filename,
      objectKey: `tenants/${tenantId}/${filename}`,
    };
  }

  const matchCosTenants = url.match(/\/tenants\/(\d+)\/([^?]+)/);
  if (matchCosTenants) {
    const tenantId = matchCosTenants[1];
    const filename = decodeURIComponent(matchCosTenants[2]);
    return {
      tenantId,
      filename,
      objectKey: `tenants/${tenantId}/${filename}`,
    };
  }

  return null;
}

function sha1Hex(input) {
  return crypto.createHash('sha1').update(input).digest('hex');
}

function hmacSha1Hex(key, text) {
  return crypto.createHmac('sha1', key).update(text).digest('hex');
}

function hmacSha1Buffer(key, text) {
  return crypto.createHmac('sha1', key).update(text).digest();
}

function buildCosAuthorization({ secretId, secretKey, host, method, pathname, signStart, signEnd }) {
  const qSignTime = `${signStart};${signEnd}`;
  const qKeyTime = qSignTime;

  const signKey = hmacSha1Buffer(secretKey, qKeyTime);

  const httpString = `${method.toLowerCase()}\n${pathname}\n\nhost=${host}\n`;
  const sha1edHttpString = sha1Hex(httpString);
  const stringToSign = `sha1\n${qSignTime}\n${sha1edHttpString}\n`;
  const signature = crypto.createHmac('sha1', signKey).update(stringToSign).digest('hex');

  return [
    'q-sign-algorithm=sha1',
    `q-ak=${encodeURIComponent(secretId)}`,
    `q-sign-time=${qSignTime}`,
    `q-key-time=${qKeyTime}`,
    'q-header-list=host',
    'q-url-param-list=',
    `q-signature=${signature}`,
  ].join('&');
}

function checkCosObjectExists({ bucket, region, secretId, secretKey, objectKey }) {
  const host = `${bucket}.cos.${region}.myqcloud.com`;
  const pathname = `/${objectKey}`;

  const now = Math.floor(Date.now() / 1000);
  const signStart = now - 60;
  const signEnd = now + 300;

  const authorization = buildCosAuthorization({
    secretId,
    secretKey,
    host,
    method: 'HEAD',
    pathname,
    signStart,
    signEnd,
  });

  return new Promise((resolve) => {
    const req = https.request(
      {
        protocol: 'https:',
        host,
        method: 'HEAD',
        path: pathname,
        headers: {
          Host: host,
          Authorization: authorization,
        },
      },
      (res) => {
        const statusCode = res.statusCode || 0;
        if (statusCode === 200 || statusCode === 206) {
          resolve({ exists: true, statusCode, reason: 'OK' });
          return;
        }
        if (statusCode === 404) {
          resolve({ exists: false, statusCode, reason: 'NOT_FOUND' });
          return;
        }
        if (statusCode === 403) {
          resolve({ exists: false, statusCode, reason: 'FORBIDDEN_OR_NO_PERMISSION' });
          return;
        }
        resolve({ exists: false, statusCode, reason: `HTTP_${statusCode}` });
      },
    );

    req.on('error', (err) => {
      resolve({ exists: false, statusCode: 0, reason: `REQUEST_ERROR:${err.message}` });
    });
    req.end();
  });
}

function toCsv(rows) {
  const headers = [
    'sourceField', 'sourceId', 'bizNo', 'fileUrl', 'objectKey', 'status', 'statusCode', 'reason',
  ];
  const escape = (v) => {
    const s = String(v == null ? '' : v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  return lines.join('\n');
}

async function main() {
  const startedAt = new Date();
  const cfg = getConfig();

  console.log('[巡检] 开始加载数据库图片引用...');
  const refs = loadImageRefsFromDb();
  console.log(`[巡检] 引用总数: ${refs.length}`);

  const rows = [];
  const keyMap = new Map();

  for (const ref of refs) {
    const parsed = parseTenantFileUrl(ref.fileUrl);
    const base = {
      sourceField: ref.sourceField,
      sourceId: ref.sourceId,
      bizNo: ref.bizNo,
      fileUrl: ref.fileUrl,
      objectKey: parsed?.objectKey || '',
      status: 'UNRESOLVED',
      statusCode: '',
      reason: parsed ? '' : 'URL_NOT_SUPPORTED',
    };

    if (!parsed) {
      rows.push(base);
      continue;
    }

    rows.push(base);
    if (!keyMap.has(parsed.objectKey)) {
      keyMap.set(parsed.objectKey, {
        objectKey: parsed.objectKey,
        refs: [],
      });
    }
    keyMap.get(parsed.objectKey).refs.push(rows.length - 1);
  }

  const keys = Array.from(keyMap.keys());
  console.log(`[巡检] 可解析为COS对象的Key数: ${keys.length}`);

  const hasCosCred = cfg.cosSecretId && cfg.cosSecretKey && cfg.cosBucket && cfg.cosRegion;
  if (!hasCosCred) {
    console.warn('[巡检] 未检测到完整COS凭据，跳过远端存在性校验。');
    rows.forEach((row) => {
      if (row.objectKey) {
        row.status = 'SKIPPED';
        row.reason = 'COS_CREDENTIAL_MISSING';
      }
    });
  } else {
    console.log('[巡检] 开始COS存在性校验（HEAD对象）...');
    let done = 0;

    for (const objectKey of keys) {
      // 串行，避免过快触发限流
      // 如需提速可改为并发池
      const check = await checkCosObjectExists({
        bucket: cfg.cosBucket,
        region: cfg.cosRegion,
        secretId: cfg.cosSecretId,
        secretKey: cfg.cosSecretKey,
        objectKey,
      });

      const refIndexes = keyMap.get(objectKey).refs;
      for (const idx of refIndexes) {
        rows[idx].status = check.exists ? 'OK' : 'MISSING';
        rows[idx].statusCode = check.statusCode;
        rows[idx].reason = check.reason;
      }

      done += 1;
      if (done % 50 === 0 || done === keys.length) {
        console.log(`[巡检] COS校验进度: ${done}/${keys.length}`);
      }
    }
  }

  const missingRows = rows.filter((r) => r.status === 'MISSING');
  const unresolvedRows = rows.filter((r) => r.status === 'UNRESOLVED');

  const summary = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    totalRefs: rows.length,
    parsedKeyRefs: rows.filter((r) => !!r.objectKey).length,
    unresolvedRefs: unresolvedRows.length,
    missingRefs: missingRows.length,
    okRefs: rows.filter((r) => r.status === 'OK').length,
    skippedRefs: rows.filter((r) => r.status === 'SKIPPED').length,
    cos: {
      bucket: cfg.cosBucket || '',
      region: cfg.cosRegion || '',
      credentialLoaded: !!hasCosCred,
    },
  };

  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
  const ts = `${startedAt.getFullYear()}${String(startedAt.getMonth() + 1).padStart(2, '0')}${String(startedAt.getDate()).padStart(2, '0')}_${String(startedAt.getHours()).padStart(2, '0')}${String(startedAt.getMinutes()).padStart(2, '0')}${String(startedAt.getSeconds()).padStart(2, '0')}`;
  const jsonPath = path.join(REPORT_DIR, `missing-image-refs-${ts}.json`);
  const csvPath = path.join(REPORT_DIR, `missing-image-refs-${ts}.csv`);

  fs.writeFileSync(jsonPath, JSON.stringify({ summary, rows }, null, 2), 'utf8');
  fs.writeFileSync(csvPath, toCsv(rows), 'utf8');

  console.log('\n========== 巡检完成 ==========' );
  console.log(JSON.stringify(summary, null, 2));
  console.log(`JSON报告: ${jsonPath}`);
  console.log(`CSV报告 : ${csvPath}`);

  if (missingRows.length > 0) {
    console.log('\n[缺失样例TOP10]');
    missingRows.slice(0, 10).forEach((r, i) => {
      console.log(`${i + 1}. ${r.sourceField} | ${r.bizNo || r.sourceId} | ${r.objectKey} | ${r.reason}`);
    });
  }
}

main().catch((err) => {
  console.error('[巡检] 执行失败:', err.message);
  process.exit(1);
});
