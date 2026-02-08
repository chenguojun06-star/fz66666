#!/bin/bash
cd /Volumes/macoo2/Users/guojunmini4/Documents/服装66666/miniprogram

FILES=$(find . -name "*.wxss" ! -name "design-tokens.wxss")

for f in $FILES; do
  sed -i '' -e 's/color: #333333/color: var(--color-text-primary)/g' "$f"
  sed -i '' -e 's/color: #333;/color: var(--color-text-primary);/g' "$f"
  sed -i '' -e 's/color: #1a1a1a/color: var(--color-text-primary)/g' "$f"
  sed -i '' -e 's/color: #111827/color: var(--color-text-primary)/g' "$f"
  sed -i '' -e 's/color: #1f2937/color: var(--color-text-primary)/g' "$f"
  sed -i '' -e 's/color: #666666/color: var(--color-text-secondary)/g' "$f"
  sed -i '' -e 's/color: #666;/color: var(--color-text-secondary);/g' "$f"
  sed -i '' -e 's/color: #6b7280/color: var(--color-text-secondary)/g' "$f"
  sed -i '' -e 's/color: #374151/color: var(--color-text-secondary)/g' "$f"
  sed -i '' -e 's/color: #475569/color: var(--color-text-secondary)/g' "$f"
  sed -i '' -e 's/color: #4b5563/color: var(--color-text-secondary)/g' "$f"
  sed -i '' -e 's/color: #999999/color: var(--color-text-disabled)/g' "$f"
  sed -i '' -e 's/color: #999;/color: var(--color-text-disabled);/g' "$f"
  sed -i '' -e 's/color: #9ca3af/color: var(--color-text-disabled)/g' "$f"
  sed -i '' -e 's/color: #8b8b94/color: var(--color-text-disabled)/g' "$f"
  sed -i '' -e 's/background-color: #f5f5f5/background-color: var(--color-bg-gray)/g' "$f"
  sed -i '' -e 's/background-color: #f0f0f0/background-color: var(--color-bg-gray)/g' "$f"
  sed -i '' -e 's/background-color: #f3f4f6/background-color: var(--color-bg-gray)/g' "$f"
  sed -i '' -e 's/background: #f5f5f5/background: var(--color-bg-gray)/g' "$f"
  sed -i '' -e 's/background: #f0f0f0/background: var(--color-bg-gray)/g' "$f"
  sed -i '' -e 's/background: #f3f4f6/background: var(--color-bg-gray)/g' "$f"
  sed -i '' -e 's/background-color: #f7f8fa/background-color: var(--color-bg-page)/g' "$f"
  sed -i '' -e 's/background: #f7f8fa/background: var(--color-bg-page)/g' "$f"
  sed -i '' -e 's/background-color: #f9fafb/background-color: var(--color-bg-light)/g' "$f"
  sed -i '' -e 's/background: #f9fafb/background: var(--color-bg-light)/g' "$f"
  sed -i '' -e 's/background-color: #ffffff/background-color: var(--color-bg-card)/g' "$f"
  sed -i '' -e 's/background: #ffffff/background: var(--color-bg-card)/g' "$f"
  sed -i '' -e 's/background-color: #fff;/background-color: var(--color-bg-card);/g' "$f"
  sed -i '' -e 's/background: #fff;/background: var(--color-bg-card);/g' "$f"
  sed -i '' -e 's/border-color: #e5e7eb/border-color: var(--color-border-light)/g' "$f"
  sed -i '' -e 's/border-color: #eee/border-color: var(--color-border-light)/g' "$f"
done

echo "ALL REPLACEMENTS DONE"
