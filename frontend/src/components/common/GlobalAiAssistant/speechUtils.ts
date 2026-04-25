/**
 * 语音播报工具 — Edge-TTS 后端（微软晓晓自然人声）
 *
 * 前端 → POST /api/tts/speak → 后端 Edge-TTS WebSocket → MP3 音频 → 播放
 */

import api from '@/utils/api';

let currentAudio: HTMLAudioElement | null = null;

export function stopAllSpeech(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
}

function toSpeakable(raw: string): string {
  let s = raw;
  s = s.replace(/\|.*?\|/g, '');
  s = s.replace(/```[\s\S]*?```/g, '');
  s = s.replace(/`[^`]+`/g, '');
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/[*_~`#>\[\]\-]/g, '');
  s = s.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu, '');
  s = s.replace(/[\\n\\r]+/g, '，');
  s = s.replace(/\n+/g, '，');
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s;
}

async function speakWithEdgeTts(text: string): Promise<boolean> {
  try {
    const res = await api.post('/tts/speak', { text }, { responseType: 'blob', timeout: 15000 });
    const blob: Blob = res instanceof Blob ? res : (res as any)?.data ?? res;
    if (!(blob instanceof Blob) || blob.size === 0) return false;
    if (blob.type && blob.type.includes('json')) return false;

    stopAllSpeech();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.volume = 0.88;
    currentAudio = audio;

    await new Promise<void>((resolve, reject) => {
      audio.onended = () => { URL.revokeObjectURL(url); currentAudio = null; resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); currentAudio = null; reject(new Error('audio play error')); };
      audio.play().catch(reject);
    });
    return true;
  } catch {
    return false;
  }
}

export function speakText(text: string, isMuted: boolean): void {
  if (isMuted) return;

  const cleanText = toSpeakable(text);
  if (!cleanText.trim()) return;

  stopAllSpeech();
  speakWithEdgeTts(cleanText);
}
