#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from gtts import gTTS
import os

print("")
print("🎤 正在生成小姐姐语音...")
print("")

# 创建音频目录
audio_dir = "miniprogram/assets/audio"
os.makedirs(audio_dir, exist_ok=True)

# 生成 3 个语音文件
voices = [
    ('扫码成功', 'scan-success.mp3', '扫码成功'),
    ('扫码失败，请重试', 'scan-error.mp3', '扫码失败，请重试'),
    ('已被领取', 'scan-claimed.mp3', '已被领取')
]

for i, (text, filename, desc) in enumerate(voices, 1):
    print(f"📝 生成 {i}/3: {filename} ({desc})")

    tts = gTTS(text=text, lang='zh-CN', slow=False)
    filepath = os.path.join(audio_dir, filename)
    tts.save(filepath)

    size = os.path.getsize(filepath) / 1024
    print(f"   ✅ 生成成功 ({size:.1f} KB)")

print("")
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
print("✅ 音频生成完成！")
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
print("")

print("📁 已生成文件：")
for text, filename, desc in voices:
    filepath = os.path.join(audio_dir, filename)
    size = os.path.getsize(filepath) / 1024
    print(f"   {filename}  ({size:.1f} KB)")

print("")
print("🔊 试听：")
print(f"   afplay {audio_dir}/scan-success.mp3")
print("")
print("✅ 下一步：")
print("   1. 在微信开发者工具中编译")
print("   2. 真机预览测试")
print("")
