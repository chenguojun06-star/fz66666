#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

SCHEMA_CONFIRMED=0
FORCE_BACKEND=0
FORCE_FRONTEND=0

for arg in "$@"; do
	case "$arg" in
		--schema-confirmed)
			SCHEMA_CONFIRMED=1
			;;
		--backend)
			FORCE_BACKEND=1
			;;
		--frontend)
			FORCE_FRONTEND=1
			;;
		*)
			echo "未知参数: $arg"
			echo "用法: ./scripts/pre-push-checklist.sh [--schema-confirmed] [--backend] [--frontend]"
			exit 1
			;;
	esac
done

echo "========================================"
echo "推送前强制检查"
echo "ROOT=$ROOT_DIR"
echo "TIME=$(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"

CHANGED_FILES=$(git status --porcelain | awk '{print $2}')

if [ -z "$CHANGED_FILES" ]; then
	echo "未检测到工作区改动。"
	exit 0
fi

echo
echo "[1/4] git status"
git status --short

echo
echo "[2/4] git diff --stat HEAD"
git diff --stat HEAD || true

DB_SENSITIVE_PATTERN='(^backend/src/main/java/.*/entity/.*\.java$|^backend/src/main/resources/db/migration/.*\.sql$|^backend/src/main/java/.*/mapper/.*$|^backend/src/main/resources/mapper/.*$|^backend/src/main/java/com/fashion/supplychain/config/DbColumnRepairRunner\.java$|^backend/src/main/java/com/fashion/supplychain/config/CoreSchemaPreflightChecker\.java$|^deployment/.*\.sql$|^sql/.*\.sql$)'
BACKEND_PATTERN='(^backend/.*\.java$|^backend/pom\.xml$|^backend/src/main/resources/.*\.(yml|yaml|xml|properties)$)'
FRONTEND_PATTERN='(^frontend/.*\.(ts|tsx|js|jsx|css|less|scss|json)$)'

DB_SENSITIVE_FILES=$(printf '%s\n' "$CHANGED_FILES" | grep -E "$DB_SENSITIVE_PATTERN" || true)
BACKEND_CHANGED=$(printf '%s\n' "$CHANGED_FILES" | grep -E "$BACKEND_PATTERN" || true)
FRONTEND_CHANGED=$(printf '%s\n' "$CHANGED_FILES" | grep -E "$FRONTEND_PATTERN" || true)

if [ -n "$DB_SENSITIVE_FILES" ]; then
	echo
	echo "[3/4] 数据库敏感改动检测"
	printf '%s\n' "$DB_SENSITIVE_FILES"
	echo
	echo "检测到 Entity/Flyway/SQL/DbRepair/Preflight 相关改动。"
	echo "按 P0 规则，push 前必须先确认数据库/schema。"
	echo "云端请执行: deployment/cloud-db-core-schema-preflight-20260318.sql"
	if [ "$SCHEMA_CONFIRMED" -ne 1 ]; then
		echo
		echo "阻断推送：请先完成 schema 核对，再重新执行："
		echo "  ./scripts/pre-push-checklist.sh --schema-confirmed"
		exit 1
	fi
	echo "已显式确认 schema 已核对。"
fi

if [ -n "$BACKEND_CHANGED" ] || [ "$FORCE_BACKEND" -eq 1 ]; then
	echo
	echo "[4/4] 后端编译检查"
	cd "$ROOT_DIR/backend"
	JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home /opt/homebrew/bin/mvn clean compile -q
	cd "$ROOT_DIR"
	echo "后端编译通过。"
fi

if [ -n "$FRONTEND_CHANGED" ] || [ "$FORCE_FRONTEND" -eq 1 ]; then
	echo
	echo "[4/4] 前端类型检查"
	cd "$ROOT_DIR/frontend"
	npx tsc --noEmit
	cd "$ROOT_DIR"
	echo "前端类型检查通过。"
fi

echo
echo "检查通过。可以进入 git add / commit / push。"
echo "注意：本脚本无法代替云端 SQL 控制台实际执行 schema 体检；涉及数据库改动时，必须先完成人工核对。"