#!/bin/bash

# 自动生成扫码语音文件
# 使用百度在线 TTS API（无需注册，直接调用）

echo ""
echo "🎤 正在自动生成小姐姐语音..."
echo ""

# 创建音频目录
mkdir -p miniprogram/assets/audio

# 音频输出目录
AUDIO_DIR="miniprogram/assets/audio"

# 百度 TTS API 参数
# tex: 要合成的文本
# tok: 使用在线开放 token
# cuid: 用户标识
# ctp: 客户端类型
# lan: 语言（zh：中文）
# spd: 语速（0-15，5为正常）
# pit: 音调（0-15，5为正常，提高到7-8更甜美）
# vol: 音量（0-15，8为舒适）
# per: 发音人（0：度小美/温柔女声，1：度小宇/男声，3：度逍遥/情感男声，4：度丫丫/萌萌女声）
# aue: 音频格式（3：mp3，4：pcm-16k，5：pcm-8k，6：wav）

echo "📝 生成 1/3: scan-success.mp3 (扫码成功)"
curl -s -o "$AUDIO_DIR/scan-success.mp3" \
  "https://fanyi.baidu.com/gettts?lan=zh&text=%E6%89%AB%E7%A0%81%E6%88%90%E5%8A%9F&spd=5&pit=8&vol=8&per=0&source=web"

if [ -f "$AUDIO_DIR/scan-success.mp3" ] && [ -s "$AUDIO_DIR/scan-success.mp3" ]; then
  size=$(ls -lh "$AUDIO_DIR/scan-success.mp3" | awk '{print $5}')
  echo "   ✅ 生成成功 ($size)"
else
  echo "   ❌ 生成失败"
fi

sleep 1

echo "📝 生成 2/3: scan-error.mp3 (扫码失败，请重试)"
curl -s -o "$AUDIO_DIR/scan-error.mp3" \
  "https://fanyi.baidu.com/gettts?lan=zh&text=%E6%89%AB%E7%A0%81%E5%A4%B1%E8%B4%A5%EF%BC%8C%E8%AF%B7%E9%87%8D%E8%AF%95&spd=5&pit=8&vol=8&per=0&source=web"

if [ -f "$AUDIO_DIR/scan-error.mp3" ] && [ -s "$AUDIO_DIR/scan-error.mp3" ]; then
  size=$(ls -lh "$AUDIO_DIR/scan-error.mp3" | awk '{print $5}')
  echo "   ✅ 生成成功 ($size)"
else
  echo "   ❌ 生成失败"
fi

sleep 1

echo "📝 生成 3/3: scan-claimed.mp3 (已被领取)"
curl -s -o "$AUDIO_DIR/scan-claimed.mp3" \
  "https://fanyi.baidu.com/gettts?lan=zh&text=%E5%B7%B2%E8%A2%AB%E9%A2%86%E5%8F%96&spd=5&pit=8&vol=8&per=0&source=web"

if [ -f "$AUDIO_DIR/scan-claimed.mp3" ] && [ -s "$AUDIO_DIR/scan-claimed.mp3" ]; then
  size=$(ls -lh "$AUDIO_DIR/scan-claimed.mp3" | awk '{print $5}')
  echo "   ✅ 生成成功 ($size)"
else
  echo "   ❌ 生成失败"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 音频生成完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 显示生成的文件
echo "📁 已生成文件："
ls -lh "$AUDIO_DIR"/*.mp3 2>/dev/null | awk '{printf "   %s  %s\n", $9, $5}'

echo ""
echo "🎵 语音列表："
echo "   1. scan-success.mp3 - \"扫码成功\""
echo "   2. scan-error.mp3   - \"扫码失败，请重试\""
echo "   3. scan-claimed.mp3 - \"已被领取\""
echo ""

echo "🔊 试听提示："
echo "   可在微信开发者工具中播放试听"
echo "   或使用 macOS 的 afplay 命令："
echo "   afplay miniprogram/assets/audio/scan-success.mp3"
echo ""

echo "✅ 下一步："
echo "   1. 在微信开发者工具中编译小程序"
echo "   2. 真机预览测试（模拟器无声音）"
echo "   3. 扫码验证语音效果"
echo ""
