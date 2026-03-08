import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  SendOutlined,
  CloseOutlined,
  SoundOutlined,
  ExportOutlined,
  DashboardOutlined
} from '@ant-design/icons';
import api from "@/utils/api";
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
      {/* 眼睛 - 超大呆萌 */}
      <circle cx="46" cy="51" r="5.5" fill="#3B4C63" />
      <circle cx="68" cy="51" r="5.5" fill="#3B4C63" />
      {/* 眼睛的高光（大星星眼） */}
      <circle cx="44.5" cy="49" r="2" fill="#ffffff" />
      <circle cx="47.5" cy="53" r="0.8" fill="#ffffff" opacity="0.8" />
      <circle cx="66.5" cy="49" r="2" fill="#ffffff" />
      <circle cx="69.5" cy="53" r="0.8" fill="#ffffff" opacity="0.8" />
      {/* 脸颊红晕 - 更大更粉 */}
      <ellipse cx="38" cy="58" rx="6" ry="3.5" fill="#FF99B3" opacity="0.9" />
      <ellipse cx="76" cy="58" rx="6" ry="3.5" fill="#FF99B3" opacity="0.9" />
      {/* 圆圆的呆萌小嘴巴（吃惊/卖萌状） */}
      <ellipse cx="57" cy="57" rx="3.5" ry="4" fill="#FF8CA3" />
      <ellipse cx="57" cy="56" rx="2.5" ry="2" fill="#802135" opacity="0.3" />
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
    // --- 智能日报/周报/月报拦截逻辑开始 ---
    if (text.includes('日报') || text.includes('周报') || text.includes('月报')) {
      try {
        let typeName = '日报';
        if (text.includes('周报')) typeName = '周报';
        if (text.includes('月报')) typeName = '月报';

        // 获取完全真实的后台数据
        let realData: any = null;
        try {
          const res: any = await api.get('/dashboard/daily-brief', { timeout: 5000 });
          if (res && res.code === 200) {
            realData = res.data;
          }
        } catch(err) {
          console.log('Ignore fetching real brief data error', err);
        }

        if (!realData) {
          const fallbackMsg: Message = {
                id: `a-${Date.now()}`,
                role: 'ai',
                text: '未能获取真实业务数据，请检查网络或稍后重试。'
            };
            setMessages(prev => [...prev, fallbackMsg]);
            speak('抱歉获取失败，请稍后重试。');
            return;
        }

        // 基于真实数据构建
        const inboundQty = realData.yesterdayWarehousingQuantity || 0;
        const todayScan = realData.todayScanCount || 0;
        const overdueCount = realData.overdueOrderCount || 0;
        const highRiskCount = realData.highRiskOrderCount || 0;
        const weekScan = realData.weekScanCount || 0;

        let timeDesc = `昨日入库：${inboundQty}件，今日扫码：${todayScan}次`;
        if (typeName === '周报' || typeName === '月报') {
          timeDesc = `近7天入库：${realData.weekWarehousingCount || 0}件，近7天扫码：${weekScan}次`;
        }

        let topOrderText = '';
        if (realData.topPriorityOrder) {
          topOrderText = `📌 首要紧迫订单：${realData.topPriorityOrder.orderNo} (款号: ${realData.topPriorityOrder.styleNo})
   - 委外工厂：${realData.topPriorityOrder.factoryName || '未分配'}
   - 当前进度：${realData.topPriorityOrder.progress}%
   - 到期剩余：${realData.topPriorityOrder.daysLeft} 天`;
        }

        let suggestionsText = '';
        if (realData.suggestions && realData.suggestions.length > 0) {
            suggestionsText = `💡 智能建议：\n` + realData.suggestions.map((s: string) => `• ${s}`).join('\n');
        } else {
            suggestionsText = `✓ 系统运行正常，无特别预警`;
        }

        const reportText = `📊 【智能${typeName}】(基于真实数据)\n  \n📈 1. 系统真实活跃：\n• ${timeDesc}\n• 逾期订单：${overdueCount} 单\n• 高风险订单：${highRiskCount} 单\n\n${topOrderText}\n\n${suggestionsText}`;

        const aiMsg: Message = {
          id: `a-${Date.now()}`,
          role: 'ai',
          text: reportText
        };

        setMessages(prev => [...prev, aiMsg]);
        speak(`为您生成了基于真实数据的智能${typeName}，请查阅`);
      } catch (e) {
        console.error('Report generation error:', e);
      } finally {
        setIsTyping(false);
      }
      return;
    }
    // --- 智能日报/周报/月报拦截逻辑结束 ---
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
      
      // 寻找更系统/更可爱的中文女声
      const voices = window.speechSynthesis.getVoices();
      const cuteVoice = voices.find(v => 
        v.lang.includes('zh') && (
          v.name.includes('Xiaoxiao') || 
          v.name.includes('Ting-Ting') || 
          v.name.includes('Tingting') || 
          v.name.includes('Mei-Jia') || 
          v.name.includes('Yuehua')
        )
      );
      if (cuteVoice) {
        utterance.voice = cuteVoice;
      }
      
      utterance.rate = 1.05; // 稍微放慢一点点，显得呆萌
      utterance.pitch = 1.6; // 提高音调，更加可爱轻快
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
