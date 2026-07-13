'use strict';

const SUCCESS_AUDIO = '/assets/audio/scan-success.wav';
const ERROR_AUDIO = '/assets/audio/scan-error.wav';

let _successAudio = null;
let _errorAudio = null;
let _audioEnabled = true;

function _getSuccessAudio() {
  if (!_successAudio) {
    try {
      _successAudio = wx.createInnerAudioContext();
      _successAudio.src = SUCCESS_AUDIO;
      _successAudio.volume = 0.8;
      _successAudio.onError(function(e) {
        console.warn('[ScanFeedback] 成功音效加载失败:', e.errMsg || e);
      });
    } catch (e) {
      console.warn('[ScanFeedback] 创建成功音效实例失败:', e);
      _successAudio = null;
    }
  }
  return _successAudio;
}

function _getErrorAudio() {
  if (!_errorAudio) {
    try {
      _errorAudio = wx.createInnerAudioContext();
      _errorAudio.src = ERROR_AUDIO;
      _errorAudio.volume = 0.8;
      _errorAudio.onError(function(e) {
        console.warn('[ScanFeedback] 失败音效加载失败:', e.errMsg || e);
      });
    } catch (e) {
      console.warn('[ScanFeedback] 创建失败音效实例失败:', e);
      _errorAudio = null;
    }
  }
  return _errorAudio;
}

function playSuccess() {
  if (!_audioEnabled) return;
  try {
    const audio = _getSuccessAudio();
    if (audio) {
      try { audio.stop(); } catch (_) {}
      audio.play();
    }
  } catch (e) {
    console.warn('[ScanFeedback] 播放成功音效失败:', e);
  }
  try {
    wx.vibrateShort({ type: 'light' });
  } catch (_) {}
}

function playError() {
  if (!_audioEnabled) return;
  try {
    const audio = _getErrorAudio();
    if (audio) {
      try { audio.stop(); } catch (_) {}
      audio.play();
    }
  } catch (e) {
    console.warn('[ScanFeedback] 播放失败音效失败:', e);
  }
  try {
    wx.vibrateLong();
  } catch (_) {}
}

function setEnabled(enabled) {
  _audioEnabled = !!enabled;
}

function isEnabled() {
  return _audioEnabled;
}

module.exports = {
  playSuccess: playSuccess,
  playError: playError,
  setEnabled: setEnabled,
  isEnabled: isEnabled,
};
