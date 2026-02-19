#!/usr/bin/env python3
"""Fix productionApi.ts on disk - add missing API methods"""

filepath = 'src/services/production/productionApi.ts'

with open(filepath, 'r') as f:
    content = f.read()

# Remove any duplicate listBundles lines
lines = content.split('\n')
seen_listBundles = False
cleaned = []
for line in lines:
    if 'listBundles' in line:
        if seen_listBundles:
            continue
        seen_listBundles = True
    cleaned.append(line)
content = '\n'.join(cleaned)

# Add listBundles to productionCuttingApi if not present
if 'listBundles' not in content:
    content = content.replace(
        "  getByCode: (qrCode: string) => api.get<{ code: number; data: any }>(`/production/cutting/by-code/${encodeURIComponent(String(qrCode || '').trim())}`)," + "\n};",
        "  getByCode: (qrCode: string) => api.get<{ code: number; data: any }>(`/production/cutting/by-code/${encodeURIComponent(String(qrCode || '').trim())}`),\n  listBundles: (orderId: any) => api.get<any>(`/production/cutting/bundles/${encodeURIComponent(String(orderId || '').trim())}`)," + "\n};"
    )

# Add create and rollback to productionScanApi if not present
if '  create:' not in content:
    # Find the closing of productionScanApi
    marker = "  listByOrderId: (orderId: string, params: Record<string, unknown>) => api.get<{ code: number; data: any[] }>"
    idx = content.find(marker)
    if idx >= 0:
        # Find the end of that line
        end_of_line = content.find('\n', idx)
        # Find the closing brace
        closing = content.find('};', end_of_line)
        if closing >= 0:
            content = content[:closing] + "  create: (payload: any) => api.post<any>('/production/scan/execute', payload),\n  rollback: (orderId: any, payload?: any) => api.post<any>('/production/scan/rollback', { orderId, ...(payload || {}) }),\n" + content[closing:]

with open(filepath, 'w') as f:
    f.write(content)

print('Done - file updated on disk')
