import os
import re

file_path = "frontend/src/modules/intelligence/pages/IntelligenceCenter/LiveScanFeed.tsx"

with open(file_path, "r") as f:
    content = f.read()

content = content.replace(
    "`静默预警：最近 ${Math.max(1, Math.round(effectiveSilentMinutes))} 分钟未见有效扫码`",
    "effectiveSilentMinutes === Infinity ? '静默预警：当前暂无任何活跃扫码' : `静默预警：最近 ${Math.max(1, Math.round(effectiveSilentMinutes))} 分钟未见有效扫码`"
)

content = content.replace(
    "`脉冲走弱：最近 ${Math.max(1, Math.round(effectiveSilentMinutes))} 分钟扫码明显变少`",
    "effectiveSilentMinutes === Infinity ? '脉冲走弱：当前扫码较少' : `脉冲走弱：最近 ${Math.max(1, Math.round(effectiveSilentMinutes))} 分钟扫码明显变少`"
)

with open(file_path, "w") as f:
    f.write(content)

print("Patched LiveScanFeed.tsx")
