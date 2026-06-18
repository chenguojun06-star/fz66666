from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    
    # 监听console错误
    errors = []
    page.on("console", lambda msg: errors.append(f"[{msg.type}] {msg.text}") if msg.type == "error" else None)
    
    try:
        # 1. 访问登录页面
        print("1. 访问登录页面...")
        page.goto("http://localhost:5173", wait_until="networkidle")
        page.screenshot(path="/tmp/01_login.png")
        print("   登录页面截图已保存: /tmp/01_login.png")
        
        # 2. 等待页面加载
        page.wait_for_timeout(2000)
        
        # 3. 尝试登录
        print("2. 尝试登录...")
        try:
            # 查找用户名输入框 - 尝试多种选择器
            selectors = [
                "input[placeholder*='账']",
                "input[placeholder*='用户']", 
                "input[type='text']",
                "#username",
                "input[name='username']"
            ]
            username_input = None
            for sel in selectors:
                try:
                    inp = page.locator(sel).first
                    if inp.is_visible(timeout=2000):
                        username_input = inp
                        break
                except:
                    continue
            
            if username_input:
                username_input.fill("lilb")
                page.locator("input[type='password']").fill("123456")
                page.locator("button[type='submit'], button:has-text('登录'), button:has-text('登 录')").first.click()
                page.wait_for_timeout(5000)
                page.screenshot(path="/tmp/02_after_login.png")
                print("   登录操作完成!")
            else:
                print("   未找到登录表单，跳过登录")
        except Exception as e:
            print(f"   登录尝试: {e}")
            page.screenshot(path="/tmp/02_login_error.png")
        
        # 5. 导航到色卡管理页面
        print("3. 导航到色卡管理页面...")
        page.goto("http://localhost:5173/warehouse/color-card", wait_until="domcontentloaded")
        page.wait_for_timeout(5000)  # 等待React渲染
        page.screenshot(path="/tmp/03_color_card_list.png")
        print("   色卡列表截图已保存: /tmp/03_color_card_list.png")
        
        # 6. 检查页面内容
        print("4. 检查页面元素...")
        page_content = page.content()
        page_text = page.inner_text("body")
        
        # 打印页面文本前200个字符用于调试
        print(f"   页面文本预览: {page_text[:200]}")
        
        if "色卡" in page_text:
            print("   ✅ 页面包含'色卡'文字")
        else:
            print("   ❌ 页面未包含'色卡'文字")
        
        if "新建色卡本" in page_content:
            print("   ✅ 页面包含'新建色卡本'按钮")
        else:
            print("   ❌ 页面未包含'新建色卡本'按钮")
        
        # 7. 检查表格是否渲染
        tables = page.locator("table").all()
        print(f"   页面表格数量: {len(tables)}")
        
        # 8. 尝试点击新建按钮
        print("5. 尝试点击新建按钮...")
        try:
            new_btn = page.get_by_text("新建色卡本")
            if new_btn.is_visible(timeout=3000):
                new_btn.click()
                page.wait_for_timeout(1000)
                page.screenshot(path="/tmp/04_new_dialog.png")
                print("   ✅ 新建弹窗已打开!")
                
                # 9. 检查弹窗内容
                dialog_content = page.content()
                if "色卡本编号" in dialog_content:
                    print("   ✅ 弹窗包含'色卡本编号'表单")
                if "供应商" in dialog_content:
                    print("   ✅ 弹窗包含'供应商'表单")
                if "幅宽" in dialog_content:
                    print("   ✅ 弹窗包含'幅宽'表单")
                
                # 10. 关闭弹窗
                page.keyboard.press("Escape")
                page.wait_for_timeout(500)
        except Exception as e:
            print(f"   点击新建按钮: {e}")
        
        # 11. 打印console错误
        if errors:
            print(f"\n⚠️ Console错误数量: {len(errors)}")
            for err in errors[:5]:
                print(f"   {err}")
        else:
            print("\n✅ 无Console错误!")
            
    except Exception as e:
        print(f"测试异常: {e}")
        page.screenshot(path="/tmp/error.png")
    finally:
        browser.close()
        print("\n测试完成!")
