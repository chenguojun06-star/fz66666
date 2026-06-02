import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button, message, Badge, Popover } from 'antd';
import {
  AudioOutlined,
  CloseCircleOutlined,
  RobotOutlined,
  SendOutlined,
  StopOutlined
} from '@ant-design/icons';
import './styles.css';

interface VoiceAssistantProps {
  className?: string;
}

const GlobalVoiceAssistant: React.FC<VoiceAssistantProps> = ({ className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 开始录音
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        await processAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsListening(true);
      setRecordingTime(0);
      setTranscript('');

      // 开始计时
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('录音权限获取失败:', error);
      message.error('麦克风权限被拒绝，请在浏览器设置中允许访问');
    }
  }, []);

  // 停止录音
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop();
      setIsListening(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isListening]);

  // 处理音频
  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true);
    try {
      // 模拟语音识别（实际项目中调用后端API）
      await new Promise(resolve => setTimeout(resolve, 1500));

      // 模拟识别结果
      const mockTranscripts = [
        '帮我查一下A款的订单进度',
        '创建一个新的生产订单',
        '今天有哪些待审批的事项',
        '物料库存还剩多少',
        '查看最近的工资报表'
      ];
      const randomTranscript = mockTranscripts[Math.floor(Math.random() * mockTranscripts.length)];
      setTranscript(randomTranscript);
      setHasUnread(true);

      // 自动触发小云AI处理
      setTimeout(() => {
        message.info('小云正在为您处理...');
      }, 500);

    } catch (error) {
      console.error('语音识别失败:', error);
      message.error('语音识别失败，请重试');
    } finally {
      setIsProcessing(false);
    }
  };

  // 格式化时间
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 清理
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (mediaRecorderRef.current && isListening) {
        mediaRecorderRef.current.stop();
      }
    };
  }, [isListening]);

  const voiceContent = (
    <div className="voice-panel">
      <div className="voice-header">
        <div className="voice-title">
          <RobotOutlined style={{ marginRight: 8, color: '#1890ff' }} />
          小云语音助手
        </div>
        <Button
          type="text"
          icon={<CloseCircleOutlined />}
          onClick={() => setIsOpen(false)}
        />
      </div>

      <div className="voice-body">
        {/* 录音状态 */}
        {isListening ? (
          <div className="recording-section">
            <div className="recording-animation">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="recording-bar" style={{ animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
            <div className="recording-time">{formatTime(recordingTime)}</div>
            <div className="recording-tip">正在聆听，请说话...</div>
          </div>
        ) : (
          <div className="idle-section">
            <div className="idle-icon">
              <AudioOutlined />
            </div>
            <div className="idle-text">点击下方按钮开始语音</div>
          </div>
        )}

        {/* 识别结果 */}
        {transcript && !isListening && (
          <div className="transcript-section">
            <div className="transcript-label">识别结果:</div>
            <div className="transcript-text">{transcript}</div>
          </div>
        )}

        {/* 处理中 */}
        {isProcessing && (
          <div className="processing-section">
            <div className="processing-spinner" />
            <div>小云正在思考...</div>
          </div>
        )}

        {/* 快捷语音命令 */}
        <div className="quick-commands">
          <div className="quick-commands-title">快捷命令:</div>
          <div className="quick-commands-list">
            {[
              '查订单进度',
              '创建新订单',
              '看库存',
              '待审批',
              '工资报表',
              '物料采购'
            ].map((cmd, idx) => (
              <Button
                key={idx}
                type="text"
                size="small"
                className="quick-command-btn"
                onClick={() => {
                  setTranscript(cmd);
                  message.info(`快捷命令: ${cmd}`);
                }}
              >
                {cmd}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="voice-footer">
        {isListening ? (
          <Button
            type="primary"
            danger
            size="large"
            icon={<StopOutlined />}
            onClick={stopRecording}
            block
          >
            停止录音
          </Button>
        ) : (
          <Button
            type="primary"
            size="large"
            icon={<AudioOutlined />}
            onClick={startRecording}
            block
          >
            按住说话
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* 悬浮按钮 */}
      <Popover
        content={voiceContent}
        title={null}
        trigger="click"
        placement="topRight"
        open={isOpen}
        onOpenChange={setIsOpen}
        arrow={false}
        overlayInnerStyle={{ padding: 0 }}
      >
        <div className={`global-voice-float ${className || ''}`}>
          <Badge dot={hasUnread} offset={[-4, 4]}>
            <Button
              type="primary"
              shape="circle"
              size="large"
              icon={<RobotOutlined />}
              className="voice-float-btn"
              onClick={() => setHasUnread(false)}
            />
          </Badge>
        </div>
      </Popover>

      {/* 全局快捷键提示 */}
      <div className="voice-shortcut-hint">
        按 Ctrl+Shift+V 快速唤醒语音助手
      </div>
    </>
  );
};

export default GlobalVoiceAssistant;
