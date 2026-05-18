import { useState, useRef, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';

export function useEmojiPicker(setInputValue: Dispatch<SetStateAction<string>>, inputRef: React.RefObject<HTMLInputElement>) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiTab, setEmojiTab] = useState(0);
  const emojiPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showEmojiPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiPanelRef.current && !emojiPanelRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker]);

  const handleEmojiSelect = (emoji: string) => {
    setInputValue(prev => prev + emoji);
    inputRef.current?.focus();
  };

  return { showEmojiPicker, setShowEmojiPicker, emojiTab, setEmojiTab, emojiPanelRef, handleEmojiSelect };
}