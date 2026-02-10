#!/bin/bash

# 扫码语音功能快速设置指南
# 用途：一键完成小姐姐语音提示的所有配置

echo ""
echo "╔════════════════════════════════════════╗"
echo "║  🎤 扫码小姐姐语音提示 - 快速设置  ║"
echo "╔════════════════════════════════════════╗"
echo ""

echo "📋 功能说明："
echo "   - ✅ 扫码成功：小姐姐温柔提示 \"扫码成功\""
echo "   - ❌ 扫码失败：小姐姐温柔提示 \"扫码失败，请重试\""
echo "   - 📳 震动反馈：成功轻震（15ms），失败长震（400ms）"
echo ""

echo "======================================"
echo "  当前状态检查"
echo "======================================"
echo ""

# 检查代码是否已集成
echo "1️⃣  检查代码集成..."
if grep -q "voiceManager" miniprogram/pages/scan/index.js 2>/dev/null; then
  echo "   ✅ 语音管理器已集成到扫码页面"
else
  echo "   ❌ 语音管理器未集成"
fi

if grep -q "voiceManager.play('success')" miniprogram/pages/scan/index.js 2>/dev/null; then
  echo "   ✅ 成功语音已添加"
else
  echo "   ⚠️  成功语音未添加"
fi

if grep -q "voiceManager.play('error')" miniprogram/pages/scan/index.js 2>/dev/null; then
  echo "   ✅ 失败语音已添加"
else
  echo "   ⚠️  失败语音未添加"
fi

echo ""

# 检查音频文件
echo "2️⃣  检查音频文件..."
if [ -d "miniprogram/assets/audio" ]; then
  echo "   ✅ 音频目录已创建"

  if [ -f "miniprogram/assets/audio/scan-success.mp3" ]; then
    size=$(ls -lh miniprogram/assets/audio/scan-success.mp3 | awk '{print $5}')
    echo "   ✅ scan-success.mp3 存在（$size）"
  else
    echo "   ❌ scan-success.mp3 缺失"
  fi

  if [ -f "miniprogram/assets/audio/scan-error.mp3" ]; then
    size=$(ls -lh miniprogram/assets/audio/scan-error.mp3 | awk '{print $5}')
    echo "   ✅ scan-error.mp3 存在（$size）"
  else
    echo "   ❌ scan-error.mp3 缺失"
  fi
else
  echo "   ⚠️  音频目录不存在"
fi

echo ""

# 统计状态
missing_files=0
if [ ! -f "miniprogram/assets/audio/scan-success.mp3" ]; then
  ((missing_files++))
fi
if [ ! -f "miniprogram/assets/audio/scan-error.mp3" ]; then
  ((missing_files++))
fi

echo "======================================"
echo "  需要完成的步骤"
echo "======================================"
echo ""

if [ $missing_files -eq 0 ]; then
  echo "🎉 太棒了！所有文件都已准备好！"
  echo ""
  echo "✅ 下一步："
  echo "   1. 在微信开发者工具中编译小程序"
  echo "   2. 使用真机测试扫码功能"
  echo "   3. 开启手机音量"
  echo "   4. 扫码验证语音提示效果"
  echo ""
else
  echo "⚠️  还需要 $missing_files 个音频文件"
  echo ""
  echo "📝 快速生成音频文件（3种方案）："
  echo ""

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "方案 1️⃣: 自动生成（最快，推荐）"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "使用 Python 脚本 + 百度 AI 自动生成："
  echo ""
  echo "步骤 1: 安装依赖"
  echo "   pip3 install baidu-aip"
  echo ""
  echo "步骤 2: 获取免费 API 密钥"
  echo "   访问：https://ai.baidu.com/tech/speech/tts"
  echo "   登录并创建应用（免费，每天5000次）"
  echo ""
  echo "步骤 3: 配置并运行"
  echo "   编辑：generate-scan-voice.py"
  echo "   填入 API 密钥"
  echo "   运行：python3 generate-scan-voice.py"
  echo ""
  echo "✨ 优点：一键生成，音质稳定，可调整参数"
  echo ""

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "方案 2️⃣: 在线生成（最简单）"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "手动使用在线工具："
  echo ""
  echo "选项 A: 百度 AI（推荐）"
  echo "   1. 访问：https://ai.baidu.com/tech/speech/tts"
  echo "   2. 输入：\"扫码成功\""
  echo "   3. 选择：度小美（温柔女声）"
  echo "   4. 下载并重命名为 scan-success.mp3"
  echo ""
  echo "选项 B: 讯飞语音"
  echo "   地址：https://www.xfyun.cn/services/online_tts"
  echo "   发音人：小燕（甜美女声）"
  echo ""
  echo "选项 C: 微软 Azure（音质最好）"
  echo "   地址：https://azure.microsoft.com/products/ai-services/text-to-speech"
  echo "   发音人：晓晓（自然女声）"
  echo ""
  echo "✨ 优点：无需配置，即用即走"
  echo ""

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "方案 3️⃣: 真人录制（最专业）"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "找配音师或自己录制："
  echo "   录制文本：\"扫码成功\"、\"扫码失败，请重试\""
  echo "   音调：温柔甜美"
  echo "   时长：1-2 秒"
  echo "   格式：MP3"
  echo ""
  echo "✨ 优点：声音独一无二，品质最高"
  echo ""
fi

echo "======================================"
echo "  文件要求"
echo "======================================"
echo ""

echo "📊 音频规格："
echo "   - 格式：MP3"
echo "   - 大小：<30 KB/个"
echo "   - 时长：1-2 秒"
echo "   - 音质：清晰无噪音"
echo "   - 音调：温柔甜美"
echo ""

echo "📁 文件列表："
echo "   ✓ scan-success.mp3   （必需）- \"扫码成功\""
echo "   ✓ scan-error.mp3     （必需）- \"扫码失败，请重试\""
echo "   ○ scan-duplicate.mp3 （可选）- \"重复扫码\""
echo ""

echo "📂 存放位置："
echo "   miniprogram/assets/audio/"
echo ""

echo "======================================"
echo "  快速操作"
echo "======================================"
echo ""

read -p "是否立即运行设置向导？(y/n) " run_wizard

if [[ $run_wizard =~ ^[Yy]$ ]]; then
  echo ""
  ./setup-scan-voice.sh
else
  echo ""
  echo "📖 手动操作指南："
  echo ""
  echo "查看详细说明："
  echo "   cat miniprogram/assets/audio/README.md"
  echo ""
  echo "运行设置向导："
  echo "   ./setup-scan-voice.sh"
  echo ""
  echo "自动生成音频："
  echo "   python3 generate-scan-voice.py"
  echo ""
  echo "测试功能："
  echo "   ./test-scan-feedback.sh"
  echo ""
fi

echo "======================================"
echo "  技术支持"
echo "======================================"
echo ""

echo "💡 提示："
echo "   - 音频文件放入 assets/audio/ 后无需重启"
echo "   - 在真机上测试（模拟器可能无声音）"
echo "   - 可在 voiceManager.js 中调整音量"
echo "   - 用户可在设置中开关语音提示"
echo ""

echo "❓ 常见问题："
echo "   - 听不到声音 → 检查手机音量、文件位置"
echo "   - 声音太小 → 调整 voiceManager.js 中的音量参数"
echo "   - 声音不播放 → 检查文件名是否正确"
echo ""

echo "📞 获取帮助："
echo "   - 查看 README: cat miniprogram/assets/audio/README.md"
echo "   - 查看代码: cat miniprogram/utils/voiceManager.js"
echo ""

echo "✅ 设置完成！祝你使用愉快~ 🎉"
echo ""
