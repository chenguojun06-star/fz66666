// 扫码声音提示配置
// 使用微信云开发语音合成 API 生成语音

const VOICE_CONFIG = {
  // 语音类型：1-小姐姐温柔声音
  voiceType: 1,
  // 语速：0-2，建议 1.2（稍快）
  speed: 1.2,
  // 音量：0-2，建议 1.5（稍大声）
  volume: 1.5,
  // 音调：0-2，建议 1.0（自然）
  pitch: 1.0,
};

// 提示文本
const VOICE_TEXT = {
  success: '扫码成功',
  error: '扫码失败，请重试',
  duplicate: '重复扫码',
  claimed: '已被领取',
};

/**
 * 语音播放管理器
 */
class VoiceManager {
  constructor() {
    this.audioContext = null;
    this.enabled = true; // 默认启用语音
    this.initAudioContext();
  }

  /**
   * 初始化音频上下文
   */
  initAudioContext() {
    this.audioContext = wx.createInnerAudioContext();
    this.audioContext.obeyMuteSwitch = false; // 即使静音也播放
  }

  /**
   * 播放语音（使用本地音频文件）
   * @param {string} type - 语音类型：success/error/duplicate/claimed
   */
  play(type) {
    if (!this.enabled) {
      return;
    }

    try {
      this.playLocalAudio(type);
    } catch (error) {
      // 静默失败，不影响主流程
    }
  }

  /**
   * 播放本地音频文件
   * @param {string} type - 语音类型
   */
  playLocalAudio(type) {
    const audioMap = {
      success: '/assets/audio/scan-success.mp3',
      error: '/assets/audio/scan-error.mp3',
      duplicate: '/assets/audio/scan-duplicate.mp3',
      claimed: '/assets/audio/scan-claimed.mp3',
    };

    const src = audioMap[type];
    if (!src) {
      return;
    }

    // 检查文件是否存在
    wx.getFileSystemManager().access({
      path: src,
      success: () => {
        this.audioContext.src = src;
        this.audioContext.play();
      },
      fail: () => {
        console.warn('[VoiceManager] 音频文件不存在:', src);
      },
    });
  }

  /**
   * 启用/禁用语音
   * @param {boolean} enabled - 是否启用
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    try {
      wx.setStorageSync('voice_enabled', enabled);
    } catch (e) {
      // 存储失败静默处理
    }
  }

  /**
   * 获取语音启用状态
   * @returns {boolean}
   */
  getEnabled() {
    try {
      const enabled = wx.getStorageSync('voice_enabled');
      return enabled !== false; // 默认启用
    } catch (e) {
      return true;
    }
  }

  /**
   * 销毁音频上下文
   */
  destroy() {
    if (this.audioContext) {
      this.audioContext.destroy();
      this.audioContext = null;
    }
  }
}

// 创建全局单例
const voiceManager = new VoiceManager();

module.exports = {
  voiceManager,
  VoiceManager,
  VOICE_CONFIG,
  VOICE_TEXT,
};
