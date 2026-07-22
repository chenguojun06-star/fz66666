import { useState, useCallback } from 'react';
import api from '@/utils/api';
import type { Message } from './types';
import type { SpeechRecognition as ISpeechRecognition, SpeechRecognitionEvent, SpeechRecognitionErrorEvent } from './speech.types';

interface UseVoiceInputOptions {
  handleSend: (text?: string) => Promise<void> | void;
  speak: (text: string) => void;
  setInputValue: (value: string) => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

export function useVoiceInput(options: UseVoiceInputOptions) {
  const { handleSend, speak, setInputValue, setMessages } = options;
  const [isRecording, setIsRecording] = useState(false);

  const handleVoiceInput = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      void handleSend('语音功能暂不支持该浏览器，请改用 Chrome。');
      return;
    }
    if (isRecording) return;
    const recognition: ISpeechRecognition = new SR();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setIsRecording(true);
    recognition.start();
    recognition.onresult = async (e: SpeechRecognitionEvent) => {
      const text = e.results[0][0].transcript.trim();
      setIsRecording(false);
      if (!text) return;
      setInputValue(text);
      try {
        const res = await api.post('/intelligence/voice/command', { transcribedText: text, mode: 'QUERY' });
        const data = (res as Record<string, unknown>)?.data ?? res;
        const answer: string = ((data as Record<string, unknown>)?.responseText ?? (data as Record<string, unknown>)?.speakableText ?? '') as string;
        if (answer) {
          setMessages(prev => [
            ...prev,
            { id: `voice-u-${Date.now()}`, role: 'user' as const, text },
            { id: `voice-a-${Date.now()}`, role: 'ai' as const, text: answer },
          ]);
          setInputValue('');
          speak(answer);
        } else {
          void handleSend(text);
        }
      } catch {
        void handleSend(text);
      }
    };
    recognition.onerror = (_e: SpeechRecognitionErrorEvent) => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
  }, [isRecording, handleSend, speak, setInputValue, setMessages]);

  return {
    isRecording,
    handleVoiceInput,
  };
}
