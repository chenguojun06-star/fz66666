#!/bin/bash

# 扫码语音生成指南
# 用途：帮助用户快速生成小姐姐语音提示音

echo "======================================"
echo "  🎤 扫码语音生成指南"
echo "======================================"
echo ""

echo "📝 需要生成的音频文件："
echo "   1. scan-success.mp3   - \"扫码成功\""
echo "   2. scan-error.mp3     - \"扫码失败，请重试\""
echo "   3. scan-duplicate.mp3 - \"重复扫码\"（可选）"
echo ""

echo "======================================"
echo "  方案选择"
echo "======================================"
echo ""

echo "请选择生成方式："
echo "   1️⃣  自动生成（推荐）- 使用 Python 脚本 + 百度 AI"
echo "   2️⃣  在线生成 - 手动使用在线工具"
echo "   3️⃣  真人录制 - 专业配音（需找人录制）"
echo ""

read -p "请输入选项（1/2/3）: " choice
echo ""

case $choice in
  1)
    echo "======================================"
    echo "  方案 1️⃣: 自动生成（Python 脚本）"
    echo "======================================"
    echo ""

    # 检查 Python
    if ! command -v python3 &> /dev/null; then
      echo "❌ 未找到 Python 3，请先安装"
      echo "   下载地址：https://www.python.org/downloads/"
      exit 1
    fi

    echo "✅ Python 3 已安装"
    echo ""

    # 检查依赖
    echo "🔍 检查依赖库..."
    if ! python3 -c "import aip" 2>/dev/null; then
      echo "⚠️  缺少 baidu-aip 库，正在安装..."
      pip3 install baidu-aip

      if [ $? -eq 0 ]; then
        echo "✅ 依赖安装成功"
      else
        echo "❌ 依赖安装失败，请手动运行："
        echo "   pip3 install baidu-aip"
        exit 1
      fi
    else
      echo "✅ 依赖库已安装"
    fi

    echo ""
    echo "📋 下一步操作："
    echo "   1. 访问：https://ai.baidu.com/tech/speech/tts"
    echo "   2. 登录并创建应用（免费）"
    echo "   3. 获取 APP_ID、API_KEY、SECRET_KEY"
    echo "   4. 编辑文件：generate-scan-voice.py"
    echo "   5. 将密钥填入「配置区」"
    echo "   6. 运行：python3 generate-scan-voice.py"
    echo ""

    read -p "是否立即打开配置文件？(y/n) " open_file
    if [[ $open_file =~ ^[Yy]$ ]]; then
      if command -v code &> /dev/null; then
        code generate-scan-voice.py
      elif command -v vi &> /dev/null; then
        vi generate-scan-voice.py
      else
        echo "请手动编辑：generate-scan-voice.py"
      fi
    fi
    ;;

  2)
    echo "======================================"
    echo "  方案 2️⃣: 在线生成"
    echo "======================================"
    echo ""

    echo "🌐 推荐在线工具："
    echo ""
    echo "1️⃣  百度 AI 语音合成（免费，音质好）"
    echo "   地址：https://ai.baidu.com/tech/speech/tts"
    echo "   发音人：度小美（温柔女声）"
    echo "   语速：正常或稍快"
    echo ""

    echo "2️⃣  讯飞语音合成（免费，自然）"
    echo "   地址：https://www.xfyun.cn/services/online_tts"
    echo "   发音人：小燕（甜美女声）"
    echo "   语速：中等"
    echo ""

    echo "3️⃣  微软 Azure TTS（音质最好）"
    echo "   地址：https://azure.microsoft.com/zh-cn/products/ai-services/text-to-speech"
    echo "   发音人：晓晓（自然女声）"
    echo "   语速：1.0-1.2"
    echo ""

    echo "📝 操作步骤："
    echo "   1. 访问上述任一网站"
    echo "   2. 输入文本（如「扫码成功」）"
    echo "   3. 选择温柔女声发音人"
    echo "   4. 调整语速为 1.0-1.2（稍快）"
    echo "   5. 试听满意后下载 MP3"
    echo "   6. 重命名为 scan-success.mp3"
    echo "   7. 放到 miniprogram/assets/audio/ 目录"
    echo "   8. 重复以上步骤生成其他音频"
    echo ""

    read -p "按回车键打开百度 AI 网站..."
    open "https://ai.baidu.com/tech/speech/tts" 2>/dev/null || \
    xdg-open "https://ai.baidu.com/tech/speech/tts" 2>/dev/null || \
    echo "请手动访问：https://ai.baidu.com/tech/speech/tts"
    ;;

  3)
    echo "======================================"
    echo "  方案 3️⃣: 真人录制"
    echo "======================================"
    echo ""

    echo "🎙️  录制要求："
    echo "   - 设备：手机/专业麦克风"
    echo "   - 环境：安静无噪音"
    echo "   - 音质：清晰，无杂音"
    echo "   - 音调：温柔甜美"
    echo ""

    echo "📋 录制文本："
    echo "   1. \"扫码成功\"       （1 秒，音调上扬）"
    echo "   2. \"扫码失败，请重试\" （2 秒，平缓）"
    echo "   3. \"重复扫码\"       （1 秒，温柔提醒）"
    echo ""

    echo "🔧 后期处理："
    echo "   1. 剪辑去除首尾空白（使用 Audacity）"
    echo "   2. 降噪处理"
    echo "   3. 调整音量至适中"
    echo "   4. 导出为 MP3（比特率 64-128 kbps）"
    echo "   5. 压缩文件大小至 <30KB"
    echo ""

    echo "💰 费用参考："
    echo "   - 自己录制：免费"
    echo "   - 找配音师：50-200元（3条音频）"
    echo "   - 专业录音棚：500-1000元"
    echo ""
    ;;

  *)
    echo "❌ 无效选项"
    exit 1
    ;;
esac

echo ""
echo "======================================"
echo "  音频文件规格要求"
echo "======================================"
echo ""

echo "📊 技术参数："
echo "   - 格式：MP3"
echo "   - 采样率：44100 Hz 或 22050 Hz"
echo "   - 比特率：64-128 kbps"
echo "   - 声道：单声道（推荐）或立体声"
echo "   - 大小：单个文件 <30 KB"
echo ""

echo "🎯 音质标准："
echo "   - 清晰度：语音清晰，无噪音"
echo "   - 音量：适中，不刺耳"
echo "   - 时长：1-2 秒"
echo "   - 音调：温柔甜美"
echo ""

echo "======================================"
echo "  文件放置位置"
echo "======================================"
echo ""

echo "📁 目标目录："
echo "   miniprogram/assets/audio/"
echo ""

# 检查目录是否存在
if [ -d "miniprogram/assets/audio" ]; then
  echo "✅ 目录已存在"

  # 检查是否已有音频文件
  audio_count=$(find miniprogram/assets/audio -name "*.mp3" 2>/dev/null | wc -l | xargs)
  if [ "$audio_count" -gt 0 ]; then
    echo "📋 已有 $audio_count 个音频文件："
    find miniprogram/assets/audio -name "*.mp3" -exec basename {} \;
  else
    echo "⚠️  目录为空，请添加音频文件"
  fi
else
  echo "⚠️  目录不存在，已自动创建"
  mkdir -p miniprogram/assets/audio
fi

echo ""
echo "======================================"
echo "  验证与测试"
echo "======================================"
echo ""

echo "✅ 生成完成后的检查清单："
echo "   [ ] 文件存在：scan-success.mp3"
echo "   [ ] 文件存在：scan-error.mp3"
echo "   [ ] 文件大小：每个 <30 KB"
echo "   [ ] 音质清晰：无噪音、无杂音"
echo "   [ ] 音量适中：不太小、不刺耳"
echo "   [ ] 时长合理：1-2 秒"
echo ""

echo "🧪 测试步骤："
echo "   1. 在微信开发者工具中编译小程序"
echo "   2. 使用真机测试（模拟器可能无声音）"
echo "   3. 开启手机音量"
echo "   4. 扫码测试成功/失败场景"
echo "   5. 验证声音是否清晰、音量是否合适"
echo ""

echo "======================================"
echo "  常见问题"
echo "======================================"
echo ""

echo "❓ 如果听不到声音："
echo "   1. 检查手机音量是否开启"
echo "   2. 检查文件是否在正确位置"
echo "   3. 确认文件名是否正确（不能改名）"
echo "   4. 在真机上测试（模拟器无声音）"
echo ""

echo "❓ 如果声音太小/太大："
echo "   1. 使用 Audacity 调整音量"
echo "   2. 修改 voiceManager.js 中的音量参数"
echo "   3. 重新生成音频文件"
echo ""

echo "❓ 如果音质不好："
echo "   1. 使用更高质量的音频源"
echo "   2. 提高比特率（64→128 kbps）"
echo "   3. 使用专业录音设备"
echo ""

echo "✅ 脚本运行完成！"
echo ""

echo "📖 更多帮助："
echo "   查看详细说明：cat miniprogram/assets/audio/README.md"
echo "   查看测试指南：./test-scan-feedback.sh"
echo ""
