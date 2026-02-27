#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MODE="changed"
RUN_BACKEND_TESTS="false"

for arg in "$@"; do
  case "$arg" in
    --all)
      MODE="all"
      ;;
    --with-backend-tests)
      RUN_BACKEND_TESTS="true"
      ;;
    *)
      echo "未知参数: $arg"
      echo "用法: ./scripts/qa-after-change.sh [--all] [--with-backend-tests]"
      exit 2
      ;;
  esac
done

print_header() {
  echo
  echo "============================================================"
  echo "$1"
  echo "============================================================"
}

has_prefix_in_array() {
  local prefix="$1"
  shift
  for item in "$@"; do
    if [[ "$item" == "$prefix"* ]]; then
      return 0
    fi
  done
  return 1
}

collect_changed_files() {
  cd "$ROOT_DIR"
  local files=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && files+=("$line")
  done < <(git diff --name-only && git diff --name-only --cached)

  if [[ ${#files[@]} -eq 0 ]]; then
    echo ""
    return
  fi

  printf "%s\n" "${files[@]}" | sort -u
}

run_frontend_checks() {
  print_header "前端质检（frontend）"
  cd "$ROOT_DIR/frontend"
  npm run -s lint
  npm run -s type-check
  echo "✅ 前端通过：lint + type-check"
}

run_miniprogram_checks() {
  print_header "小程序质检（miniprogram）"
  cd "$ROOT_DIR/miniprogram"
  npm run -s 检查
  npm run -s 类型检查
  echo "✅ 小程序通过：eslint + 类型检查"
}

run_backend_checks() {
  print_header "后端质检（backend）"
  cd "$ROOT_DIR/backend"

  export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
  export PATH="$JAVA_HOME/bin:$PATH"

  mvn -q -DskipTests compile
  echo "✅ 后端通过：compile"

  if [[ "$RUN_BACKEND_TESTS" == "true" ]]; then
    mvn -q test
    echo "✅ 后端通过：test"
  fi
}

main() {
  print_header "统一质检开始"
  echo "根目录: $ROOT_DIR"
  echo "模式: $MODE"
  echo "后端测试: $RUN_BACKEND_TESTS"

  local run_frontend="false"
  local run_miniprogram="false"
  local run_backend="false"

  if [[ "$MODE" == "all" ]]; then
    run_frontend="true"
    run_miniprogram="true"
    run_backend="true"
  else
    changed_files=()
    while IFS= read -r line; do
      [[ -n "$line" ]] && changed_files+=("$line")
    done < <(collect_changed_files)

    if [[ ${#changed_files[@]} -eq 0 ]]; then
      echo "没有检测到未提交改动，默认执行轻量全量质检（前端 + 小程序 + 后端编译）。"
      run_frontend="true"
      run_miniprogram="true"
      run_backend="true"
    else
      echo "检测到改动文件: ${#changed_files[@]}"
      has_prefix_in_array "frontend/" "${changed_files[@]}" && run_frontend="true"
      has_prefix_in_array "miniprogram/" "${changed_files[@]}" && run_miniprogram="true"
      has_prefix_in_array "backend/" "${changed_files[@]}" && run_backend="true"
      has_prefix_in_array "scripts/" "${changed_files[@]}" && {
        run_frontend="true"
        run_miniprogram="true"
      }
    fi
  fi

  [[ "$run_frontend" == "true" ]] && run_frontend_checks || echo "⏭️ 跳过前端（无相关改动）"
  [[ "$run_miniprogram" == "true" ]] && run_miniprogram_checks || echo "⏭️ 跳过小程序（无相关改动）"
  [[ "$run_backend" == "true" ]] && run_backend_checks || echo "⏭️ 跳过后端（无相关改动）"

  print_header "统一质检完成"
  echo "✅ 全部通过"
}

main "$@"
