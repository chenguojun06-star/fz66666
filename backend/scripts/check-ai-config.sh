#!/bin/bash
# ============================================================
# 小云 AI 配置诊断脚本
# 用法：在服务器上执行 bash check-ai-config.sh
# 功能：检查 AI 相关的环境变量和配置是否正确
# ============================================================

echo "=========================================="
echo "  小云 AI 配置诊断"
echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="
echo ""

# 1. 检查环境变量
echo "【1. 环境变量检查】"
echo "------------------------------------------"

check_env() {
    local name=$1
    local required=$2
    local value=$(printenv "$name" 2>/dev/null || echo "")
    if [ -z "$value" ]; then
        if [ "$required" = "required" ]; then
            echo "  ❌ $name 未设置（必需）"
        else
            echo "  ⚠️  $name 未设置（可选）"
        fi
    else
        # 脱敏显示：前4位+***+后2位
        local len=${#value}
        if [ $len -gt 6 ]; then
            echo "  ✅ $name = ${value:0:4}***${value: -2}（长度 $len）"
        else
            echo "  ✅ $name = ***（长度 $len）"
        fi
    fi
}

check_env "DEEPSEEK_API_KEY" "required"
check_env "AGNES_API_KEY" "optional"
check_env "QDRANT_URL" "optional"
check_env "LITELLM_API_BASE" "optional"
check_env "LANGFUSE_PUBLIC_KEY" "optional"
check_env "LANGFUSE_SECRET_KEY" "optional"

echo ""

# 2. 检查 Qdrant 连通性
echo "【2. Qdrant 向量库连通性】"
echo "------------------------------------------"
QDRANT_URL=${QDRANT_URL:-"http://localhost:6333"}
echo "  Qdrant URL: $QDRANT_URL"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "$QDRANT_URL/healthz" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    echo "  ✅ Qdrant 健康检查通过 (HTTP 200)"
else
    echo "  ❌ Qdrant 连接失败 (HTTP $HTTP_CODE)"
    echo "     修复方法："
    echo "     - 启动 Qdrant: docker run -p 6333:6333 qdrant/qdrant"
    echo "     - 或设置 QDRANT_URL 环境变量指向远程 Qdrant"
fi
echo ""

# 3. 检查 DeepSeek API
echo "【3. DeepSeek API 连通性】"
echo "------------------------------------------"
if [ -z "$DEEPSEEK_API_KEY" ]; then
    echo "  ❌ DEEPSEEK_API_KEY 未设置，跳过"
else
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 \
        -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
        "https://api.deepseek.com/v1/models" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        echo "  ✅ DeepSeek API 正常 (HTTP 200)"
    else
        echo "  ❌ DeepSeek API 异常 (HTTP $HTTP_CODE)"
        echo "     修复方法：检查 DEEPSEEK_API_KEY 是否有效"
    fi
fi
echo ""

# 4. 检查 Agnes API
echo "【4. Agnes 视觉模型连通性】"
echo "------------------------------------------"
if [ -z "$AGNES_API_KEY" ]; then
    echo "  ⚠️  AGNES_API_KEY 未设置（视觉识别功能不可用，不影响核心业务）"
else
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 \
        -H "Authorization: Bearer $AGNES_API_KEY" \
        "https://apihub.agnes-ai.com/v1/models" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        echo "  ✅ Agnes API 正常 (HTTP 200)"
    elif [ "$HTTP_CODE" = "401" ]; then
        echo "  ❌ Agnes API 令牌无效 (HTTP 401)"
        echo "     修复方法：在微信云环境变量重新配置 AGNES_API_KEY"
    else
        echo "  ❌ Agnes API 异常 (HTTP $HTTP_CODE)"
    fi
fi
echo ""

# 5. 检查数据库关键字段
echo "【5. 数据库关键字段检查】"
echo "------------------------------------------"
echo "  需要手动执行以下 SQL 确认字段存在："
echo ""
echo "  -- 检查 t_scan_record 是否有 process_unit_price 字段"
echo "  SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS"
echo "  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_scan_record'"
echo "  AND COLUMN_NAME = 'process_unit_price';"
echo ""
echo "  -- 检查 t_ai_conversation_memory 是否有 memory_summary 字段"
echo "  SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS"
echo "  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_ai_conversation_memory'"
echo "  AND COLUMN_NAME = 'memory_summary';"
echo ""
echo "  如果字段不存在，执行："
echo "  mysql -u root -p < backend/src/main/resources/db/hotfix/V20260812_hotfix_cloud_missing_columns.sql"
echo ""

# 6. 总结
echo "=========================================="
echo "  诊断完成"
echo "=========================================="
echo ""
echo "如果所有检查项都是 ✅，说明小云 AI 配置正常。"
echo "如果有 ❌，按上述修复方法处理即可。"
echo "⚠️ 项是可选功能，不影响核心业务。"
