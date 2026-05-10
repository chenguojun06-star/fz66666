import React, { useMemo } from 'react';
import { buildWashLabelSections, parseWashNotePerPart } from '@/utils/washLabel';
import { getCareIconSvgs } from '@/utils/careIcons';

interface Props {
  styleNo?: string;
  styleName?: string;
  fabricCompositionParts?: string;
  fabricComposition?: string;
  washInstructions?: string;
  careIconCodes?: string[];
  width?: number;
  height?: number;
}

const SingleLabel: React.FC<{
  styleNo?: string;
  styleName?: string;
  partLabel?: string;
  compositionItems: string[];
  washNote?: string;
  iconSvgs: string[];
  width: number;
  height: number;
}> = ({ styleNo, styleName, partLabel, compositionItems, washNote, iconSvgs, width, height }) => {
  const scale = 2.8;
  const previewW = width * scale;
  const previewH = height * scale;
  const fs = width >= 45 ? 6.5 : 5.5;

  return (
    <div style={{
      width: previewW,
      minHeight: previewH,
      background: '#fff',
      border: '1px solid #ddd',
      padding: '0 6px',
      fontFamily: 'system-ui, -apple-system, "Microsoft YaHei", "PingFang SC", serif',
      color: '#000',
      fontSize: fs * scale * 0.55,
      lineHeight: 1.4,
      position: 'relative',
      boxShadow: '2px 2px 8px rgba(0,0,0,0.08)',
    }}>
      <div style={{ borderTop: '1px dashed #555', margin: '0 -8px' }} />

      <div style={{ textAlign: 'center', paddingTop: previewH * 0.12 }}>
        <div style={{ fontWeight: 'bold', fontSize: (fs + 0.2) * scale * 0.55, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          款号：{styleNo || '-'}
        </div>
        <div style={{ marginTop: 2, fontSize: (fs - 0.2) * scale * 0.55, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          款名：{styleName || '-'}
        </div>
      </div>

      <div style={{ marginTop: previewH * 0.06 }}>
        {partLabel && (
          <div style={{ fontWeight: 'bold', fontSize: fs * scale * 0.55, marginBottom: 2 }}>
            {partLabel}
          </div>
        )}
        {compositionItems.length > 0 ? compositionItems.map((item, idx) => (
          <div key={idx} style={{ fontWeight: 'bold', lineHeight: 1.5 }}>
            {item}
          </div>
        )) : (
          <div style={{ color: '#aaa' }}>（成分未填写）</div>
        )}
        {washNote?.trim() && (
          <div style={{ color: '#444', marginTop: 2, lineHeight: 1.5 }}>
            {washNote}
          </div>
        )}
      </div>

      <div style={{
        position: 'absolute',
        bottom: previewH * 0.06,
        left: 6,
        right: 6,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        {iconSvgs.length > 0 && (
          <div style={{
            display: 'flex',
            gap: 4,
            alignItems: 'center',
            justifyContent: 'center',
            flexWrap: 'nowrap',
            marginBottom: 4,
          }}>
            {iconSvgs.map((svg, idx) => (
              <span
                key={idx}
                dangerouslySetInnerHTML={{ __html: svg }}
                style={{
                  width: 16 * scale * 0.55,
                  height: 16 * scale * 0.55,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: '0 0 auto',
                }}
              />
            ))}
          </div>
        )}
        <div style={{ marginTop: 4, fontWeight: 'bold', letterSpacing: 1, fontSize: fs * scale * 0.5 }}>
          MADE IN CHINA
        </div>
        <div style={{ marginTop: 2, color: '#777', fontSize: (fs - 0.5) * scale * 0.5 }}>
          {new Date().toISOString().slice(0, 10).replace(/-/g, '')}
        </div>
      </div>

      <div style={{ borderTop: '1px dashed #555', margin: '0 -8px', position: 'absolute', bottom: 0, left: 0, right: 0 }} />
    </div>
  );
};

const WashLabelPreview: React.FC<Props> = ({
  styleNo,
  styleName,
  fabricCompositionParts,
  fabricComposition,
  washInstructions,
  careIconCodes = [],
  width = 30,
  height = 80,
}) => {
  const sections = useMemo(
    () => buildWashLabelSections(fabricCompositionParts, fabricComposition),
    [fabricCompositionParts, fabricComposition],
  );

  const perPartWashNotes = useMemo(
    () => parseWashNotePerPart(fabricCompositionParts),
    [fabricCompositionParts],
  );

  const iconSvgs = useMemo(() => getCareIconSvgs(careIconCodes), [careIconCodes]);

  const washText = useMemo(() => {
    const raw = washInstructions || '';
    return raw.replace(/^洗涤说明[（(]水洗标专用[）)]\s*/u, '').trim();
  }, [washInstructions]);

  const isMultiPart = sections.length > 1;

  return (
    <div style={{
      padding: 16,
      background: 'var(--color-bg-container, #fafafa)',
      borderRadius: 8,
      border: '1px solid var(--color-border-light, #f0f0f0)',
    }}>
      {isMultiPart ? (
        <div>
          {sections.map(section => (
            <div key={section.key} style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--color-primary, #1677ff)',
                marginBottom: 6,
              }}>
                {section.label}
              </div>
              <SingleLabel
                styleNo={styleNo}
                styleName={styleName}
                partLabel={section.key !== 'other' ? section.label : undefined}
                compositionItems={section.items}
                washNote={perPartWashNotes[section.key] || washText}
                iconSvgs={iconSvgs}
                width={width}
                height={height}
              />
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
        }}>
          <SingleLabel
            styleNo={styleNo}
            styleName={styleName}
            partLabel={undefined}
            compositionItems={sections.length > 0 ? sections[0].items : []}
            washNote={sections.length > 0 ? (perPartWashNotes[sections[0].key] || washText) : washText}
            iconSvgs={iconSvgs}
            width={width}
            height={height}
          />
          <div style={{
            marginLeft: 16,
            fontSize: 12,
            color: 'var(--color-text-tertiary, #8c8c8c)',
            lineHeight: 1.8,
            alignSelf: 'center',
          }}>
            <div>预览尺寸：{width}×{height}mm</div>
            <div>护理图标：{iconSvgs.length}个</div>
          </div>
        </div>
      )}

      {isMultiPart && (
        <div style={{
          marginTop: 8,
          fontSize: 12,
          color: 'var(--color-text-tertiary, #8c8c8c)',
          lineHeight: 1.8,
        }}>
          <div>预览尺寸：{width}×{height}mm × {sections.length}张</div>
          <div>护理图标：{iconSvgs.length}个/张</div>
          <div>部位：{sections.map(s => s.label).join(' / ')}</div>
          <div style={{ color: 'var(--color-primary, #1677ff)', marginTop: 4 }}>
            套装多件：每个部位将打印独立的洗水唛标签
          </div>
        </div>
      )}
    </div>
  );
};

export default WashLabelPreview;
