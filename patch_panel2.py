import os

file_path = "frontend/src/modules/intelligence/pages/IntelligenceCenter/components/OrderScrollPanel.tsx"

with open(file_path, "r") as f:
    content = f.read()

# Fix 1: items undefined
original_bottleneck = """      const bottleneck: BottleneckDetectionResponse | null =
        rB.status === 'fulfilled' ? ((rB.value as any)?.data ?? null) : null;"""

fixed_bottleneck = """      const bottleneckRaw: any =
        rB.status === 'fulfilled' ? ((rB.value as any)?.data ?? null) : null;
      const bottleneck: BottleneckDetectionResponse | null = bottleneckRaw ? {
        ...bottleneckRaw,
        items: bottleneckRaw.items || bottleneckRaw.bottlenecks || []
      } : null;"""

content = content.replace(original_bottleneck, fixed_bottleneck)

# Fix 2: item.worstOrders undefined check
original_stuck = "卡在 {item.stuckStage}&nbsp;·&nbsp;{item.stuckOrderCount ?? item.worstOrders.length} 单"
fixed_stuck = "卡在 {item.stuckStage}&nbsp;·&nbsp;{item.stuckOrderCount ?? (item.worstOrders || []).length} 单"

content = content.replace(original_stuck, fixed_stuck)

original_map = "item.worstOrders.slice(0, 2).map"
fixed_map = "(item.worstOrders || []).slice(0, 2).map"

content = content.replace(original_map, fixed_map)

# Fix 3: Just in case anomalies is missing
original_anomalies = """const anomalyRaw = rA.status === 'fulfilled' ? ((rA.value as any)?.data?.items ?? []) : [];"""
fixed_anomalies = """const anomalyRaw = rA.status === 'fulfilled' ? ((rA.value as any)?.data?.items ?? []) : [];"""

with open(file_path, "w") as f:
    f.write(content)

print("Patched OrderScrollPanel.tsx")
