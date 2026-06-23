import React, { useRef, useState } from 'react';
import { App, Button, Dropdown, Input, Modal, Popover, Select, Space, Upload, message as antMessage, Spin } from 'antd';
import { DownOutlined, RobotOutlined } from '@ant-design/icons';
import { sortSizeNames } from '@/utils/api';
import api from '@/utils/api';
import { TemplateLibrary } from '@/types/style';

interface Props {
  editMode: boolean;
  readOnly?: boolean;
  loading: boolean;
  saving: boolean;
  templateLoading: boolean;
  selectedRowKeys: React.Key[];
  setSelectedRowKeys: React.Dispatch<React.SetStateAction<React.Key[]>>;
  openBatchGradingConfig: () => void;
  enterEdit: () => void;
  exitEdit: () => void;
  saveAll: () => void;
  sizeTemplates: TemplateLibrary[];
  sizeTemplateKey: string | undefined;
  setSizeTemplateKey: (v: string | undefined) => void;
  applySizeTemplate: (templateId: string, mode: 'merge' | 'overwrite') => void;
  newGroupName: string;
  setNewGroupName: (v: string) => void;
  confirmAddGroup: () => void;
  sizeOptions: Array<{ value: string; label: string }>;
  setSizeOptions: React.Dispatch<React.SetStateAction<Array<{ value: string; label: string }>>>;
  sizeColumns: string[];
  mergeSizeColumns: (additions: string[]) => void;
  fetchSizeDictOptions: () => void;
  message: { error: (msg: string) => void; loading: (msg: string) => void };
  styleId: string | number;
  onSizeTableRecognized: (result: { sizes: string[]; parts: any[] }) => void;
}

const StyleSizeToolbar: React.FC<Props> = ({
  editMode, readOnly, loading, saving, templateLoading,
  selectedRowKeys, setSelectedRowKeys, openBatchGradingConfig,
  enterEdit, exitEdit, saveAll,
  sizeTemplates, sizeTemplateKey, setSizeTemplateKey, applySizeTemplate,
  newGroupName, setNewGroupName, confirmAddGroup,
  sizeOptions, setSizeOptions, sizeColumns, mergeSizeColumns, fetchSizeDictOptions, message,
  styleId, onSizeTableRecognized,
}) => {
  const isReadonly = Boolean(readOnly);
  const { modal } = App.useApp();
  const sizeSearchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [ocrModalOpen, setOcrModalOpen] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrFile, setOcrFile] = useState<any>(null);

  const handleOcrRecognize = async () => {
    if (!ocrFile) {
      antMessage.error('请先上传尺寸表图片');
      return;
    }
    setOcrLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', ocrFile);
      
      const res = await api.post(`/style/info/${styleId}/recognize-size-table`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000 // Agnes视觉模型最长60秒，前端对齐后端超时
      });
      
      if (res.code !== 200) {
        antMessage.error(res.message || 'AI识别失败');
      } else {
        const data = res.data || {};
        console.log('[AI识别] 后端解析结果:', data, ' 原始AI文本:', data?.rawJson);

        // 1) 优先使用后端已经解析好的 { sizes, parts }
        let recognized = data;
        const hasSizes = Array.isArray(recognized?.sizes) && recognized.sizes.length > 0;
        const hasParts = Array.isArray(recognized?.parts) && recognized.parts.length > 0;

        // 2) 如果后端没解析成功，fallback 到客户端再次尝试解析 rawJson
        if (!hasSizes && !hasParts && data?.rawJson) {
          const extractJson = (text: string): string => {
            const s = String(text || '').trim();
            const firstOpen = s.indexOf('{');
            const lastClose = s.lastIndexOf('}');
            if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
              return s.slice(firstOpen, lastClose + 1);
            }
            return s;
          };

          let rawText = String(data.rawJson || '').trim();
          if (rawText.startsWith('```json')) rawText = rawText.slice(7);
          if (rawText.startsWith('```')) rawText = rawText.slice(3);
          if (rawText.endsWith('```')) rawText = rawText.slice(0, -3);
          rawText = rawText.trim();

          let parsed: any = null;
          for (const attempt of [rawText, extractJson(rawText)]) {
            try {
              parsed = JSON.parse(attempt);
              if (parsed && typeof parsed === 'object') break;
              parsed = null;
            } catch {
              parsed = null;
            }
          }
          if (parsed && (parsed.sizes || parsed.parts)) {
            recognized = parsed;
            console.log('[AI识别] 客户端二次解析成功:', recognized);
          }
        }

        const finalSizes = Array.isArray(recognized?.sizes) ? recognized.sizes : [];
        const finalParts = Array.isArray(recognized?.parts) ? recognized.parts : [];

        if (finalSizes.length === 0 && finalParts.length === 0) {
          const preview = String(data?.rawJson || '').replace(/^[`\s]+|[`\s]+$/g, '').slice(0, 80);
          antMessage.error(preview ? `AI返回：${preview}（请上传尺码表图片重试）` : 'AI返回为空，请重试');
          return;
        }

        onSizeTableRecognized({ sizes: finalSizes, parts: finalParts });
        setOcrModalOpen(false);
        setOcrFile(null);
        antMessage.success(
          finalSizes.length
            ? `识别成功！新增 ${finalSizes.length} 个尺码、${finalParts.length} 个部位`
            : `识别成功！导入 ${finalParts.length} 个部位数据`,
        );
      }
    } catch (e: unknown) {
      console.error('[AI识别] 请求失败:', e);
      antMessage.error(e instanceof Error ? e.message : 'AI识别失败，请重试');
    } finally {
      setOcrLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {editMode && !readOnly && selectedRowKeys.length > 0 && (
          <Button type="primary" onClick={openBatchGradingConfig}>
            批量配置跳码区 ({selectedRowKeys.length})
          </Button>
        )}
        {editMode && !readOnly && selectedRowKeys.length > 0 && (
          <Button onClick={() => setSelectedRowKeys([])}>取消选择</Button>
        )}
      </div>
      <Space>
        {!editMode || readOnly ? (
          <Button type="primary" onClick={enterEdit} disabled={loading || saving || isReadonly}>
            编辑
          </Button>
        ) : (
          <>
            <Button type="primary" onClick={saveAll} loading={saving}>保存</Button>
            <Button
              disabled={saving}
              onClick={() => {
                modal.confirm({ width: '30vw', title: '放弃未保存的修改？', onOk: exitEdit });
              }}
            >取消</Button>
          </>
        )}
        {!editMode && !readOnly && (
          <Button 
            icon={<RobotOutlined />} 
            onClick={() => setOcrModalOpen(true)}
            disabled={loading || saving}
          >
            AI识别尺寸表
          </Button>
        )}
        <Select
          allowClear
          style={{ width: 220 }}
          placeholder="导入尺寸模板"
          value={sizeTemplateKey}
          onChange={(v) => setSizeTemplateKey(v)}
          options={sizeTemplates.map((t) => ({
            value: String(t.id || ''),
            label: t.sourceStyleNo ? `${t.templateName}（${t.sourceStyleNo}）` : t.templateName,
          }))}
          disabled={loading || saving || isReadonly || templateLoading}
        />
        <Dropdown
          disabled={loading || saving || isReadonly || templateLoading}
          menu={{
            items: [
              { key: 'overwrite', label: '覆盖导入（清除现有数据）' },
              { key: 'merge', label: '追加导入（保留现有数据）' },
            ],
            onClick: ({ key }) => {
              if (!sizeTemplateKey) { message.error('请选择模板'); return; }
              applySizeTemplate(sizeTemplateKey, key as 'merge' | 'overwrite');
            },
          }}
        >
          <Button disabled={loading || saving || isReadonly || templateLoading}>
            导入模板 <DownOutlined />
          </Button>
        </Dropdown>
        <Popover
          trigger="click"
          placement="bottom"
          content={
            <Space.Compact style={{ width: 220 }}>
              <Input
                placeholder="如：上装区 / 下装区"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onPressEnter={confirmAddGroup}
                style={{ width: 160 }}
              />
              <Button type="primary" onClick={confirmAddGroup}>确定</Button>
            </Space.Compact>
          }
        >
          <Button disabled={loading || saving || isReadonly}>新增分组</Button>
        </Popover>
        <Select
          mode="multiple"
          allowClear
          showSearch
          placeholder="新增尺码(多选)"
          style={{ minWidth: 160 }}
          disabled={loading || saving || isReadonly}
          options={sizeOptions.filter((opt) => !sizeColumns.includes(opt.value))}
          value={[]}
          onChange={(values) => {
            if (!values.length) return;
            mergeSizeColumns(values);
          }}
          filterOption={(input, option) =>
            String(option?.value || '').toLowerCase().includes(String(input || '').toLowerCase())
          }
          onSearch={(value) => {
            const trimmed = value && value.trim();
            if (sizeSearchTimerRef.current) clearTimeout(sizeSearchTimerRef.current);
            sizeSearchTimerRef.current = setTimeout(() => {
              if (trimmed && !sizeOptions.some((opt) => opt.value === trimmed) && !sizeColumns.includes(trimmed)) {
                setSizeOptions((prev) => [...prev, { value: trimmed, label: trimmed }]);
              }
            }, 300);
          }}
          popupRender={(menu) => (
            <>
              {menu}
              <div style={{ padding: '8px', borderTop: '1px solid var(--color-border-light)' }}>
                <Input
                  placeholder="输入新码数后回车添加"
                 
                  onPressEnter={(e) => {
                    const input = e.target as HTMLInputElement;
                    const val = input.value.trim();
                    if (val && !sizeColumns.includes(val) && !sizeOptions.some((opt) => opt.value === val)) {
                      mergeSizeColumns(sortSizeNames([val]).filter((s) => !sizeColumns.includes(s)));
                      input.value = '';
                    }
                  }}
                />
              </div>
            </>
          )}
          onOpenChange={(open) => { if (open) fetchSizeDictOptions(); }}
        />
      </Space>

      {/* AI识别尺寸表 Modal */}
      <Modal
        title="AI识别尺寸表"
        open={ocrModalOpen}
        onCancel={() => { setOcrModalOpen(false); setOcrFile(null); }}
        onOk={handleOcrRecognize}
        okText="识别"
        confirmLoading={ocrLoading}
        width={480}
      >
        <Spin spinning={ocrLoading} tip="正在识别，请稍候...">
          <div
            style={{ padding: '16px 0', outline: 'none' }}
            onPaste={(e) => {
              const files = e.clipboardData.files;
              if (files && files.length > 0) {
                e.preventDefault();
                const f = files[0];
                if (f.type.startsWith('image/')) {
                  setOcrFile(f);
                }
                return;
              }
              const items = e.clipboardData.items;
              for (let i = 0; i < items.length; i++) {
                if (items[i].type.startsWith('image/')) {
                  e.preventDefault();
                  const f = items[i].getAsFile();
                  if (f) setOcrFile(f);
                  break;
                }
              }
            }}
          >
            <Upload.Dragger
              accept="image/*"
              maxCount={1}
              beforeUpload={(file) => {
                setOcrFile(file);
                return false; // 阻止自动上传
              }}
              onRemove={() => setOcrFile(null)}
              fileList={ocrFile ? [{ uid: '-1', name: ocrFile.name, status: 'done', url: '', originFileObj: ocrFile }] : []}
            >
              <p className="ant-upload-drag-icon">
                <RobotOutlined style={{ fontSize: 48, color: 'var(--primary-color)' }} />
              </p>
              <p className="ant-upload-text">点击上传尺寸表图片</p>
              <p className="ant-upload-hint">
                支持 JPG、PNG 格式，图片中应包含尺码名称和部位尺寸数值<br/>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>也可以直接粘贴图片（Ctrl+V）</span>
              </p>
            </Upload.Dragger>
            
            {!ocrLoading && ocrFile && (
              <div style={{ marginTop: 16, padding: 12, background: '#f6ffed', borderRadius: 8, border: '1px solid #b7eb8f' }}>
                <p style={{ margin: 0, color: 'var(--color-success)', fontWeight: 500 }}>
                  已选择: {ocrFile.name}
                </p>
                <p style={{ margin: '8px 0 0', color: '#8c8c8c', fontSize: 12 }}>
                  点击"识别"按钮开始AI分析
                </p>
              </div>
            )}
          </div>
        </Spin>
      </Modal>
    </div>
  );
};

export default StyleSizeToolbar;
