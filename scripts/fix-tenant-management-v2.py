#!/usr/bin/env python3
"""Fix TenantManagement/index.tsx - FINAL version.
Keep lines 1-647, the correct RoleTemplateTab, and a new clean main component."""

import os, sys

filepath = os.path.join(
    '/Volumes/macoo2/Users/guojunmini4/Documents/服装66666',
    'frontend/src/modules/system/pages/System/TenantManagement/index.tsx'
)

with open(filepath, 'r') as f:
    lines = f.readlines()

print(f'Input: {len(lines)} lines')

# Section 1: Keep lines 1-647 (index 0-646) - everything up to end of AppManagementTab
good_start = lines[:647]
# Remove trailing empty lines
while good_start and good_start[-1].strip() == '':
    good_start.pop()

# Section 2: Find 'const RoleTemplateTab: React.FC = () => {'
# There should be exactly one now
role_starts = [i for i, l in enumerate(lines) if 'const RoleTemplateTab: React.FC' in l]
print(f'RoleTemplateTab declarations at lines: {[x+1 for x in role_starts]}')

if not role_starts:
    print('ERROR: No RoleTemplateTab found!')
    sys.exit(1)

# Use the LAST one (it's the correct one)
role_idx = role_starts[-1]

# Find the matching closing '};'
brace_depth = 0
started = False
role_end = None
for i in range(role_idx, len(lines)):
    for ch in lines[i]:
        if ch == '{':
            brace_depth += 1
            started = True
        elif ch == '}':
            brace_depth -= 1
            if started and brace_depth == 0:
                role_end = i + 1
                break
    if role_end:
        break

print(f'RoleTemplateTab: lines {role_idx+1}-{role_end}')

role_template_lines = lines[role_idx:role_end]

# Section 3: New clean main component
main_component = """
// ========== 主页面 ==========
const TenantManagement: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';

  return (
    <Layout>
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setSearchParams({ tab: key })}
        items={[
          {
            key: 'overview',
            label: <span><DashboardOutlined /> 集成总览</span>,
            children: <IntegrationOverviewTab />,
          },
          {
            key: 'apps',
            label: <span><ApiOutlined /> 应用管理</span>,
            children: <AppManagementTab />,
          },
          {
            key: 'templates',
            label: <span><SafetyCertificateOutlined /> 角色模板</span>,
            children: <RoleTemplateTab />,
          },
          {
            key: 'guide',
            label: <span><BookOutlined /> 使用教程</span>,
            children: <IntegrationGuideTab />,
          },
        ]}
      />
    </Layout>
  );
};

export default TenantManagement;
"""

# Assemble
output = ''.join(good_start) + '\n\n// ========== 角色模板 Tab ==========\n' + ''.join(role_template_lines) + main_component

with open(filepath, 'w') as f:
    f.write(output)

final_count = output.count('\n') + (0 if output.endswith('\n') else 1)
print(f'Output: {final_count} lines')
print('SUCCESS: File written.')
