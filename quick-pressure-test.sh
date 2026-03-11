#!/bin/bash

echo "════════════════════════════════════════════════"
echo "   系统压力测试（100/500/1000 VU）"
echo "════════════════════════════════════════════"
echo ""

# 测试目标
TARGET="http://localhost:8088/api/production/notice/unread-count"

# 场景 1: 100 并发
echo "🔷 场景 1: 100 VU × 30秒"
echo "   命令: ab -n 3000 -c 100 $TARGET"
echo ""
ab -n 3000 -c 100 "$TARGET" 2>&1 | grep -E "Requests per second|Time per request|Failed requests|Connect|Processing|Waiting"
echo ""
echo "   等待 10 秒..."
sleep 10
echo ""

# 场景 2: 500 并发
echo "🔷 场景 2: 500 VU × 30秒"
echo "   命令: ab -n 2500 -c 500 $TARGET"
echo ""
ab -n 2500 -c 500 "$TARGET" 2>&1 | grep -E "Requests per second|Time per request|Failed requests|Connect|Processing|Waiting"
echo ""
echo "   等待 10 秒..."
sleep 10
echo ""

# 场景 3: 1000 并发
echo "🔷 场景 3: 1000 VU × 30秒"
echo "   命令: ab -n 3000 -c 1000 $TARGET"
echo ""
ab -n 3000 -c 1000 "$TARGET" 2>&1 | grep -E "Requests per second|Time per request|Failed requests|Connect|Processing|Waiting"
echo ""

echo "════════════════════════════════════════════════"
echo "   ✅ 测试完成"
echo "════════════════════════════════════════════════"
