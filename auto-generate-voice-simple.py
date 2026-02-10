#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
自动生成扫码语音文件 - 完全免费，无需配置
使用 Google Text-to-Speech (gTTS) - 免费、无需 API key
"""

import os
import sys

def check_dependencies():
    """检查并安装依赖"""
    try:
        import gtts
        return True
    except ImportError:
        print("📦 正在安装依赖 gTTS...")
        os.system("pip3 install gtts -q")
        try:
            import gtts
            print("   ✅ 依赖安装成功")
            return True
        except:
            print("   ❌ 依赖安装失败")
            print("   请手动运行: pip3 install gtts")
            return False

def generate_voice_files():
    """生成语音文件"""
    from gtts import gTTS

    print("")
    print("🎤 正在自动生成小姐姐语音...")
    print("")

    # 创建音频目录
    audio_dir = "miniprogram/assets/audio"
    os.makedirs(audio_dir, exist_ok=True)

    # 语音配置
    voices = [
        {
            'text': '扫码成功',
            'filename': 'scan-success.mp3',
            'description': '扫码成功'
        },
        {
            'text': '扫码失败，请重试',
            'filename': 'scan-error.mp3',
            'description': '扫码失败，请重试'
        },
        {
            'text': '已被领取',
            'filename': 'scan-claimed.mp3',
            'description': '已被领取'
        }
    ]

    # 生成音频文件
    for i, voice in enumerate(voices, 1):
        print(f"📝 生成 {i}/{len(voices)}: {voice['filename']} ({voice['description']})")

        try:
            # 使用 Google TTS 生成语音
            # lang='zh-CN': 中文（普通话）
            # slow=False: 正常语速
            tts = gTTS(text=voice['text'], lang='zh-CN', slow=False)

            filepath = os.path.join(audio_dir, voice['filename'])
            tts.save(filepath)

            # 检查文件大小
            if os.path.exists(filepath):
                size = os.path.getsize(filepath)
                size_kb = size / 1024
                print(f"   ✅ 生成成功 ({size_kb:.1f} KB)")
            else:
                print(f"   ❌ 生成失败")

        except Exception as e:
            print(f"   ❌ 生成失败: {e}")

    print("")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("✅ 音频生成完成！")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("")

    # 显示生成的文件
    print("📁 已生成文件：")
    for voice in voices:
        filepath = os.path.join(audio_dir, voice['filename'])
        if os.path.exists(filepath):
            size = os.path.getsize(filepath) / 1024
            print(f"   {voice['filename']}  ({size:.1f} KB)")

    print("")
    print("🎵 语音列表：")
    for i, voice in enumerate(voices, 1):
        print(f"   {i}. {voice['filename']} - \"{voice['description']}\"")

    print("")
    print("🔊 试听提示：")
    print("   macOS: afplay miniprogram/assets/audio/scan-success.mp3")
    print("   或在微信开发者工具中播放")
    print("")

    print("✅ 下一步：")
    print("   1. 在微信开发者工具中编译小程序")
    print("   2. 真机预览测试（模拟器无声音）")
    print("   3. 扫码验证语音效果")
    print("")

if __name__ == '__main__':
    if not check_dependencies():
        sys.exit(1)

    generate_voice_files()
