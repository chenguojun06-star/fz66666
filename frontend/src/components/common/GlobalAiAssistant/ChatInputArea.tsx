/**
 * ChatInputArea — 聊天输入区域（文件上传 + 图片/文件预览 + 表情面板 + 文本输入 + 语音/发送按钮）
 */
import React from 'react';
import {
  SendOutlined,
  LoadingOutlined,
  SoundOutlined,
  PaperClipOutlined,
  SmileOutlined,
} from '@ant-design/icons';
import { EMOJI_GROUPS } from './constants';
import styles from './index.module.css';
import emojiStyles from './EmojiPicker.module.css';

interface ChatInputAreaProps {
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  previewImage: string | null;
  attachedFile: File | null;
  setAttachedFile: React.Dispatch<React.SetStateAction<File | null>>;
  setPreviewImage: React.Dispatch<React.SetStateAction<string | null>>;
  isTyping: boolean;
  uploadingFile: boolean;
  isRecording: boolean;
  openTraceCenter: () => void;
  emojiPanelRef: React.RefObject<HTMLDivElement>;
  showEmojiPicker: boolean;
  setShowEmojiPicker: React.Dispatch<React.SetStateAction<boolean>>;
  emojiTab: number;
  setEmojiTab: React.Dispatch<React.SetStateAction<number>>;
  handleEmojiSelect: (emoji: string) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  inputValue: string;
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  handleVoiceInput: () => void;
  handleSendWithAttachment: () => void;
  sendWithContext: (text?: string) => void;
}

const ChatInputArea: React.FC<ChatInputAreaProps> = ({
  fileInputRef,
  handleFileSelect,
  previewImage,
  attachedFile,
  setAttachedFile,
  setPreviewImage,
  isTyping,
  uploadingFile,
  isRecording,
  openTraceCenter,
  emojiPanelRef,
  showEmojiPicker,
  setShowEmojiPicker,
  emojiTab,
  setEmojiTab,
  handleEmojiSelect,
  inputRef,
  inputValue,
  setInputValue,
  handleKeyDown,
  handleVoiceInput,
  handleSendWithAttachment,
  sendWithContext,
}) => {
  return (
    <div className={styles.inputArea}>
      <input ref={fileInputRef} type="file" style={{ display: 'none' }} accept=".xlsx,.xls,.csv,.jpg,.jpeg,.png,.gif,.pdf,.webp,.bmp" onChange={handleFileSelect} />

      {/* 图片预览区域 */}
      {previewImage && (
        <div style={{
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: '#f9fafb',
          borderRadius: 8,
          marginBottom: 8
        }}>
          <img
            src={previewImage}
            alt="预览"
            style={{
              width: 60,
              height: 60,
              objectFit: 'cover',
              borderRadius: 6,
              border: '1px solid var(--color-border)'
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>
              {attachedFile?.name || '图片'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
              即将上传并分析
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setAttachedFile(null);
              setPreviewImage(null);
            }}
            style={{
              padding: '4px 8px',
              border: 'none',
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              fontSize: 16,
              cursor: 'pointer'
            }}
            title="移除"
          >
            ×
          </button>
        </div>
      )}

      {/* 普通文件预览 */}
      {attachedFile && !previewImage && (
        <div className={styles.attachChip}>
          <span>📎 {attachedFile.name}</span>
          <button type="button" className={styles.attachChipRemove} onClick={() => setAttachedFile(null)}>×</button>
        </div>
      )}

      <div className={styles.inputRow}>
        <button type="button" className={styles.uploadBtn} title="上传文件" onClick={() => fileInputRef.current?.click()} disabled={isTyping || uploadingFile}>
          <PaperClipOutlined />
        </button>
        <button type="button" className={`${styles.uploadBtn} ${styles.traceBtn}`} title="查看AI记录" onClick={() => openTraceCenter()} disabled={isTyping || uploadingFile}>
          AI记录
        </button>
        <div className={emojiStyles.emojiWrapper} ref={emojiPanelRef}>
          <button type="button" className={`${styles.uploadBtn} ${showEmojiPicker ? emojiStyles.emojiActive : ''}`} title="表情" onClick={() => setShowEmojiPicker(v => !v)}>
            <SmileOutlined />
          </button>
          {showEmojiPicker && (
            <div className={emojiStyles.emojiPanel}>
              <div className={emojiStyles.emojiTabs}>
                {EMOJI_GROUPS.map((g, i) => (
                  <button type="button" key={g.label} className={`${emojiStyles.emojiTabBtn} ${emojiTab === i ? emojiStyles.emojiTabActive : ''}`} onClick={() => setEmojiTab(i)}>{g.label}</button>
                ))}
              </div>
              <div className={emojiStyles.emojiGrid}>
                {EMOJI_GROUPS[emojiTab].emojis.map((em, i) => (
                  <button type="button" key={`${em}-${i}`} className={emojiStyles.emojiItem} onClick={() => handleEmojiSelect(em)}>{em}</button>
                ))}
              </div>
            </div>
          )}
        </div>
        <input ref={inputRef} type="text" className={styles.chatInput} placeholder="直接说需求，也可以上传采购单据让我自动识别、到货或入库" value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={handleKeyDown} disabled={isTyping || uploadingFile} />
        <button type="button" className={styles.voiceBtn} title="语音输入" onClick={handleVoiceInput} disabled={isTyping || isRecording} style={{ color: isRecording ? 'var(--xiaoyun-danger)' : undefined }}>
          {isRecording ? <LoadingOutlined spin /> : <SoundOutlined />}<span>语音</span>
        </button>
        <button type="button" className={styles.sendBtn} onClick={() => attachedFile ? void handleSendWithAttachment() : sendWithContext()} disabled={(!inputValue.trim() && !attachedFile) || isTyping || uploadingFile}>
          {uploadingFile ? <LoadingOutlined /> : <SendOutlined />}<span>{uploadingFile ? '处理中' : '发送'}</span>
        </button>
      </div>
    </div>
  );
};

export default ChatInputArea;
