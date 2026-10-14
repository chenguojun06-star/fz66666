#!/usr/bin/env python3
"""
顾客端店铺页（shop/index.html）关键交互守护
============================================

背景（2026-10-14 线上核实）：顾客浏览店铺商品详情时反馈三件事——
  ① 图片点不了、放大不了；
  ② 左右切不了图；
  ③ 选了颜色之后尺码不出来。

逐条复现后的真因（都是"代码看起来没问题、顾客就是点不动"的静默故障）：

  A. `galImgs` 从未声明。选颜色的处理函数里读它 → ReferenceError →
     **该处理函数在 `refreshSizes()` 之前就中断**，颜色高亮变了、尺码永远不出现。
     实测 11 款在售商品里 5 款（45%）命中。

  B. 左右箭头的 onclick 被自动播放覆盖。`on(id, fn)` 用的是 `el.onclick = fn`（只能挂一个），
     自动播放那段又写了一次 `on('cnext', startAuto)` → 点箭头只重新计时、不换图。
     实测点击箭头序号不变；电脑上打开分享链接时，箭头是**唯一**的切图入口 → 完全切不了图。

  C. 拖动事件绑在 `.track` 上，而左右箭头/返回键是 `.track` 的**兄弟节点**，
     手指落在箭头上时事件不冒泡到 `.track` → 滑动被整条吞掉。
     实测从图片右缘起手左滑无任何反应。

  D. 图片没有任何点击行为，也没有全屏查看器 —— "点开放大"这个功能根本没做。

本脚本只做静态断言，防止上述四类问题再次被写回来。退出码 0=通过，1=发现回归。
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile

SHOP_PAGE = sys.argv[1] if len(sys.argv) > 1 else "backend/src/main/resources/static/shop/index.html"

FAILURES = []


def fail(msg):
    FAILURES.append(msg)


def read(path):
    if not os.path.exists(path):
        print(f"⚠️  找不到 {path}，跳过")
        return None
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def extract_inline_scripts(html):
    return re.findall(r"<script>([\s\S]*?)</script>", html)


def main():
    html = read(SHOP_PAGE)
    if html is None:
        return 0

    scripts = extract_inline_scripts(html)
    if not scripts:
        fail(f"{SHOP_PAGE}: 找不到内联 <script>，脚本结构可能已变，请更新本守护脚本")
        return report()

    js = "\n".join(scripts)

    # ── 0. 内联脚本必须能解析（语法错误会让整页卡在「加载中」）──
    node = shutil.which("node")
    if node:
        for i, code in enumerate(scripts):
            with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as f:
                f.write(code)
                tmp = f.name
            try:
                r = subprocess.run([node, "--check", tmp], capture_output=True, text=True)
                if r.returncode != 0:
                    fail(f"{SHOP_PAGE}: 第 {i + 1} 段内联脚本语法错误 —— {r.stderr.strip().splitlines()[:2]}")
            finally:
                os.unlink(tmp)
    else:
        print("⚠️  未找到 node，跳过语法校验")

    # ── A. galImgs 必须声明后才能用（否则选颜色时抛 ReferenceError，尺码不出现）──
    if re.search(r"\bgalImgs\b", js) and not re.search(r"\bvar\s+galImgs\b", js):
        fail(
            "选颜色换图引用了 galImgs，但脚本里没有 `var galImgs` 声明 —— "
            "点击颜色会抛 ReferenceError，尺码将永远不刷新（2026-10-14 线上故障 A）"
        )

    # ── A2. 选颜色换图必须容错，且 refreshSizes() 必须在同一个处理函数里 ──
    if "refreshSizes()" not in js:
        fail("详情页缺少 refreshSizes() 调用 —— 选择颜色后尺码不会刷新")
    if "heroUrlFor(sel.color)" in js and "catch (err)" not in js:
        fail(
            "选颜色换图那段没有 try/catch —— 一旦抛错就会打断后面的 refreshSizes()，"
            "症状是「颜色点得动、尺码不出来」（2026-10-14 线上故障 A）"
        )

    # ── B. 禁止用 on() 覆盖箭头 onclick（on() 内部是 el.onclick = fn，只能挂一个）──
    for bad in re.findall(r"on\(\s*'(cprev|cnext)'\s*,\s*startAuto\s*\)", js):
        fail(
            f"发现 on('{bad}', startAuto)：on() 用 el.onclick 赋值，会把箭头的切图处理函数"
            "覆盖掉 —— 箭头变成只重新计时、不换图（2026-10-14 线上故障 B）"
        )

    # ── C. 拖动事件必须绑在轮播容器上，不能绑在 .track 上 ──
    if re.search(r"ctrack\.addEventListener\(\s*'touch", js):
        fail(
            "触摸事件绑在 .track（ctrack）上：左右箭头/返回键是它的兄弟节点，"
            "手指落在箭头上时事件不冒泡到 .track，滑动会被吞掉（2026-10-14 线上故障 C）"
        )
    if not re.search(r"(carouselEl|dragEl)\.addEventListener\(\s*'touchstart'", js):
        fail("找不到把 touchstart 绑到轮播容器（carouselEl/dragEl）的代码，左右拖动可能已失效")

    # ── C2. 桌面端（无触摸）也必须能切图：要有鼠标拖动 ──
    if not re.search(r"\.addEventListener\(\s*'mousedown'", js):
        fail("没有鼠标拖动支持 —— 电脑上打开分享链接时无法左右切图（2026-10-14 线上故障 B/C）")

    # ── D. 轻点图片放大必须存在 ──
    if "openImageViewer(" not in js:
        fail("详情页缺少 openImageViewer( —— 顾客点图片无法放大（2026-10-14 线上故障 D）")
    if not re.search(r"carouselEl\.addEventListener\(\s*'click'", js):
        fail("轮播没有绑定 click 打开大图，顾客点图片不会有反应")
    if ".d-viewer{" not in html.replace(" ", ""):
        fail("缺少 .d-viewer 查看器样式，放大层会显示异常")

    return report()


def report():
    if FAILURES:
        print("❌ 顾客端店铺页交互守护未通过：\n")
        for i, m in enumerate(FAILURES, 1):
            print(f"  {i}. {m}")
        print("\n以上都曾是线上真实故障，请不要修好又改回去。")
        return 1
    print("✅ 顾客端店铺页交互守护通过（切图 / 放大 / 选色出尺码）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
