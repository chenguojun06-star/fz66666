import { useState, useRef, useCallback, useEffect } from 'react';

const SpeechRecognition = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

export default function useVoiceInput({ lang = 'zh-CN', continuous = false, onResult } = {}) {
  const [listening, setListening] = useState(false);
  const [supported] = useState(!!SpeechRecognition);
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) { console.warn('Voice abort:', e.message); }
        recognitionRef.current = null;
      }
    };
  }, []);

  const start = useCallback(() => {
    if (!SpeechRecognition) {
      setError('NOT_SUPPORTED');
      return false;
    }
    if (listening) return false;

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = continuous;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setListening(true);
      setError(null);
    };

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      if (onResult) onResult(transcript);
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognition.onerror = (event) => {
      setListening(false);
      recognitionRef.current = null;
      const errType = event.error;
      if (errType === 'not-allowed') {
        setError('PERMISSION_DENIED');
      } else if (errType === 'no-speech') {
        setError('NO_SPEECH');
      } else if (errType !== 'aborted') {
        setError(errType);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      return true;
    } catch (e) {
      setError('START_FAILED');
      return false;
    }
  }, [lang, continuous, listening, onResult]);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { console.warn('Voice stop:', e.message); }
      recognitionRef.current = null;
    }
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (listening) {
      stop();
    } else {
      start();
    }
  }, [listening, start, stop]);

  return { listening, supported, error, start, stop, toggle };
}
