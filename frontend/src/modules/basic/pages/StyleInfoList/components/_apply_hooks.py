"""
One-shot script to integrate useSampleStage / useConfirmStage / useStagePanel
hooks into StyleTableView.tsx — deletes ~548 lines of extracted logic,
updates imports, removes state declarations, inserts hook calls,
and namespaces all JSX references.
"""
import re
import sys

filepath = sys.argv[1] if len(sys.argv) > 1 else 'StyleTableView.tsx'

with open(filepath, 'r') as f:
    content = f.read()

original_lines = content.count('\n') + 1

# ── Step 1: Update React import (remove useEffect) ──
content = content.replace(
    "import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';",
    "import React, { useCallback, useMemo, useRef, useState } from 'react';",
)

# ── Step 2: Add hook imports after StyleCopyModal ──
content = content.replace(
    "import StyleCopyModal from './StyleCopyModal';",
    "import StyleCopyModal from './StyleCopyModal';\n"
    "import useSampleStage from './useSampleStage';\n"
    "import useConfirmStage from './useConfirmStage';\n"
    "import useStagePanel from './useStagePanel';",
)

# ── Step 3: Remove 8 extracted state declarations ──
state_lines = [
    "  const [sampleSnapshot, setSampleSnapshot] = useState<PatternProductionSnapshot | null>(null);\n",
    "  const [sampleSnapshotLoading, setSampleSnapshotLoading] = useState(false);\n",
    "  const [sampleActionLoading, setSampleActionLoading] = useState(false);\n",
    "  const [progressEditorOpen, setProgressEditorOpen] = useState(false);\n",
    "  const [progressDraft, setProgressDraft] = useState<Record<string, number>>({});\n",
    "  const [reviewModalOpen, setReviewModalOpen] = useState(false);\n",
    "  const [reviewSaving, setReviewSaving] = useState(false);\n",
    "  const [reviewForm] = Form.useForm();\n",
]
for sl in state_lines:
    if sl in content:
        content = content.replace(sl, '', 1)
    else:
        print(f'WARNING: state line not found: {sl.strip()!r}')

# ── Step 4: Insert hook invocations after viewportRestoreRef ──
anchor = "  const viewportRestoreRef = useRef<{ x: number; y: number } | null>(null);\n"
if anchor in content:
    content = content.replace(
        anchor,
        anchor + "\n"
        "  const sample = useSampleStage({ selectedStage, message, onRefresh });\n"
        "  const confirm = useConfirmStage({ selectedStage, setSelectedStage, message, onRefresh });\n"
        "  const panel = useStagePanel({ selectedStage, setSelectedStage, navigate, message, sampleHook: sample, confirmHook: confirm });\n",
    )
else:
    print('WARNING: viewportRestoreRef anchor not found')

# ── Step 5: Delete the extracted block ──
# From "const selectedStageTag = ..." through "const selectedStageActions = ...;\n"
block_re = re.compile(
    r'\n  const selectedStageTag = selectedStage \? resolveStageTag\(selectedStage\.stage\) : null;'
    r'.*?'
    r'const selectedStageActions = selectedStage \? buildStageQuickActions\(selectedStage\) : \[\];\n',
    re.DOTALL,
)
match = block_re.search(content)
if match:
    print(f'Deleting extracted block: {match.start()}..{match.end()} ({content[match.start():match.end()].count(chr(10))} lines)')
    content = content[:match.start()] + '\n' + content[match.end():]
else:
    print('WARNING: extracted block pattern not found')

# ── Step 6: Namespace JSX references ──
# Only apply to JSX section (after "return (")
return_marker = '\n  return (\n'
idx = content.find(return_marker)
if idx < 0:
    print('WARNING: return marker not found')
else:
    before = content[:idx]
    jsx = content[idx:]

    # Order: longer/more-specific names first to avoid substring conflicts
    replacements = [
        # sample.*
        (r'\bsampleSnapshotLoading\b',        'sample.sampleSnapshotLoading'),
        (r'\bsampleStageSummary\b',           'sample.sampleStageSummary'),
        (r'\bsampleActionLoading\b',          'sample.sampleActionLoading'),
        (r'\bsampleStageProgressItems\b',     'sample.sampleStageProgressItems'),
        (r'\bshouldShowSampleStageProgress\b','sample.shouldShowSampleStageProgress'),
        (r'\bsampleCompletedTimeLabel\b',     'sample.sampleCompletedTimeLabel'),
        (r'\bsampleReceiveTimeLabel\b',       'sample.sampleReceiveTimeLabel'),
        (r'\bsampleReceiverLabel\b',          'sample.sampleReceiverLabel'),
        (r'\bsampleSnapshot\b',              'sample.sampleSnapshot'),
        (r'\bhandleSaveSampleProgress\b',     'sample.handleSaveSampleProgress'),
        (r'\bprogressEditorOpen\b',           'sample.progressEditorOpen'),
        (r'\bsetProgressEditorOpen\b',        'sample.setProgressEditorOpen'),
        (r'\bprogressDraft\b',               'sample.progressDraft'),
        (r'\bsetProgressDraft\b',            'sample.setProgressDraft'),
        # confirm.*
        (r'\bconfirmStageSummary\b',          'confirm.confirmStageSummary'),
        (r'\bconfirmReviewStatusLabel\b',     'confirm.confirmReviewStatusLabel'),
        (r'\bconfirmReviewerLabel\b',         'confirm.confirmReviewerLabel'),
        (r'\bconfirmReviewTimeLabel\b',       'confirm.confirmReviewTimeLabel'),
        (r'\bconfirmInboundTimeLabel\b',      'confirm.confirmInboundTimeLabel'),
        (r'\breviewModalOpen\b',             'confirm.reviewModalOpen'),
        (r'\bsetReviewModalOpen\b',          'confirm.setReviewModalOpen'),
        (r'\bhandleSaveReview\b',            'confirm.handleSaveReview'),
        (r'\breviewSaving\b',               'confirm.reviewSaving'),
        (r'\breviewForm\b',                 'confirm.reviewForm'),
        # panel.*
        (r'\bselectedStageInsightText\b',     'panel.selectedStageInsightText'),
        (r'\bselectedStageActions\b',         'panel.selectedStageActions'),
        (r'\bselectedStageTag\b',            'panel.selectedStageTag'),
    ]

    for pat, repl in replacements:
        jsx = re.sub(pat, repl, jsx)

    content = before + jsx

# ── Step 7: Collapse 3+ consecutive blank lines to 2 ──
content = re.sub(r'\n{4,}', '\n\n\n', content)

new_lines = content.count('\n') + 1
print(f'Lines: {original_lines} → {new_lines} (delta: {new_lines - original_lines})')

with open(filepath, 'w') as f:
    f.write(content)

print('✅ StyleTableView.tsx updated successfully')
