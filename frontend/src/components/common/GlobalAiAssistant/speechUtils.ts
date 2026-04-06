/**
 * 语音播报工具 — 两层调制：业务场景识别 × 分段变调
 * 第一层：识别文本的业务情绪（逾期紧张/好消息欢快/数据报告沉稳/日常呆萌）定基调
 * 第二层：每个片段按标点（！蹦跶 / ？上扬 / 首句引入 / 末句收尾）在基调上叠加微调
 */

type Mood = 'urgent' | 'good' | 'report' | 'casual';

export function speakText(text: string, isMuted: boolean): void {
  if (isMuted) return;
  if (!('speechSynthesis' in window)) return;

  window.speechSynthesis.cancel();
  const cleanText = text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu, '');
  if (!cleanText.trim()) return;

  // eslint-disable-next-line no-undef
  const doSpeak = (voices: SpeechSynthesisVoice[]) => {
    const ttsText = cleanText.slice(0, 120);
    if (!ttsText.trim()) return;

    const voice = voices.find(v => v.lang.startsWith('zh') && (
      v.name.toLowerCase().includes('xiaoyi') ||
      v.name.toLowerCase().includes('xiaoxiao') ||
      v.name.toLowerCase().includes('xiaoyu') ||
      v.name.includes('女') ||
      v.name.toLowerCase().includes('female')
    )) ?? voices.find(v => v.lang.includes('zh'));

    // ① 第一层：业务情绪识别，根据关键词判断说话场景
    const mood: Mood = (() => {
      if (/逾期|延期|超期|紧急|风险|危|警告|超时|未完成|拖期|差\d+天|快来不及|来不及/.test(ttsText)) return 'urgent';
      if (/完成|入库|达成|顺利|好消息|超额|已完成|搞定|漂亮|太棒/.test(ttsText)) return 'good';
      if (/今日|共计|统计|合计|分析|扫码|共\d|总计|汇总|件数|订单数/.test(ttsText)) return 'report';
      return 'casual';
    })();

    // ② 情绪基准值
    const base = ({
      urgent: { pitch: 1.18, rate: 0.95 },
      good:   { pitch: 1.38, rate: 0.82 },
      report: { pitch: 1.22, rate: 0.8 },
      casual: { pitch: 1.3, rate: 0.78 },
    } as Record<Mood, { pitch: number; rate: number }>)[mood];

    // ③ 按标点拆段，短于2字的合并
    const rawSegments = ttsText.split(/(?<=[。！？…～~]+)/);
    const segments: string[] = [];
    let buf = '';
    for (const s of rawSegments) {
      buf += s;
      if (buf.replace(/\s/g, '').length >= 2) { segments.push(buf); buf = ''; }
    }
    if (buf.trim()) segments.push(buf);

    // ④ 第二层逐段叠加：在基调上按标点微调
    const speakSegment = (i: number) => {
      if (i >= segments.length) return;
      const seg = segments[i].trim();
      if (!seg) { speakSegment(i + 1); return; }

      const u = new SpeechSynthesisUtterance(seg);
      u.lang = 'zh-CN';
      if (voice) u.voice = voice;
      u.volume = 0.88;

      let p = base.pitch;
      let r = base.rate;

      if (/[！!]/.test(seg))              { p += 0.08; r += 0.04; }
      else if (/[？?]/.test(seg))         { p += 0.06; r -= 0.05; }
      else if (i === 0)                   { p += 0.06; }
      else if (i === segments.length - 1) { p -= 0.04; r -= 0.04; }

      u.pitch = Math.max(0.5, Math.min(2.0, p));
      u.rate  = Math.max(0.5, Math.min(1.5, r));
      u.onend = () => speakSegment(i + 1);
      window.speechSynthesis.speak(u);
    };

    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    speakSegment(0);
  };

  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    doSpeak(voices);
  } else {
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      doSpeak(window.speechSynthesis.getVoices());
    }, { once: true });
  }
}
