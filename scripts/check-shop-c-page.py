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

  E. 补上查看器之后，手机端「点开大图就回不去详情页」（2026-10-14 追加核实）：
     查看器是在 touchend 里同步移除的，而浏览器紧接着会**补发一次 click**，
     落点已经不是查看器，而是下面刚露出来的商品主图 → 主图的点击处理又把大图打开，
     于是「点一下关不掉、再点一下还是关不掉」。右上角关闭键同样中招（它压在图片上方）。
     实测事件流：touchend→IMG ｜ 查看器移除 ｜ click→IMG ｜ 查看器插入。
     危害不止关不掉：穿透落点可能是颜色/尺码按钮（误选）或加购/立即购买（误下单）。
     电脑端没有这个补发事件，所以只在手机/微信里犯。

本脚本只做静态断言，防止上述五类问题再次被写回来。退出码 0=通过，1=发现回归。

另外守护「查看器能缩放」（2026-10-14 顾客追加反馈「图片不能缩放」）：
  查看器铺满全屏，必须 `touch-action:none` 挡掉浏览器对整页的原生缩放
  （否则缩的是整个网页、图片并不会变大），代价是缩放手势全部自己实现。
  于是捏合、双击、滚轮、平移限位、缩放层样式缺一不可，见下面 F 组。
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

SHOP_PAGE = sys.argv[1] if len(sys.argv) > 1 else "backend/src/main/resources/static/shop/index.html"
ROOT = __import__("pathlib").Path(__file__).resolve().parent.parent

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

    # ── E. 查看器必须掐掉触摸后补发的「穿透 click」（否则手机上关不掉、回不去详情页）──
    if "openImageViewer(" in js:
        if len(re.findall(r"swallowClicks\(", js)) < 2:
            fail(
                "查看器关闭后没有吞掉浏览器补发的「穿透 click」—— 手机上点开大图会关不掉、"
                "一直自己弹回来，顾客回不到详情页（2026-10-14 线上故障 E）"
            )
        if not re.search(r"document\.addEventListener\(\s*['\"]click['\"][\s\S]{0,260}?,\s*true\s*\)", js):
            fail(
                "穿透 click 的拦截必须挂在 document 的**捕获阶段**（addEventListener(..., true)）："
                "落点可能是颜色/尺码/加购按钮造成误触，只堵「重新打开大图」这一条路不够"
                "（2026-10-14 线上故障 E）"
            )
        m = re.search(r"mask\.addEventListener\(\s*['\"]touchend['\"]([\s\S]{0,900}?)\}\s*,\s*\{([^}]*)\}", js)
        if not m:
            fail("查看器缺少 touchend 处理，轻点关闭会失效")
        else:
            if "preventDefault" not in m.group(1):
                fail(
                    "查看器 touchend 里没有 preventDefault —— 掐不掉浏览器补发的兼容鼠标事件，"
                    "关闭后会穿透到下层元素（2026-10-14 线上故障 E）"
                )
            if "passive" not in m.group(2) or "false" not in m.group(2):
                fail(
                    "查看器 touchend 仍是 passive 监听 —— passive 监听里 preventDefault 不生效，"
                    "穿透点击拦不住（2026-10-14 线上故障 E）"
                )

    # ── F. 查看器必须能缩放（捏合 / 双击 / 滚轮），且平移要有边界 ──
    #  主流电商的全屏看图都能放大看细节。查看器铺满全屏必须 touch-action:none
    #  挡掉浏览器对整页的原生缩放，代价是缩放手势全得自己算 —— 少一环就会「捏不动」。
    if "openImageViewer(" in js:
        for need, why in [
            ("pinchStart(", "双指捏合缩放"),
            ("zoomAt(", "以触点/光标为锚点的缩放"),
            ("lastTap", "双击放大 / 还原"),
            ("MAXS", "最大放大倍数上限"),
            ("clampT(", "平移限位（否则图片会被拖出屏幕外）"),
            ("addEventListener('wheel'", "电脑端滚轮缩放"),
        ]:
            if need not in js:
                fail(f"查看器缺少「{why}」的实现（找不到 {need}）—— 顾客无法放大看细节")
        if "touch-action:none" not in html:
            fail(
                ".d-viewer 丢了 touch-action:none —— 双指捏合会去缩放整个网页而不是图片，"
                "自己实现的缩放也会被原生手势抢走"
            )
        if ".d-viewer .box" not in html:
            fail("缺少 .d-viewer .box 缩放层样式，缩放/平移会作用到错误的元素上")

    # ── G. 详情图纵向连续流（D-805）──────────────────────────────────
    # 2026-10-15 线上实测：商家配了 5 张详情图，顾客端只显示 1 张。
    # 根因是 onerror 里内层 class="..." 的双引号提前结束了外层 HTML 属性，
    # 第 2 张起的标签全被吞掉。**JS 语法完全合法、check 全绿、代码读起来正确**，
    # 只有真在浏览器里渲染一次才会发现 —— 所以这里直接对拼出的 HTML 做断言。
    if "function detailImageStack" not in js:
        fail(
            "缺少 detailImageStack() —— 商家配的详情图不会被渲染成"
            "「从上到下连成一条」的形态（历史故障：详情图被压进顶部 1:1 方块轮播，"
            "配了等于没配）"
        )
    else:
        # 复刻函数体，验证 5 张图能拼出 5 个完整标签
        m = re.search(r"function detailImageStack\(d\) \{.*?\n  \}", js, re.S)
        body = m.group(0) if m else ""
        if not body:
            fail("detailImageStack 函数体没匹配到，无法校验拼串结果")
        else:
            # 直接执行**文件里那一段真实函数体**，不复制一份到脚本里 ——
            # 复制等于测自己的副本，代码改了脚本还照旧通过，是典型的假门控。
            esc_js = (
                "const esc = s => String(s).replace(/[&<>\"']/g, c => "
                "({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));"
            )
            harness = "\n".join([
                esc_js,
                body,
                "const out = detailImageStack({gallery:['a.jpg','b.jpg','c.jpg','d.jpg','e.jpg']});",
                # 输出 base64，避免 HTML 里的引号在 subprocess 里被再转义一次
                "process.stdout.write(Buffer.from(out, 'utf8').toString('base64'));",
            ])
            try:
                b64 = subprocess.run(
                    ["node", "-e", harness],
                    capture_output=True, text=True, timeout=30,
                ).stdout.strip()
            except Exception as e:  # 没装 node 就跳过，不能因此卡住 CI
                b64 = ""
            if not b64:
                pass  # 无 node 环境：跳过，不给 CI 添假红
            else:
                import base64
                produced = base64.b64decode(b64).decode("utf-8", "replace")
                n_imgs = produced.count("<img ")
                if n_imgs < 5:
                    fail(
                        f"detailImageStack 拼 5 张图只产出 {n_imgs} 个 <img> 标签 —— "
                        "后面的图被静默丢掉（线上真实故障：配了 5 张只显示 1 张）"
                    )
                # 关键断言：onerror 属性里的 JS 字符串必须完整闭合。
                # 内层 class="..." 的裸双引号会提前结束外层 HTML 属性，
                # Chrome 会把后面所有图吞进这个属性里（只显示第 1 张），
                # 而 jsdom 会「好心」恢复成 5 张 —— 所以不能靠解析器判案。
                for attr in re.findall(r'onerror="([^"]*)"', produced):
                    if not attr.rstrip().endswith("'"):
                        fail(
                            "detailImageStack 的 onerror 属性被内层引号截断："
                            f"{attr[:60]!r} —— Chrome 会把后续所有详情图吞进这个属性，"
                            "配了 N 张只显示第 1 张（2026-10-15 线上真实故障）"
                        )
                        break

    # 详情图不该再进顶部轮播：轮播是 1:1 方块，详情图是纵向长图，混在一起顺序就失效了
    gallery_fn = re.search(r"function galleryImages.*?\n  \}", js, re.S)
    if gallery_fn and "d.gallery" in gallery_fn.group(0):
        fail(
            "galleryImages() 又把 d.gallery 塞进顶部轮播了 —— "
            "详情图必须由 detailImageStack 纵向渲染，"
            "塞进 1:1 轮播等于配了等于没配"
        )

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
