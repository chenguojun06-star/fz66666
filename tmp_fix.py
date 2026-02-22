import re

with open('系统状态.md', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. 删除 "### 📦 归档文档（archive/）" + sections 4/5 + 整个 🗂️ 已归档文档节
content = re.sub(
    r'\n### 📦 归档文档（archive/）.*?(?=\n## 🎯)',
    '\n',
    content,
    flags=re.DOTALL
)

# 2. 删除末尾旧 "联系与支持" 节
content = re.sub(
    r'\n---\n\n## 📞 联系与支持.*$',
    '',
    content,
    flags=re.DOTALL
)

# 3. 修正快速启动（旧的分步骤 → 统一用脚本）
old_start = (
    '## 🔧 快速启动\n\n'
    '### 启动后端\n\n'
    '```bash\n'
    'cd backend\n'
    'mvn clean package -DskipTests\n'
    'java -jar target/fashion-supplychain-*.jar\n'
    '```\n\n'
    '### 启动前端\n\n'
    '```bash\n'
    'cd frontend\n'
    'npm run dev\n'
    '```\n\n'
    '### 启动数据库\n\n'
    '```bash\n'
    'docker start fashion-mysql-simple\n'
    '```\n\n'
    '### 查看日志\n\n'
    '```bash\n'
    'tail -f backend/logs/fashion-supply-chain.log\n'
    '```'
)
new_start = (
    '## 🔧 快速启动\n\n'
    '```bash\n'
    '# ⚠️ 必须使用脚本启动（自动加载环境变量，否则报403）\n'
    './dev-public.sh\n'
    '```\n\n'
    '分步启动：\n'
    '```bash\n'
    './deployment/db-manager.sh start            # MySQL（端口3308）\n'
    'cd backend && /opt/homebrew/bin/mvn spring-boot:run  # 后端（端口8088）\n'
    'cd frontend && npm run dev                  # 前端（端口5173）\n'
    '```\n\n'
    '### 查看日志\n\n'
    '```bash\n'
    'tail -f backend/logs/fashion-supplychain.log\n'
    '```'
)
if old_start in content:
    content = content.replace(old_start, new_start)
    print('快速启动 ✅')
else:
    print('快速启动未找到，跳过')

# 4. 修正文档导航标题
content = content.replace('## 📚 文档导航（12份核心文档）', '## 📚 文档导航')

with open('系统状态.md', 'w', encoding='utf-8') as f:
    f.write(content)

print('所有清理完成')
print(f'文件总行数: {len(content.splitlines())}')
