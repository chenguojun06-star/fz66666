import React, { useState, useEffect, useCallback } from 'react';
import { App, Button, Input, InputNumber, Space, Form } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { SaveOutlined, PrinterOutlined, EyeOutlined, EditOutlined, RollbackOutlined, LockOutlined } from '@ant-design/icons';
import api from '@/utils/api';
import CompositionPartsEditor from './CompositionPartsEditor';
import CareIconSelector from './CareIconSelector';
import WashLabelPreview from './WashLabelPreview';
import {
  parseCareIconCodes,
  serializeCareIconCodes,
  careCodesFromLegacyFields,
  DEFAULT_CARE_ICON_CODES,
} from '@/utils/careIcons';
import { getDisplayWashCareCodes, buildWashLabelSections, parseWashNotePerPart } from '@/utils/washLabel';
import { safePrint } from '@/utils/safePrint';
import {
  buildWashLabelPrintHtml,
  buildWashLabelMultiPageHtml,
  getDefaultDateText,
  compositionFromSections,
  washTextFromInstructions,
  type WashLabelPrintData,
} from '@/utils/washLabelPrintTemplate';

interface Props {
  styleId: string;
  styleNo?: string;
  styleName?: string;
  fabricCompositionParts?: string;
  fabricComposition?: string;
  washInstructions?: string;
  uCode?: string;
  washTempCode?: string;
  bleachCode?: string;
  tumbleDryCode?: string;
  ironCode?: string;
  dryCleanCode?: string;
  careIconCodes?: string;
  onRefresh?: () => void;
}

const StyleWashLabelTab: React.FC<Props> = ({
  styleId,
  styleNo,
  styleName,
  fabricCompositionParts: initialParts,
  fabricComposition: initialComp,
  washInstructions: initialWash,
  uCode: initialUCode,
  washTempCode,
  bleachCode,
  tumbleDryCode,
  ironCode,
  dryCleanCode,
  careIconCodes: initialCareIconCodes,
  onRefresh,
}) => {
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [rollbackForm] = Form.useForm();
  const [rollbackSubmitting, setRollbackSubmitting] = useState(false);

  const [compositionParts, setCompositionParts] = useState(initialParts);
  const [washInstructions, setWashInstructions] = useState(initialWash || '');
  const [uCode, setUCode] = useState(initialUCode || '');
  const [selectedIconCodes, setSelectedIconCodes] = useState<string[]>([]);
  const [manufacturingText, setManufacturingText] = useState('MADE IN CHINA');

  const [previewW, setPreviewW] = useState(30);
  const [previewH, setPreviewH] = useState(80);

  useEffect(() => {
    setCompositionParts(initialParts);
    setWashInstructions(initialWash || '');
    setUCode(initialUCode || '');

    const explicit = parseCareIconCodes(initialCareIconCodes);
    if (explicit.length > 0) {
      setSelectedIconCodes(explicit);
      return;
    }

    const legacyCodes = getDisplayWashCareCodes(
      { washTempCode, bleachCode, tumbleDryCode, ironCode, dryCleanCode },
      initialWash,
    );
    const fromLegacy = careCodesFromLegacyFields(legacyCodes);
    if (fromLegacy.length > 0) {
      setSelectedIconCodes(fromLegacy);
      return;
    }

    setSelectedIconCodes([...DEFAULT_CARE_ICON_CODES]);
  }, [initialParts, initialWash, initialUCode, initialCareIconCodes, washTempCode, bleachCode, tumbleDryCode, ironCode, dryCleanCode]);

  const handleSave = useCallback(async () => {
    if (!styleId) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        id: styleId,
        styleNo,
        styleName,
        fabricCompositionParts: compositionParts || undefined,
        washInstructions: washInstructions || undefined,
        uCode: uCode || undefined,
        careIconCodes: serializeCareIconCodes(selectedIconCodes),
      };
      const res = await api.put('/style/info', payload);
      if (res.code === 200) {
        message.success('洗水唛配置保存成功');
        setIsEditing(false);
        onRefresh?.();
      } else {
        message.error(res.message || '保存失败');
      }
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  }, [styleId, styleNo, styleName, compositionParts, washInstructions, uCode, selectedIconCodes, onRefresh, message]);

  const handleStartEdit = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleRollback = useCallback(() => {
    setRollbackOpen(true);
  }, []);

  const handleRollbackOk = useCallback(async () => {
    const values = await rollbackForm.validateFields();
    const remark = (values.remark || '').trim();
    if (!remark) {
      rollbackForm.setFields([{ name: 'remark', errors: ['请填写退回原因'] }]);
      return;
    }
    setRollbackSubmitting(true);
    try {
      await api.put(`/style/info/rollback-remark/${styleId}`, { remark });
    } catch {
      message.warning('退回备注保存失败，但编辑已退回');
    } finally {
      setRollbackSubmitting(false);
    }
    setIsEditing(false);
    setCompositionParts(initialParts);
    setWashInstructions(initialWash || '');
    setUCode(initialUCode || '');
    setRollbackOpen(false);
    rollbackForm.resetFields();
    onRefresh?.();
  }, [styleId, initialParts, initialWash, initialUCode, rollbackForm, onRefresh, message]);

  const handlePrint = useCallback(async () => {
    setPrintLoading(true);
    try {
    const sections = buildWashLabelSections(compositionParts, initialComp);
    const isMultiPart = sections.length > 1;
    const perPartWashNotes = parseWashNotePerPart(compositionParts);

    const buildOnePrintData = (section: { key: string; label: string; items: string[] }, washNote: string): WashLabelPrintData => ({
      width: previewW,
      height: previewH,
      compositionText: section.items.join('\n'),
      washInstructionsText: washNote,
      careIconCodes: selectedIconCodes,
      manufacturingText: manufacturingText,
      dateText: getDefaultDateText(),
    });

    const washText = washTextFromInstructions(washInstructions, compositionParts);

    let html: string;
    if (isMultiPart) {
      const items = sections.map(section =>
        buildOnePrintData(section, perPartWashNotes[section.key] || washText)
      );
      html = buildWashLabelMultiPageHtml(items);
    } else {
      const singleSection = sections.length > 0 ? sections[0] : { key: 'other', label: '', items: [] };
      const singleWashNote = perPartWashNotes[singleSection.key] || washText;
      html = buildWashLabelPrintHtml(buildOnePrintData(singleSection, singleWashNote));
    }

    safePrint(html);
    } finally { setPrintLoading(false); }
  }, [compositionParts, initialComp, washInstructions, selectedIconCodes, manufacturingText, previewW, previewH]);

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--color-text-primary, #333)',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottom: '2px solid var(--color-primary, var(--color-primary))',
    display: 'inline-block',
  };

  return (
    <div style={{ display: 'flex', gap: 24 }}>
      <div style={{ flex: '1 1 55%', minWidth: 0 }}>
        {/* 编辑控制栏 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          padding: '10px 14px',
          background: isEditing ? 'var(--color-primary-bg, #e6f4ff)' : 'var(--color-bg-container, var(--color-bg-container))',
          borderRadius: 8,
          border: isEditing ? '1px solid var(--color-primary, var(--color-primary))' : '1px solid var(--color-border-light, var(--color-border-light))',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isEditing ? (
              <EditOutlined style={{ color: 'var(--color-primary, var(--color-primary))' }} />
            ) : (
              <LockOutlined style={{ color: 'var(--color-text-quaternary, var(--color-text-quaternary))' }} />
            )}
            <span style={{
              fontSize: 14,
              fontWeight: 600,
              color: isEditing ? 'var(--color-primary, var(--color-primary))' : 'var(--color-text-tertiary, #8c8c8c)',
            }}>
              {isEditing ? '编辑中' : '已锁定'}
            </span>
          </div>
          <Space>
            {!isEditing && (
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={handleStartEdit}
               
              >
                开始编辑
              </Button>
            )}
            {isEditing && (
              <>
                <Button
                  icon={<RollbackOutlined />}
                  onClick={handleRollback}
                 
                  danger
                >
                  退回
                </Button>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={() => void handleSave()}
                  loading={saving}
                 
                >
                  保存并锁定
                </Button>
              </>
            )}
            <Button
              icon={<PrinterOutlined />}
              onClick={() => void handlePrint()}
              loading={printLoading}
            >
              打印
            </Button>
          </Space>
        </div>

        <div style={{ marginBottom: 20, opacity: isEditing ? 1 : 0.6, pointerEvents: isEditing ? 'auto' : 'none' }}>
          <div style={sectionTitleStyle}>面料成分 / 洗涤说明</div>
          <div style={{ fontSize: 14, color: 'var(--color-text-tertiary, #8c8c8c)', marginBottom: 8 }}>
            每个部位可分别填写成分和洗涤说明，打印洗水唛时会自动按部位分段输出
          </div>
          <CompositionPartsEditor
            value={compositionParts}
            onChange={v => setCompositionParts(v)}
            disabled={!isEditing}
          />
        </div>

        <div style={{ marginBottom: 20, opacity: isEditing ? 1 : 0.6, pointerEvents: isEditing ? 'auto' : 'none' }}>
          <div style={sectionTitleStyle}>全局洗涤说明</div>
          <Input.TextArea
            rows={3}
            value={washInstructions}
            onChange={e => setWashInstructions(e.target.value)}
            placeholder="如：30°C水洗，不可漂白，低温熨烫，悬挂晾干"
            style={{ resize: 'none' }}
            disabled={!isEditing}
          />
          <div style={{ fontSize: 14, color: 'var(--color-text-quaternary, var(--color-text-quaternary))', marginTop: 4 }}>
            全局洗涤说明会显示在所有部位成分下方；如果某部位已单独填写洗涤说明，则优先使用部位说明
          </div>
        </div>

        <div style={{ marginBottom: 20, opacity: isEditing ? 1 : 0.6, pointerEvents: isEditing ? 'auto' : 'none' }}>
          <div style={sectionTitleStyle}>U编码（品质追溯码）</div>
          <Input
            value={uCode}
            onChange={e => setUCode(e.target.value)}
            placeholder="用于吊牌/洗水唛的品质追溯唯一编码"
            maxLength={64}
            disabled={!isEditing}
          />
          <div style={{ fontSize: 14, color: 'var(--color-text-quaternary, var(--color-text-quaternary))', marginTop: 4 }}>
            U编码是品质追溯的唯一标识，打印U码标签时会自动使用此编码
          </div>
        </div>

        <div style={{ marginBottom: 20, opacity: isEditing ? 1 : 0.6, pointerEvents: isEditing ? 'auto' : 'none' }}>
          <div style={sectionTitleStyle}>洗涤护理图标</div>
          <div style={{ fontSize: 14, color: 'var(--color-text-tertiary, #8c8c8c)', marginBottom: 12 }}>
            点击图标选择/取消，每个类别可选择多个图标；选中的图标将显示在洗水唛底部
          </div>
          <CareIconSelector
            value={selectedIconCodes}
            onChange={setSelectedIconCodes}
            disabled={!isEditing}
          />
        </div>

        <div style={{ marginBottom: 20, opacity: isEditing ? 1 : 0.6, pointerEvents: isEditing ? 'auto' : 'none' }}>
          <div style={sectionTitleStyle}>生产制造</div>
          <Input
            value={manufacturingText}
            onChange={e => setManufacturingText(e.target.value)}
            placeholder="MADE IN CHINA"
            disabled={!isEditing}
          />
          <div style={{ fontSize: 14, color: 'var(--color-text-quaternary, var(--color-text-quaternary))', marginTop: 4 }}>
            产地信息，默认 MADE IN CHINA，可按需修改；日期自动生成（{getDefaultDateText()}）
          </div>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          padding: '12px 0',
          borderTop: '1px solid var(--color-border-light, var(--color-border-light))',
        }}>
          <Space>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>预览纸张宽</span>
            <InputNumber
              min={20} max={200} value={previewW}
              onChange={v => setPreviewW(v ?? 30)}
              suffix="mm" style={{ width: 110 }}
            />
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>高</span>
            <InputNumber
              min={30} max={400} value={previewH}
              onChange={v => setPreviewH(v ?? 80)}
              suffix="mm" style={{ width: 110 }}
            />
          </Space>
        </div>
      </div>

      <div style={{ flex: '0 0 38%', position: 'sticky', top: 0 }}>
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--color-text-primary, #333)',
          marginBottom: 8,
          paddingBottom: 6,
          borderBottom: '2px solid #13C2C2',
          display: 'inline-block',
        }}>
          <EyeOutlined style={{ marginRight: 6 }} />
          洗水唛预览
        </div>
        <div style={{ fontSize: 14, color: 'var(--color-text-quaternary, var(--color-text-quaternary))', marginBottom: 8 }}>
          实时预览打印效果，修改左侧内容后自动更新
        </div>
        <WashLabelPreview
          styleNo={styleNo}
          styleName={styleName}
          fabricCompositionParts={compositionParts}
          fabricComposition={initialComp}
          washInstructions={washInstructions}
          careIconCodes={selectedIconCodes}
          manufacturingText={manufacturingText}
          width={previewW}
          height={previewH}
        />
      </div>

      {/* 退回编辑确认弹窗 */}
      <ResizableModal
        title="退回编辑"
        open={rollbackOpen}
        onOk={() => void handleRollbackOk()}
        onCancel={() => { setRollbackOpen(false); rollbackForm.resetFields(); }}
        okText="确认退回"
        cancelText="取消"
        confirmLoading={rollbackSubmitting}
      >
        <div style={{ marginBottom: 12, color: 'var(--color-text-secondary, #666)' }}>
          退回编辑将放弃所有未保存的修改，请填写退回原因：
        </div>
        <Form form={rollbackForm} layout="vertical">
          <Form.Item name="remark" rules={[{ required: true, message: '请填写退回原因' }]}>
            <Input.TextArea rows={3} placeholder="请输入退回原因" maxLength={200} showCount />
          </Form.Item>
        </Form>
      </ResizableModal>
    </div>
  );
};

export default StyleWashLabelTab;
