import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  SendOutlined,
  CloseOutlined,
  SoundOutlined,
  ExportOutlined,
  DashboardOutlined
} from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { NlQueryResponse } from '@/services/production/productionApi';
import styles from './index.module.css';

interface Message {
  id: string;
  role: 'ai' | 'user';
  text: string;
  intent?: string;
  hasSpeech?: boolean;
}

const INITIAL_MSG: Message = {
  id: 'init-msg',
  role: 'ai',
  text: 'Hi 👋 欢迎使用云裳智链！我是您的专属管家「小云」☁️。\n您可以随时问我：',
};

const SUGGESTIONS = [
  '📄 智能日报', '📅 智能周报', '📊 智能月报',
  '🚨 逾期风险及解决方案', '📉 效率低谷与分析', '📦 面料库存缺口速查',
  '🔍 成本异常追踪分析', '🤖 智能派工推荐', '🏭 工厂综合表现'
];

// 超级可爱的表情云朵组件
const CuteCloudTrigger = ({ size = 52, active = false }: { size?: number, active?: boolean }) => (
  <svg viewBox="0 0 100 100" width={size} height={size} xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(0px 6px 12px rgba(24,144,255,0.4))' }}>
    <defs>
      <linearGradient id="cloudGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="100%" stopColor="#dcf0ff" />
      </linearGradient>
    </defs>
    <g transform={active ? "translate(0, 0)" : "translate(0, 5)"}>
      {/* 软萌云朵基础层 */}
      <path d="M 30 65 A 15 15 0 0 1 30 35 A 18 18 0 0 1 60 25 A 22 22 0 0 1 85 50 A 15 15 0 0 1 85 75 L 30 75 A 15 15 0 0 1 30 65 Z" fill="url(#cloudGrad)" />
      {/* 左眼组 (带眨眼动画) */}
      <g className={styles.cloudEye} style={{ transformOrigin: '46px 50px' }}>
        <circle cx="46" cy="50" r="6" fill="#4B6685" />
        <circle cx="44" cy="48" r="2" fill="#ffffff" />
        <circle cx="47" cy="52" r="1" fill="#ffffff" opacity="0.8" />
      </g>
      {/* 右眼组 (带眨眼动画) */}
      <g className={styles.cloudEye} style={{ transformOrigin: '70px 50px' }}>
        <circle cx="70" cy="50" r="6" fill="#4B6685" />
        <circle cx="68" cy="48" r="2" fill="#ffffff" />
        <circle cx="71" cy="52" r="1" fill="#ffffff" opacity="0.8" />
      </g>
      {/* 脸颊红晕 - 更大 */}
      <ellipse cx="38" cy="58" rx="6" ry="3.5" fill="#FFA5BB" opacity="0.9" />
      <ellipse cx="78" cy="58" rx="6" ry="3.5" fill="#FFA5BB" opacity="0.9" />
      {/* 呆萌张开的嘴巴 😯 */}
      <g className={styles.cloudMouthO}>
        <ellipse cx="58" cy="56" rx="3.5" ry="4" fill="#FF8CA3" />
        <ellipse cx="58" cy="55" rx="2.5" ry="2" fill="#802135" opacity="0.3" />
      </g>
      {/* 甜蜜微笑的嘴巴 😊 */}
      <g className={styles.cloudMouthSmile}>
        <path d="M 54 54 Q 58 60 62 54" fill="none" stroke="#FF8CA3" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    </g>
  </svg>
);

const GlobalAiAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([INITIAL_MSG]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const chatAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // 监听回车和滚到底部
  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages, isTyping, isOpen]);

  // 打开时自动聚焦并语音播报欢迎语（如果支持）
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
      // 初次打开时不强制播报，留给用户交互，防止扰民
    }
  }, [isOpen]);

  const handleSend = async (manualText?: string) => {
    const text = (manualText || inputValue).trim();
    if (!text || isTyping) return;

    // 1. 添加用户消息
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      text
    };
    setMessages(prev => [...prev, userMsg]);
    if (!manualText) setInputValue('');
    setIsTyping(true);

    // 2. 调用后台 AI 接口
    try {
      // @ts-ignore - any type mismatches will be absorbed
      const res = await intelligenceApi.nlQuery({ question: text });
      // @ts-ignore
      const resultData: NlQueryResponse = res?.data || res;

      const aiMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'ai',
        text: resultData?.answer || '抱歉呀😜，我还不太懂这个问题，数据好像迷路了😥',
        intent: resultData?.intent
      };

      setMessages(prev => [...prev, aiMsg]);

      // 可以自动播报简短的回答
      speak(aiMsg.text);

    } catch (error) {
      console.error('AI Query Error:', error);
      setMessages(prev => [...prev, {
        id: `e-${Date.now()}`,
        role: 'ai',
        text: '网络似乎有点小波动，小云暂时连不到数据中心了 🌧️ 请稍后再试！'
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  // 语音播报方法
  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      // 停止当前播报
      window.speechSynthesis.cancel();
      // 提取纯文本（过滤掉表情和特殊符号以便播报）
      const cleanText = text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu, '');
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'zh-CN';

      // 寻找更温柔自然的中文女声（类似豆包“温柔桃子”）
      const voices = window.speechSynthesis.getVoices();

      const preferredVoices = [
        'Xiaoxiao Online (Natural) - Chinese (Mainland)',  // 微软高质量自然声音（Edge浏览器独有）
        'Google 普通话（中国大陆）',                           // Chrome高质量女声
        'Microsoft Xiaoxiao Online (Natural)',
        'Microsoft Xiaoxiao',
        'XiaoxiaoNeural',
        'Ting-Ting'
      ];

      let selectedVoice = undefined;
      for (const vName of preferredVoices) {
        selectedVoice = voices.find(v => v.name.includes(vName) && v.lang.includes('zh'));
        if (selectedVoice) break;
      }

      // 兜底找一个中文女声
      if (!selectedVoice) {
        selectedVoice = voices.find(v => v.lang.includes('zh') && v.name.includes('Female'));
      }
      if (!selectedVoice) {
        selectedVoice = voices.find(v => v.lang.includes('zh'));
      }

      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      // 参照“温柔女生”的真人感调校：
      // 1. 语速调到 0.9 倍
      utterance.rate = 0.9;
      // 2. 音调调低一点，去除尖锐感（默认是 1.0）
      utterance.pitch = 0.85;
      // 3. 压低音量，模拟“带点气声、轻柔的声音”
      utterance.volume = 0.7;

      window.speechSynthesis.speak(utterance);
    }
  };

  const jumpToIntelligenceCenter = (query: string) => {
    setIsOpen(false);
    // 如果已经在智能驾驶舱，不跨路由跳转仅提示
    if (location.pathname !== '/intelligence/dashboard') {
      navigate('/intelligence/dashboard');
    }
  };

  return (
    <div className={styles.assistantWrapper}>
      {/* 弹出的对话面板 */}
      {isOpen && (
        <div className={styles.chatPanel}>
          {/* Header */}
          <div className={styles.panelHeader}>
            <div className={styles.avatarContainer}>
              <CuteCloudTrigger size={40} active />
            </div>
            <div className={styles.headerText}>
              <div className={styles.headerTitle}>小云 智能助理</div>
              <div className={styles.headerSubtitle}>云裳智链 · 实时数据支持</div>
            </div>
            <CloseOutlined
              className={styles.closeButton}
              onClick={() => setIsOpen(false)}
            />
          </div>

          {/* Chat List */}
          <div className={styles.chatArea} ref={chatAreaRef}>
            {/* Suggestion Chips - 像原来的智能顾问一样 */}
            {messages.length === 1 && (
              <div className={styles.suggestionChips}>
                {SUGGESTIONS.map(q => (
                  <div key={q} className={styles.chip} onClick={() => handleSend(q)}>
                    {q}
                  </div>
                ))}
              </div>
            )}

            {messages.map(msg => (
              <div
                key={msg.id}
                className={`${styles.messageRow} ${msg.role === 'ai' ? styles.rowAi : styles.rowUser}`}
              >
                {msg.role === 'ai' && (
                  <div className={styles.messageAvatar}>
                    <CuteCloudTrigger size={24} active />
                  </div>
                )}

                <div className={`${styles.messageBubble} ${msg.role === 'ai' ? styles.bubbleAi : styles.bubbleUser}`}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>

                  {/* 如果命中高级业务Intent，提示去全屏的太空舱查看完整看板 */}
                  {msg.role === 'ai' && msg.intent && (
                    <div
                      className={styles.intentWidgetHint}
                      onClick={() => jumpToIntelligenceCenter(msg.text)}
                    >
                      <ExportOutlined /> 在智能驾驶舱展开查看完整图表
                    </div>
                  )}
                </div>

                {/* 语音播报小按钮(仅AI部分) */}
                {msg.role === 'ai' && (
                  <button className={styles.speechBtn} onClick={() => speak(msg.text)} title="朗读回答">
                    <SoundOutlined />
                  </button>
                )}
              </div>
            ))}

            {/* Loading Indicator */}
            {isTyping && (
              <div className={`${styles.messageRow} ${styles.rowAi}`}>
                <div className={styles.messageAvatar}>
                  <CuteCloudTrigger size={24} active />
                </div>
                <div className={`${styles.messageBubble} ${styles.bubbleAi}`}>
                  <div className={styles.typingIndicator}>
                    <div className={styles.typingDot} />
                    <div className={styles.typingDot} />
                    <div className={styles.typingDot} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className={styles.inputArea}>
            <input
              ref={inputRef}
              type="text"
              className={styles.chatInput}
              placeholder="想问什么？回车发送..."
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isTyping}
            />
            <button
              className={styles.sendBtn}
              onClick={() => handleSend()}
              disabled={!inputValue.trim() || isTyping}
            >
              <SendOutlined />
            </button>
          </div>
        </div>
      )}

      {/* 悬浮图标开关 */}
      {!isOpen && (
        <div
          className={styles.triggerBtn}
          onClick={() => setIsOpen(true)}
          title="召唤小云智能助手"
        >
          <CuteCloudTrigger size={56} />
        </div>
      )}
    </div>
  );
};

export default GlobalAiAssistant;
