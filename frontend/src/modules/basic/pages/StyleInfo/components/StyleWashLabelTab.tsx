import React, { useState, useEffect, useCallback } from 'react';
import { App, Button, Input, InputNumber, Modal, Space, Form } from 'antd';
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
  getCareIconSvgs,
} from '@/utils/careIcons';
import { getDisplayWashCareCodes, buildWashLabelSections, parseWashNotePerPart } from '@/utils/washLabel';
import { safePrint } from '@/utils/safePrint';

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
  const [isEditing, setIsEditing] = useState(false);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [rollbackForm] = Form.useForm();

  const [compositionParts, setCompositionParts] = useState(initialParts);
  const [washInstructions, setWashInstructions] = useState(initialWash || '');
  const [uCode, setUCode] = useState(initialUCode || '');
  const [selectedIconCodes, setSelectedIconCodes] = useState<string[]>([]);

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
    try {
      await api.put(`/style/info/rollback-remark/${styleId}`, { remark });
    } catch {
      message.warning('退回备注保存失败，但编辑已退回');
    }
    setIsEditing(false);
    setCompositionParts(initialParts);
    setWashInstructions(initialWash || '');
    setUCode(initialUCode || '');
    setRollbackOpen(false);
    rollbackForm.resetFields();
    onRefresh?.();
  }, [styleId, initialParts, initialWash, initialUCode, rollbackForm, onRefresh, message]);

  const handlePrint = useCallback(() => {
    const sections = buildWashLabelSections(compositionParts, initialComp);
    const iconSvgs = getCareIconSvgs(selectedIconCodes);
    const showPartTitle = sections.length > 1;
    const isMultiPart = sections.length > 1;

    const fs = previewW >= 45 ? 6.5 : 5.5;
    const w = previewW;
    const h = previewH;

    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

    const buildOneLabelHtml = (section: { key: string; label: string; items: string[] }, washNote: string) => {
      const compositionHtml = `<div class="comp-block">${showPartTitle && section.key !== 'other' ? `<span class="comp-name">${section.label}</span>` : ''}` +
        `<div class="comp-mats">${section.items.join('<br/>')}</div></div>`;

      const washText = (washNote || '').replace(/^洗涤说明[（(]水洗标专用[）)]\s*/u, '').trim();
      const washInstHtml = washText ? `<div class="care-wash">${washText.replace(/\n/g, '<br/>')}</div>` : '';

      const careIconsHtml = iconSvgs.length > 0
        ? `<div class="icons">${iconSvgs.map(svg => `<span class="icon-cell">${svg}</span>`).join('')}</div>`
        : '';

      return `<div class="label">
        <div class="dash-sep"></div>
        <div class="top-block">
          <div class="style-no">款号：${styleNo || '-'}</div>
          <div class="style-name">款名：${styleName || '-'}</div>
        </div>
        <div class="content-block">
          ${compositionHtml}
          ${washInstHtml ? `<div class="wash-title">洗涤说明</div>${washInstHtml}` : ''}
        </div>
        <div class="bottom-block">
          ${careIconsHtml}
          <div class="footer">MADE IN CHINA</div>
          <div class="date">${dateStr}</div>
        </div>
        <div class="dash-sep"></div>
      </div>`;
    };

    const perPartWashNotes = parseWashNotePerPart(compositionParts);
    const washText = (washInstructions || '').replace(/^洗涤说明[（(]水洗标专用[）)]\s*/u, '').trim();

    let labelsHtml: string;
    if (isMultiPart) {
      labelsHtml = sections.map(section =>
        buildOneLabelHtml(section, perPartWashNotes[section.key] || washText)
      ).join('');
    } else {
      const singleSection = sections.length > 0 ? sections[0] : { key: 'other', label: '', items: [] };
      const singleWashNote = perPartWashNotes[singleSection.key] || washText;
      labelsHtml = buildOneLabelHtml(singleSection, singleWashNote);
    }

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
@page { size: ${w}mm ${h}mm; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "'Segoe UI'", Roboto, "'Helvetica Neue'", Arial, "'Noto Sans'", "'Microsoft YaHei'", "'PingFang SC'", serif; color: #000; background: #fff; -webkit-font-smoothing: antialiased; }
.page { width: ${w}mm; min-height: ${h}mm; page-break-after: always; }
.page:last-child { page-break-after: auto; }
.label { position: relative; width: ${w}mm; height: ${h}mm; padding: 0 2.2mm; color: #000; }
.dash-sep { border: none; border-top: 0.8pt dashed #555; width: calc(100% + 6mm); margin-left: -3mm; }
.top-block { position: absolute; left: 2.2mm; right: 2.2mm; top: 15mm; text-align: center; }
.style-no { font-size: ${w <= 30 ? fs - 0.1 : fs + 0.2}pt; font-weight: bold; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.style-name { font-size: ${w <= 30 ? fs - 0.6 : fs - 0.2}pt; line-height: 1.35; margin-top: 0.8mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.content-block { position: absolute; left: 2.2mm; right: 2.2mm; top: 24mm; bottom: 24mm; overflow: hidden; }
.comp-block { margin: 0.3mm 0 1.1mm; }
.comp-name { font-size: ${w <= 30 ? fs + 0.2 : fs}pt; font-weight: bold; display: block; margin-bottom: 0.6mm; }
.comp-mats { font-size: ${w <= 30 ? fs + 1.7 : fs}pt; line-height: 1.55; white-space: pre-wrap; display: block; font-weight: bold; }
.wash-title { font-size: ${w <= 30 ? fs - 0.1 : fs}pt; color: #444; line-height: 1.5; margin-bottom: 0.6mm; }
.care-wash { font-size: ${fs}pt; color: #444; line-height: 1.6; margin-top: 1.6mm; }
.bottom-block { position: absolute; left: 2.2mm; right: 2.2mm; bottom: 6.5mm; display: flex; flex-direction: column; align-items: center; }
.icons { display: flex; gap: 0.45mm; align-items: center; justify-content: center; flex-wrap: nowrap; width: 100%; margin: 1.8mm auto 0; min-height: 6mm; }
.icon-cell { width: 4.8mm; height: 4.8mm; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; }
.icons svg { width: 100%; height: 100%; }
.footer { margin-top: 2.1mm; font-size: ${w <= 30 ? fs - 0.2 : fs}pt; font-weight: bold; letter-spacing: 0.6mm; line-height: 1.3; text-align: center; white-space: nowrap; }
.date { margin-top: 2.2mm; font-size: ${fs - 0.5}pt; color: #777; text-align: center; }
</style></head><body>${isMultiPart
      ? sections.map(() => `<div class="page">${labelsHtml}</div>`).join('')
      : `<div class="page">${labelsHtml}</div>`
    }</body></html>`;

    safePrint(html);
  }, [compositionParts, initialComp, washInstructions, selectedIconCodes, styleNo, styleName, previewW, previewH]);

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--color-text-primary, #333)',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottom: '2px solid var(--color-primary, #1677ff)',
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
          background: isEditing ? 'var(--color-primary-bg, #e6f4ff)' : 'var(--color-bg-container, #fafafa)',
          borderRadius: 8,
          border: isEditing ? '1px solid var(--color-primary, #1677ff)' : '1px solid var(--color-border-light, #f0f0f0)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isEditing ? (
              <EditOutlined style={{ color: 'var(--color-primary, #1677ff)' }} />
            ) : (
              <LockOutlined style={{ color: 'var(--color-text-quaternary, #bfbfbf)' }} />
            )}
            <span style={{
              fontSize: 13,
              fontWeight: 600,
              color: isEditing ? 'var(--color-primary, #1677ff)' : 'var(--color-text-tertiary, #8c8c8c)',
            }}>
              {isEditing ? '编辑中' : '已锁定'}
            </span>
          </div>
          <Space size="small">
            {!isEditing && (
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={handleStartEdit}
                size="small"
              >
                开始编辑
              </Button>
            )}
            {isEditing && (
              <>
                <Button
                  icon={<RollbackOutlined />}
                  onClick={handleRollback}
                  size="small"
                  danger
                >
                  退回
                </Button>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={() => void handleSave()}
                  loading={saving}
                  size="small"
                >
                  保存并锁定
                </Button>
              </>
            )}
            <Button
              icon={<PrinterOutlined />}
              onClick={handlePrint}
              size="small"
            >
              打印
            </Button>
          </Space>
        </div>

        <div style={{ marginBottom: 20, opacity: isEditing ? 1 : 0.6, pointerEvents: isEditing ? 'auto' : 'none' }}>
          <div style={sectionTitleStyle}>面料成分 / 洗涤说明</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary, #8c8c8c)', marginBottom: 8 }}>
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
          <div style={{ fontSize: 12, color: 'var(--color-text-quaternary, #bfbfbf)', marginTop: 4 }}>
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
          <div style={{ fontSize: 12, color: 'var(--color-text-quaternary, #bfbfbf)', marginTop: 4 }}>
            U编码是品质追溯的唯一标识，打印U码标签时会自动使用此编码
          </div>
        </div>

        <div style={{ marginBottom: 20, opacity: isEditing ? 1 : 0.6, pointerEvents: isEditing ? 'auto' : 'none' }}>
          <div style={sectionTitleStyle}>洗涤护理图标</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary, #8c8c8c)', marginBottom: 12 }}>
            点击图标选择/取消，每个类别可选择多个图标；选中的图标将显示在洗水唛底部
          </div>
          <CareIconSelector
            value={selectedIconCodes}
            onChange={setSelectedIconCodes}
            disabled={!isEditing}
          />
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          padding: '12px 0',
          borderTop: '1px solid var(--color-border-light, #f0f0f0)',
        }}>
          <Space>
            <span style={{ color: '#555', fontSize: 13 }}>预览纸张宽</span>
            <InputNumber
              min={20} max={200} value={previewW}
              onChange={v => setPreviewW(v ?? 30)}
              suffix="mm" style={{ width: 110 }} size="small"
            />
            <span style={{ color: '#555', fontSize: 13 }}>高</span>
            <InputNumber
              min={30} max={400} value={previewH}
              onChange={v => setPreviewH(v ?? 80)}
              suffix="mm" style={{ width: 110 }} size="small"
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
        <div style={{ fontSize: 12, color: 'var(--color-text-quaternary, #bfbfbf)', marginBottom: 8 }}>
          实时预览打印效果，修改左侧内容后自动更新
        </div>
        <WashLabelPreview
          styleNo={styleNo}
          styleName={styleName}
          fabricCompositionParts={compositionParts}
          fabricComposition={initialComp}
          washInstructions={washInstructions}
          careIconCodes={selectedIconCodes}
          width={previewW}
          height={previewH}
        />
      </div>

      {/* 退回编辑确认弹窗 */}
      <Modal
        title="退回编辑"
        open={rollbackOpen}
        onOk={() => void handleRollbackOk()}
        onCancel={() => { setRollbackOpen(false); rollbackForm.resetFields(); }}
        okText="确认退回"
        cancelText="取消"
      >
        <div style={{ marginBottom: 12, color: 'var(--color-text-secondary, #666)' }}>
          退回编辑将放弃所有未保存的修改，请填写退回原因：
        </div>
        <Form form={rollbackForm} layout="vertical">
          <Form.Item name="remark" rules={[{ required: true, message: '请填写退回原因' }]}>
            <Input.TextArea rows={3} placeholder="请输入退回原因" maxLength={200} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default StyleWashLabelTab;
