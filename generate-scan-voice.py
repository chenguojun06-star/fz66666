#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
扫码语音自动生成脚本
使用百度 AI 文字转语音 API 生成小姐姐声音提示

使用方法：
1. 安装依赖：pip install baidu-aip
2. 修改下方的 API 配置（免费注册：https://ai.baidu.com/）
3. 运行脚本：python generate-scan-voice.py
"""

import os
import sys

# 检查依赖
try:
    from aip import AipSpeech
except ImportError:
    print("❌ 缺少依赖库，请运行：pip install baidu-aip")
    sys.exit(1)

# ==================== 配置区 ====================

# 百度 AI 配置（需要注册获取，免费）
# 注册地址：https://ai.baidu.com/tech/speech/tts
APP_ID = 'your_app_id'        # 替换为你的 APP_ID
API_KEY = 'your_api_key'      # 替换为你的 API_KEY
SECRET_KEY = 'your_secret_key'  # 替换为你的 SECRET_KEY

# 输出目录
OUTPUT_DIR = './miniprogram/assets/audio'

# ==================== 语音配置 ====================

# 提示文本
VOICE_TEXTS = {
    'scan-success.mp3': '扫码成功',
    'scan-error.mp3': '扫码失败，请重试',
    'scan-duplicate.mp3': '重复扫码',
}

# 语音参数（小姐姐温柔声音）
VOICE_PARAMS = {
    'vol': 8,   # 音量（0-15），建议 7-9
    'pit': 6,   # 音调（0-15），建议 5-7（越高越甜美）
    'spd': 5,   # 语速（0-15），建议 5（正常）或 6（稍快）
    'per': 0,   # 发音人：0-度小美（温柔女声）｜1-度小宇｜3-度逍遥｜4-度丫丫
}

# ==================== 主程序 ====================

def check_config():
    """检查配置是否填写"""
    if APP_ID == 'your_app_id':
        print("\n⚠️  请先配置百度 AI 密钥！\n")
        print("获取密钥步骤：")
        print("1. 访问：https://ai.baidu.com/tech/speech/tts")
        print("2. 点击「立即使用」并登录")
        print("3. 创建应用获取 APP_ID、API_KEY、SECRET_KEY")
        print("4. 将密钥填入本脚本的「配置区」\n")
        return False
    return True

def generate_voice():
    """生成语音文件"""
    if not check_config():
        return

    # 创建输出目录
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 初始化客户端
    client = AipSpeech(APP_ID, API_KEY, SECRET_KEY)

    print("\n======================================"
    print("  🎤 扫码语音自动生成")
    print("======================================\n")

    success_count = 0
    total_size = 0

    for filename, text in VOICE_TEXTS.items():
        output_path = os.path.join(OUTPUT_DIR, filename)

        print(f"🔊 生成中: {filename}")
        print(f"   文本: \"{text}\"")

        try:
            # 调用百度 AI 合成语音
            result = client.synthesis(
                text,
                'zh',  # 语言
                1,     # 客户端类型
                VOICE_PARAMS
            )

            # 检查是否成功
            if isinstance(result, dict):
                # 返回字典表示出错
                print(f"   ❌ 生成失败: {result.get('error_msg', '未知错误')}\n")
                continue

            # 保存文件
            with open(output_path, 'wb') as f:
                f.write(result)

            file_size = len(result) / 1024  # KB
            total_size += file_size
            success_count += 1

            print(f"   ✅ 生成成功: {file_size:.1f} KB")
            print(f"   📁 保存位置: {output_path}\n")

        except Exception as e:
            print(f"   ❌ 生成失败: {str(e)}\n")

    # 总结
    print("======================================")
    print(f"✅ 完成！成功生成 {success_count}/{len(VOICE_TEXTS)} 个文件")
    print(f"📊 总大小: {total_size:.1f} KB")
    print("======================================\n")

    if success_count > 0:
        print("📝 下一步：")
        print("1. 检查音频文件是否正常（可用播放器试听）")
        print("2. 确保文件在 miniprogram/assets/audio/ 目录")
        print("3. 在微信开发者工具中编译小程序")
        print("4. 真机测试扫码功能\n")
    else:
        print("⚠️  没有成功生成任何文件，请检查：")
        print("1. API 密钥是否正确")
        print("2. 网络连接是否正常")
        print("3. 百度 AI 账号是否欠费\n")

def main():
    """主函数"""
    print("\n" + "="*60)
    print("  扫码语音自动生成工具")
    print("  使用百度 AI - 小姐姐温柔声音")
    print("="*60)

    generate_voice()

    print("\n💡 提示：")
    print("   - 如需调整音量/语速，修改脚本中的 VOICE_PARAMS")
    print("   - 如需更换发音人，修改 'per' 参数")
    print("   - 发音人选项：0-度小美｜3-度逍遥｜4-度丫丫")
    print("   - 免费额度：每天 5000 次调用（足够使用）\n")

if __name__ == '__main__':
    main()
