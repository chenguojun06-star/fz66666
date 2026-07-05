#!/bin/bash
# 数据链路地图 - 一键运行脚本
# 用法：
#   ./run.sh          # 扫描 + 本地探测 + 打开浏览器
#   ./run.sh cloud    # 扫描 + 云端探测 + 打开浏览器
#   ./run.sh scan     # 仅扫描
#   ./run.sh probe    # 仅探测本地
set -e

PROJECT_ROOT="/Volumes/macoo2/Users/guojunmini4/Documents/服装66666"
TOOL_DIR="$PROJECT_ROOT/tools/data-link-map"
cd "$PROJECT_ROOT"

MODE="${1:-local}"

echo "🧬 数据链路神经网络地图"
echo "========================"

# 1. 静态扫描
echo ""
echo "📊 [1/3] 静态扫描代码..."
python3 "$TOOL_DIR/scanner/scan_static.py"

# 2. 实时探测
echo ""
echo "🔍 [2/3] 实时探测接口..."
case "$MODE" in
  cloud)
    echo "   目标：云端 https://www.webyszl.cn"
    python3 "$TOOL_DIR/probe/probe_endpoints.py" --base-url https://www.webyszl.cn
    ;;
  scan)
    echo "   跳过探测（仅扫描模式）"
    ;;
  *)
    echo "   目标：本地 http://localhost:8088"
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:8088/api/system/system-status 2>/dev/null | grep -q "^[23]"; then
      python3 "$TOOL_DIR/probe/probe_endpoints.py" --base-url http://localhost:8088
    else
      echo "   ⚠️ 本地后端未运行，跳过探测"
      echo "   启动后端后重试，或使用 ./run.sh cloud 探测云端"
    fi
    ;;
esac

# 3. 打开浏览器
echo ""
echo "🌐 [3/3] 启动可视化..."
# 检查是否已有服务在运行
if ! lsof -i :9876 > /dev/null 2>&1; then
  echo "   启动 HTTP 服务 http://localhost:9876/viewer/"
  cd "$TOOL_DIR"
  python3 -m http.server 9876 > /dev/null 2>&1 &
  SERVER_PID=$!
  echo "   服务 PID: $SERVER_PID"
  sleep 1
else
  echo "   HTTP 服务已在运行"
fi

# 尝试打开浏览器
if command -v open > /dev/null 2>&1; then
  open "http://localhost:9876/viewer/"
  echo "   浏览器已打开"
fi

echo ""
echo "✅ 完成！"
echo "   地图地址：http://localhost:9876/viewer/"
echo "   数据文件：$TOOL_DIR/data/map.json"
echo "   探测结果：$TOOL_DIR/data/probe-result.json"
echo ""
echo "后续操作："
echo "   - 浏览器内鼠标拖拽平移 / 滚轮缩放 / 点击节点查看详情"
echo "   - 顶部按钮切换链路 A/B/C/D 视图"
echo "   - 代码提交后 Git hook 自动重新扫描"
