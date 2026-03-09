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
import api, { type ApiResult } from '@/utils/api';
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

type CloudMood = 'normal' | 'curious' | 'urgent' | 'error' | 'success';

// 超级可爱的表情云朵组件
const CuteCloudTrigger = ({ size = 52, active = false, mood = 'normal', loading = false, interacting = false }: { size?: number, active?: boolean, mood?: CloudMood, loading?: boolean, interacting?: boolean }) => {
  const isUrgent = mood === 'urgent';
  const isError = mood === 'error';
  const isSuccess = mood === 'success';
  const isCurious = mood === 'curious';

  let bodyAnim = styles.cloudBodyNormal;
  if (isUrgent) bodyAnim = styles.cloudBodyUrgent;
  if (isError) bodyAnim = styles.cloudBodyError;
  if (isSuccess) bodyAnim = styles.cloudBodySuccess;
  if (active || interacting) bodyAnim = styles.cloudBodyInteract;

  const stop1 = isUrgent ? "#fff0f0" : isError ? "#f2f5f8" : "#ffffff";
  const stop2 = isUrgent ? "#ffccc7" : isError ? "#d9e2ec" : "#dcf0ff";

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(0px 6px 12px rgba(24,144,255,0.4))' }}>
      <defs>
        <linearGradient id={`cloudGrad-${mood}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={stop1} style={{ transition: 'stop-color 0.3s' }} />
          <stop offset="100%" stopColor={stop2} style={{ transition: 'stop-color 0.3s' }} />
        </linearGradient>

        <clipPath id="leftEyeClip">
           <rect x="36" y="38" width="20" height="24" className={styles.eyelidLeft} />
        </clipPath>
        <clipPath id="rightEyeClip">
           <rect x="60" y="38" width="20" height="24" className={styles.eyelidRight} />
        </clipPath>
      </defs>

      <g transform={active ? "translate(0, 0)" : "translate(0, 5)"}>
        <g className={bodyAnim}>
           {/* 软萌云朵基础层 */}
           <path d="M 30 65 A 15 15 0 0 1 30 35 A 18 18 0 0 1 60 25 A 22 22 0 0 1 85 50 A 15 15 0 0 1 85 75 L 30 75 A 15 15 0 0 1 30 65 Z" fill={`url(#cloudGrad-${mood})`} style={{ transition: 'fill 0.3s' }} />

           {isUrgent && (
             <path d="M 78 35 Q 78 40 76 42 Q 74 40 74 35 Q 74 30 76 28 Q 78 30 78 35 Z" fill="#69c0ff" opacity="0.8" className={styles.sweatAnim} />
           )}
           {isSuccess && (
             <g className={styles.starsAnim}>
                <path d="M 20 30 L 22 35 L 27 35 L 23 38 L 25 43 L 20 40 L 15 43 L 17 38 L 13 35 L 18 35 Z" fill="#ffdd00" />
                <path d="M 85 25 L 86 28 L 89 28 L 87 30 L 88 33 L 85 31 L 82 33 L 83 30 L 81 28 L 84 28 Z" fill="#ff7a45" />
             </g>
           )}

           {isUrgent && (
             <g stroke="#4B6685" strokeWidth="2.5" strokeLinecap="round">
               <path d="M 40 45 L 48 48" />
               <path d="M 68 48 L 76 45" />
             </g>
           )}
           {isCurious && (
             <g stroke="#4B6685" strokeWidth="2" strokeLinecap="round">
               <path d="M 42 46 L 48 45" />
               <path d="M 68 45 L 74 46" />
             </g>
           )}

           {loading ? (
              <g stroke="#1890ff" strokeWidth="2.5" fill="none" strokeLinecap="round">
                <path d="M 46 50 A 4 4 0 1 1 45.9 50" className={styles.spinLeft} />
                <path d="M 70 50 A 4 4 0 1 1 69.9 50" className={styles.spinRight} />
              </g>
           ) : isError ? (
              <g>
                <path d="M 42 50 Q 46 45 50 50" fill="none" stroke="#4B6685" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M 66 50 Q 70 45 74 50" fill="none" stroke="#4B6685" strokeWidth="2.5" strokeLinecap="round" />
                <ellipse cx="46" cy="56" rx="2" ry="3" fill="#69c0ff" className={styles.tearTear} />
                <ellipse cx="70" cy="56" rx="2" ry="3" fill="#69c0ff" className={styles.tearTear} style={{ animationDelay: '0.5s' }} />
              </g>
           ) : isSuccess ? (
              <g fill="#ffbb96">
                 <path d="M 46 46 L 48 49 L 51 49 L 49 51 L 50 54 L 46 52 L 42 54 L 43 51 L 41 49 L 44 49 Z" />
                 <path d="M 70 46 L 72 49 L 75 49 L 73 51 L 74 54 L 70 52 L 66 54 L 67 51 L 65 49 L 68 49 Z" />
              </g>
           ) : (
              <g className={(interacting || active) ? styles.eyeFollowMouse : ''}>
                <g clipPath="url(#leftEyeClip)">
                  <circle cx={isCurious ? "48" : "46"} cy="50" r={isUrgent ? "5" : "6"} fill="#4B6685" style={{ transition: 'all 0.3s' }} />
                  <circle cx={isCurious ? "47" : "44"} cy="48" r={isUrgent ? "1.5" : "2"} fill="#ffffff" style={{ transition: 'all 0.3s' }} />
                  <circle cx={isCurious ? "49" : "47"} cy="52" r="1" fill="#ffffff" opacity="0.8" />
                </g>
                <g clipPath="url(#rightEyeClip)">
                  <circle cx={isCurious ? "68" : "70"} cy="50" r={isUrgent ? "5" : "6"} fill="#4B6685" style={{ transition: 'all 0.3s' }} />
                  <circle cx={isCurious ? "67" : "68"} cy="48" r={isUrgent ? "1.5" : "2"} fill="#ffffff" style={{ transition: 'all 0.3s' }} />
                  <circle cx={isCurious ? "69" : "71"} cy="52" r="1" fill="#ffffff" opacity="0.8" />
                </g>
              </g>
           )}

           {(!isError && !loading) && (
              <g opacity={isCurious ? "0.4" : "0.9"}>
                <ellipse cx="38" cy="58" rx="6" ry="3.5" fill={isUrgent ? "#ff4d4f" : "#FFA5BB"} className={styles.blushAnim} style={{ transition: 'fill 0.3s' }} />
                <ellipse cx="78" cy="58" rx="6" ry="3.5" fill={isUrgent ? "#ff4d4f" : "#FFA5BB"} className={styles.blushAnim} style={{ transition: 'fill 0.3s' }} />
              </g>
           )}

           <g>
             {loading ? (
               <line x1="56" y1="56" x2="60" y2="56" stroke="#4B6685" strokeWidth="2.5" strokeLinecap="round" />
             ) : isUrgent ? (
               <ellipse cx="58" cy="57" rx="2.5" ry="3.5" fill="none" stroke="#4B6685" strokeWidth="2" />
             ) : isError ? (
               <path d="M 55 58 Q 58 55 61 58" fill="none" stroke="#4B6685" strokeWidth="2.5" strokeLinecap="round" />
             ) : isSuccess ? (
               <path d="M 54 54 Q 58 62 62 54" fill="#FF8CA3" stroke="#FF8CA3" strokeWidth="1" strokeLinecap="round" />
             ) : (
               <path d="M 54 55 Q 58 60 62 55" fill="none" stroke="#FF8CA3" strokeWidth="2.5" strokeLinecap="round" style={{ transition: 'all 0.3s' }} />
             )}
           </g>
        </g>
      </g>
    </svg>
  );
};

const GlobalAiAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [mood, setMood] = useState<CloudMood>('normal');
  const [messages, setMessages] = useState<Message[]>([INITIAL_MSG]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [hasFetchedMood, setHasFetchedMood] = useState(false);

  useEffect(() => {
    if (hasFetchedMood) return;
    const fetchStatus = async () => {
      try {
        setHasFetchedMood(true);
        const res = await api.get('/dashboard/daily-brief', { timeout: 5000 });
        if (res?.data) {
          const { overdueOrderCount = 0, highRiskOrderCount = 0, todayScanCount = 0 } = res.data;
          let newMood: CloudMood = 'normal';
          let greeting = INITIAL_MSG.text;

          if (overdueOrderCount >= 5 || highRiskOrderCount >= 3) {
            newMood = 'urgent';
            greeting = `Hi 👋 紧急告警！发现 ${overdueOrderCount} 个近期待办和异常！小云有点着急，建议优先处理哦！有什么我可以帮您的吗？`;
          } else if (overdueOrderCount > 0 || highRiskOrderCount > 0) {
            newMood = 'curious';
            greeting = `Hi 👋 小云提醒您，目前系统有 ${overdueOrderCount} 个相关待办需要稍微留意下哦！`;
          } else if (todayScanCount > 100) {
            newMood = 'success';
            greeting = `Hi 👋 太棒啦！今天货期大盘非常健康，大家干劲满满呢！小云给您比心🤩 需要看点什么数据吗：`;
          } else {
            newMood = 'normal';
            greeting = `Hi 👋 欢迎使用云裳智链！今天货期状态平稳，一切顺利哦！\n您可以随时问我：`;
            // 时间彩蛋
            const hour = new Date().getHours();
            if (hour >= 0 && hour < 6) {
               greeting = `夜深了，系统仍在运转，小云陪您一起加班 🌙... 辛苦啦，需要帮您查什么吗？`;
            } else if (hour >= 12 && hour <= 14) {
               greeting = `中午好 ☀️ 吃过午饭了吗？小云刚刚伸了个懒腰，随时准备为您服务！`;
            } else if (hour >= 19) {
               greeting = `晚上好！今天的工作马上要收尾了，小云为您站好最后一班岗 🚀`;
            }
          }
          setMood(newMood);
          setMessages([{ ...INITIAL_MSG, text: greeting }]);
        }
      } catch (err) {
        console.error('Failed to fetch system mood', err);
        setMood('normal');
        setMessages([{ ...INITIAL_MSG, text: `Hi 👋 小云为您服务！网络好像开了个小差，但我依然在哦！\n您可以随时问我：` }]);
      }
    };
    fetchStatus();
  }, [hasFetchedMood]);

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
      // @ts-ignore
      const res = await intelligenceApi.aiAdvisorChat(text);
      // @ts-ignore
      const resultData = res?.data || res;

      const aiMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'ai',
        text: resultData?.answer || '抱歉呀😜，小云还在思考中…',
        intent: resultData?.source || 'ai'
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
                  <div style={{ whiteSpace: 'pre-wrap' }}>
                    {msg.text.includes('【推荐追问】：')
                      ? msg.text.split('【推荐追问】：')[0]
                      : msg.text}
                  </div>
                  {msg.text.includes('【推荐追问】：') && (
                    <div className={styles.recommendWrapper}>
                      <div className={styles.recommendTitle}>你可以接着问：</div>
                      <div className={styles.recommendPills}>
                        {msg.text.split('【推荐追问】：')[1].split('|').map((q, idx) => {
                          const question = q.trim();
                          if (!question) return null;
                          return (
                            <div
                              key={idx}
                              className={styles.recommendPill}
                              onClick={() => setInputValue(question)}
                            >
                              {question}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

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
