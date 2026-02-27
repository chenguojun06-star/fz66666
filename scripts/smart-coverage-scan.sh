#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend/src/modules"
REPORT_DIR="$ROOT_DIR/reports"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
REPORT_FILE="$REPORT_DIR/smart-error-notice-coverage_${TIMESTAMP}.md"
LATEST_FILE="$REPORT_DIR/smart-error-notice-coverage_latest.md"

mkdir -p "$REPORT_DIR"

if [[ ! -d "$FRONTEND_DIR" ]]; then
  echo "未找到前端模块目录: $FRONTEND_DIR"
  exit 1
fi

PAGE_FILES=()
while IFS= read -r file; do
  PAGE_FILES+=("$file")
done < <(find "$FRONTEND_DIR" -type f \( -path "*/pages/*.tsx" -o -path "*/pages/**/*.tsx" \) | sort -u)

if [[ ${#PAGE_FILES[@]} -eq 0 ]]; then
  echo "未找到任何 pages 下的 tsx 文件"
  exit 0
fi

covered=()
uncovered=()
candidate_pages=()

for file in "${PAGE_FILES[@]}"; do
  rel="${file#$ROOT_DIR/}"

  has_notice="false"
  has_loader_pattern="false"

  if grep -q "SmartErrorNotice" "$file"; then
    has_notice="true"
  fi

  if grep -E -q "(load|fetch).*(Data|List)|message\.error|catch \(" "$file"; then
    has_loader_pattern="true"
  fi

  if [[ "$has_loader_pattern" == "true" ]]; then
    candidate_pages+=("$rel")
    if [[ "$has_notice" == "true" ]]; then
      covered+=("$rel")
    else
      uncovered+=("$rel")
    fi
  fi
done

{
  echo "# SmartErrorNotice 覆盖扫描报告"
  echo
  echo "- 扫描时间: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "- 扫描范围: frontend/src/modules/**/pages/**/*.tsx"
  echo "- 候选页面总数: ${#candidate_pages[@]}"
  echo "- 已覆盖: ${#covered[@]}"
  echo "- 未覆盖: ${#uncovered[@]}"
  echo

  echo "## 已覆盖页面"
  if [[ ${#covered[@]} -eq 0 ]]; then
    echo "- 无"
  else
    for f in "${covered[@]}"; do
      echo "- $f"
    done
  fi
  echo

  echo "## 未覆盖页面"
  if [[ ${#uncovered[@]} -eq 0 ]]; then
    echo "- 无"
  else
    for f in "${uncovered[@]}"; do
      echo "- $f"
    done
  fi
  echo

  echo "## 说明"
  echo "- 候选页面判定: 文件内包含 load/fetch/message.error/catch 等加载或报错模式。"
  echo "- 覆盖判定: 文件内存在 SmartErrorNotice 关键字。"
  echo "- 本报告用于快速盘点，最终以代码评审为准。"
} > "$REPORT_FILE"

cp "$REPORT_FILE" "$LATEST_FILE"

echo "生成完成: $REPORT_FILE"
echo "最新报告: $LATEST_FILE"
