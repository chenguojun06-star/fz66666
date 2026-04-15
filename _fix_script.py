#!/usr/bin/env python3
import os

BASE = '/Volumes/macoo2/Users/guojunmini4/Documents/服装66666'

ts_const = '    private static final java.util.Set<String> TERMINAL_STATUSES = java.util.Set.of("completed", "cancelled", "scrapped", "archived", "closed");'

# 1. application.yml - trusted-ip-prefixes
fp = os.path.join(BASE, 'backend/src/main/resources/application.yml')
with open(fp, 'r') as f:
    c = f.read()
old = '    trusted-ip-prefixes:\n      - "127."\n      - "10."\n      - "192.168."\n      - "172.16."\n      - "172.17."\n      - "172.18."\n      - "172.19."\n      - "172.20."\n      - "172.21."\n      - "172.22."\n      - "172.23."\n      - "172.24."\n      - "172.25."\n      - "172.26."\n      - "172.27."\n      - "172.28."\n      - "172.29."\n      - "172.30."\n      - "172.31."'
new = '    trusted-ip-prefixes:\n      - "127."\n      - "0:0:0:0:0:0:0:1"\n      - "::1"'
if old in c:
    c = c.replace(old, new)
    with open(fp, 'w') as f: f.write(c)
    print('Fixed: application.yml')
else:
    print('Skip: application.yml (already fixed or pattern not found)')

# 2. SecurityConfig.java - Swagger + isLocalRequest
fp = os.path.join(BASE, 'backend/src/main/java/com/fashion/supplychain/config/SecurityConfig.java')
with open(fp, 'r') as f:
    c = f.read()
c = c.replace('.antMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()',
              '.antMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").authenticated()')
old_xff = '''        if (isBehindTrustedProxy(request, remote)) {
            String forwardedFor = request.getHeader("X-Forwarded-For");
            if (forwardedFor != null && !forwardedFor.isBlank()) {
                String clientIp = forwardedFor.split(",")[0].trim();
                if (trustedIps != null && trustedIps.contains(clientIp)) {
                    return true;
                }
                if (trustedIpPrefixes != null) {
                    for (String prefix : trustedIpPrefixes) {
                        if (clientIp.startsWith(prefix)) {
                            return true;
                        }
                    }
                }
            }
        }

        return false;
    }

    private boolean isBehindTrustedProxy(HttpServletRequest request, String remoteAddr) {
        if (trustedIpPrefixes == null || trustedIpPrefixes.isEmpty()) {
            return false;
        }
        for (String prefix : trustedIpPrefixes) {
            if (remoteAddr.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }'''
new_xff = '''        return false;
    }'''
if old_xff in c:
    c = c.replace(old_xff, new_xff)
with open(fp, 'w') as f: f.write(c)
print('Fixed: SecurityConfig.java')

# 3. TERMINAL_STATUSES files
fixes = [
    ('SelfHealingOrchestrator.java', '    @Autowired\n    private ScanRecordService scanRecordService;',
     '.ne("status", "completed")\n          .ne("status", "cancelled")', '.notIn("status", TERMINAL_STATUSES)'),
    ('ManagementInsightOrchestrator.java', '    @Autowired\n    private ProductionOrderService productionOrderService;',
     '.ne("status", "COMPLETED").ne("status", "CANCELLED")', '.notIn("status", TERMINAL_STATUSES)'),
    ('FactoryCapacityOrchestrator.java', '    private static final Logger log = LoggerFactory.getLogger(FactoryCapacityOrchestrator.class);',
     '.ne("status", "completed")', '.notIn("status", TERMINAL_STATUSES)'),
    ('NlQueryDataHandlers.java', '    static final Pattern ORDER_NO_PATTERN = Pattern.compile("PO\\\\d{8,}");',
     '.ne("status", "completed")', '.notIn("status", TERMINAL_STATUSES)'),
    ('HealthIndexOrchestrator.java', '    private DashboardQueryService dashboardQueryService;',
     '.ne("status", "cancelled")', '.notIn("status", TERMINAL_STATUSES)'),
    ('SmartReportTool.java', '    private static final ObjectMapper MAPPER = new ObjectMapper();',
     '.ne("status", "COMPLETED").ne("status", "CANCELLED")', '.notIn("status", TERMINAL_STATUSES)'),
    ('SystemOverviewTool.java', '    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();',
     '.ne("status", "COMPLETED").ne("status", "CANCELLED")', '.notIn("status", TERMINAL_STATUSES)'),
    ('DeepAnalysisTool.java', '    private static final ObjectMapper MAPPER = new ObjectMapper();',
     '.ne("status", "COMPLETED").ne("status", "CANCELLED")', '.notIn("status", TERMINAL_STATUSES)'),
]

for fname, anchor, old_pat, new_pat in fixes:
    dirs = [
        os.path.join(BASE, 'backend/src/main/java/com/fashion/supplychain/intelligence/orchestration'),
        os.path.join(BASE, 'backend/src/main/java/com/fashion/supplychain/production/orchestration'),
        os.path.join(BASE, 'backend/src/main/java/com/fashion/supplychain/intelligence/agent/tool'),
    ]
    fp = None
    for d in dirs:
        candidate = os.path.join(d, fname)
        if os.path.exists(candidate):
            fp = candidate
            break
    if not fp:
        print(f'Skip: {fname} (not found)')
        continue
    with open(fp, 'r') as f:
        c = f.read()
    if 'TERMINAL_STATUSES' not in c:
        c = c.replace(anchor, anchor + '\n\n' + ts_const, 1)
    c = c.replace(old_pat, new_pat)
    with open(fp, 'w') as f: f.write(c)
    print(f'Fixed: {fname}')

# 4. ProcessTemplateOrchestrator - empty catch
fp = os.path.join(BASE, 'backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/ProcessTemplateOrchestrator.java')
with open(fp, 'r') as f:
    c = f.read()
c = c.replace('} catch (Exception e) {}',
              '} catch (Exception e) {\n            log.warn("[工序模板] 提取部位单价上下文失败: {}", e.getMessage());\n        }')
with open(fp, 'w') as f: f.write(c)
print('Fixed: ProcessTemplateOrchestrator.java')

# 5. Frontend hardcoded domains
for fp in [
    os.path.join(BASE, 'frontend/src/modules/warehouse/pages/ShareOutstockPage/index.tsx'),
    os.path.join(BASE, 'frontend/src/modules/production/pages/ShareOrderPage/index.tsx'),
]:
    with open(fp, 'r') as f:
        c = f.read()
    c = c.replace("import.meta.env.VITE_PLATFORM_URL || 'https://www.webyszl.cn'",
                  "import.meta.env.VITE_PLATFORM_URL || window.location.origin")
    with open(fp, 'w') as f: f.write(c)
    print(f'Fixed: {os.path.basename(fp)}')

print('\nAll Python fixes applied!')
