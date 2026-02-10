// 云函数：文本转语音 (Text to Speech)
// 使用微信云开发的语音合成能力

const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

/**
 * 文本转语音云函数
 * @param {Object} event - 事件参数
 * @param {string} event.text - 要转换的文本
 * @param {number} event.voiceType - 语音类型：1-女声（温柔）、2-女声（甜美）、3-男声
 * @param {number} event.speed - 语速：0-2，默认 1.0
 * @param {number} event.volume - 音量：0-2，默认 1.0
 * @param {number} event.pitch - 音调：0-2，默认 1.0
 * @returns {Object} 返回音频文件的 fileID
 */
exports.main = async (event, context) => {
  const { text, voiceType = 1, speed = 1.2, volume = 1.5, pitch = 1.0 } = event;

  try {
    // 使用微信云开发的 TTS API
    // 注意：需要在云开发控制台开通"内容安全-语音合成"服务
    const result = await cloud.openapi.textToSpeech.voiceSynthesize({
      text,
      voiceType,
      speed,
      volume,
      pitch,
    });

    // 上传到云存储
    const fileName = `voice_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`;
    const uploadResult = await cloud.uploadFile({
      cloudPath: `voices/${fileName}`,
      fileContent: result.buffer,
    });

    return {
      success: true,
      fileID: uploadResult.fileID,
      fileName,
    };
  } catch (error) {
    console.error('[textToSpeech] 错误:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};
