import os

file_path = "frontend/src/modules/intelligence/pages/IntelligenceCenter/index.tsx"

with open(file_path, "r") as f:
    content = f.read()

# Fix heatmap.factories and processes
content = content.replace("heatmap.factories.length", "(heatmap.factories || []).length")
content = content.replace("heatmap.factories.map", "(heatmap.factories || []).map")
content = content.replace("heatmap.processes.map", "(heatmap.processes || []).map")

# In OrderScrollPanel we fixed items, what about other files?

with open(file_path, "w") as f:
    f.write(content)

print("Patched heatmap.factories in index.tsx")
