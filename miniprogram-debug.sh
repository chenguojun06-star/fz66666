#!/bin/bash
# 小程序常见问题诊断脚本

echo "🔍 检查小程序常见问题..."
echo ""

# 1. 检查是否有对象直接传给 showToast
echo "1️⃣ 检查 showToast 可能的对象传递问题..."
grep -rn "wx.showToast" miniprogram/pages miniprogram/utils --include="*.js" | grep -v "title: '" | grep -v 'title: "' | grep -v "title: \`" | head -10

echo ""
echo "2️⃣ 检查错误处理中可能的对象输出..."
grep -rn "catch.*{" miniprogram/pages --include="*.js" -A 3 | grep "showToast\|console" | head -10

echo ""
echo "3️⃣ 检查 app.toast 的使用..."
grep -rn "app.toast\|getApp().toast" miniprogram/pages --include="*.js" | head -10

echo ""
echo "✅ 诊断完成！"
