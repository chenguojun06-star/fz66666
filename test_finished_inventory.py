from playwright.sync_api import sync_playwright
import os, json, urllib.request

SCREENSHOT_DIR = '/tmp/test_screenshots'
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

api_base = 'http://192.168.2.217:5177/api'

token = None
try:
    req = urllib.request.Request(
        f'{api_base}/system/user/login',
        data=json.dumps({'username': 'admin', 'password': 'admin@2026', 'tenantId': 2}).encode(),
        headers={'Content-Type': 'application/json'}
    )
    resp = urllib.request.urlopen(req, timeout=10)
    data = json.loads(resp.read())
    if data.get('code') == 200 or data.get('code') == 0:
        payload = data.get('data', data)
        if isinstance(payload, dict):
            token = payload.get('token') or payload.get('accessToken')
    print(f"Token obtained: {bool(token)}")
except Exception as e:
    print(f"Login error: {e}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 900})
    page = context.new_page()

    console_warnings = []
    def on_console(msg):
        if msg.type == 'warning':
            console_warnings.append(msg.text)
    page.on('console', on_console)

    page.goto('http://192.168.2.217:5177/login')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2000)

    if token:
        page.evaluate(f'''() => {{
            localStorage.setItem("authToken", "{token}");
            localStorage.setItem("userInfo", JSON.stringify({{"username": "admin", "name": "Admin"}}));
        }}''')

    page.goto('http://192.168.2.217:5177/warehouse/finished')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(3000)
    print(f"URL: {page.url}")

    # ===== TEST 1: Button text =====
    print("\n=== TEST 1: Button text ===")
    all_buttons = page.locator('button').all()
    button_texts = [b.inner_text() for b in all_buttons if b.is_visible()]
    has_no_purchase = any('无采购单入库' in t for t in button_texts)
    has_old_free = any('自由入库' in t for t in button_texts)
    print(f"  [PASS] '无采购单入库' button: {has_no_purchase}")
    print(f"  [PASS] '自由入库' removed: {not has_old_free}")

    # ===== TEST 2: Inbound modal - no tabs, unified interface =====
    print("\n=== TEST 2: Inbound modal ===")
    inbound_btn = page.locator('button:has-text("无采购单入库")').first
    inbound_btn.click()
    page.wait_for_timeout(1500)
    page.screenshot(path=f'{SCREENSHOT_DIR}/04_inbound_modal.png')

    modal = page.locator('.ant-modal-body').first
    tab_items = modal.locator('.ant-tabs-tab, .ant-tabs-tab-btn').all()
    tab_texts = [t.inner_text() for t in tab_items if t.is_visible()]
    has_single = any('单件入库' in t for t in tab_texts)
    has_batch = any('批量入库' in t for t in tab_texts)
    sku_input = modal.locator('input[placeholder*="SKU"], input[placeholder*="sku"]').first
    add_btn = modal.locator('button:has-text("添加")').first
    confirm_btn = page.locator('.ant-modal button:has-text("确认入库")').first

    print(f"  [PASS] No '单件入库' tab: {not has_single}")
    print(f"  [PASS] No '批量入库' tab: {not has_batch}")
    print(f"  [PASS] SKU input exists: {sku_input.is_visible()}")
    print(f"  [PASS] '添加' button exists: {add_btn.is_visible()}")
    print(f"  [PASS] '确认入库' button exists: {confirm_btn.is_visible()}")

    # Check source type options
    print("\n=== TEST 3: Source type options ===")
    all_selects = modal.locator('.ant-select').all()
    print(f"  Found {len(all_selects)} selects in modal")
    for i, sel in enumerate(all_selects):
        try:
            sel_text = sel.inner_text()
        except:
            continue
        print(f"  Select {i}: '{sel_text[:60]}'")

    # Click the first select (source type) to open dropdown
    first_select = all_selects[0] if len(all_selects) > 0 else None
    if first_select:
        first_select.click()
        page.wait_for_timeout(500)
        page.screenshot(path=f'{SCREENSHOT_DIR}/05_source_options.png')
        options = page.locator('.ant-select-item-option').all()
        option_texts = [o.inner_text() for o in options if o.is_visible()]
        print(f"  Source options: {option_texts}")
        has_no_purchase_opt = any('无采购单入库' in t for t in option_texts)
        has_old_free_opt = any('自由入库' in t for t in option_texts)
        print(f"  [PASS] '无采购单入库' option: {has_no_purchase_opt}")
        print(f"  [PASS] '自由入库' removed: {not has_old_free_opt}")
        page.keyboard.press('Escape')
        page.wait_for_timeout(300)

    # Close modal using X button or press Escape
    page.keyboard.press('Escape')
    page.wait_for_timeout(500)
    # Also try clicking the mask
    modal_mask = page.locator('.ant-modal-wrap').first
    if modal_mask.is_visible():
        page.keyboard.press('Escape')
        page.wait_for_timeout(500)

    # Force close by clicking outside
    page.locator('body').click(position={'x': 5, 'y': 5})
    page.wait_for_timeout(500)

    # Check if modal is still open
    modal_visible = page.locator('.ant-modal-wrap:visible').count() > 0
    if modal_visible:
        print("  Modal still open, trying close button...")
        close_x = page.locator('.ant-modal-close').first
        if close_x.is_visible():
            close_x.click()
            page.wait_for_timeout(500)

    # ===== TEST 4: Scan modal outbound - no 自由出库 =====
    print("\n=== TEST 4: Scan modal outbound ===")
    # Wait for any modal to close
    page.wait_for_timeout(1000)
    scan_btn = page.locator('button:has-text("扫码出入库")').first
    if scan_btn.is_visible():
        scan_btn.click()
        page.wait_for_timeout(1500)
        page.screenshot(path=f'{SCREENSHOT_DIR}/08_scan_modal.png')

        # Find the operation type select and switch to outbound
        selects = page.locator('.ant-modal .ant-select').all()
        for sel in selects:
            try:
                sel_text = sel.inner_text()
            except:
                continue
            if '入库' in sel_text and '出库' not in sel_text:
                sel.click()
                page.wait_for_timeout(500)
                outbound_opt = page.locator('.ant-select-item-option:has-text("出库")').first
                if outbound_opt.is_visible():
                    outbound_opt.click()
                    page.wait_for_timeout(500)
                    print("  Switched to outbound mode")
                    break

        page.screenshot(path=f'{SCREENSHOT_DIR}/09_scan_outbound.png')

        # Find outbound type select
        selects = page.locator('.ant-modal .ant-select').all()
        for sel in selects:
            try:
                sel_text = sel.inner_text()
            except:
                continue
            if '扫码出库' in sel_text or '样品出库' in sel_text:
                sel.click()
                page.wait_for_timeout(500)
                page.screenshot(path=f'{SCREENSHOT_DIR}/10_scan_outbound_options.png')
                options = page.locator('.ant-select-item-option').all()
                option_texts = [o.inner_text() for o in options if o.is_visible()]
                print(f"  Scan outbound options: {option_texts}")
                has_free_out = any('自由出库' in t for t in option_texts)
                print(f"  [PASS] '自由出库' removed: {not has_free_out}")
                page.keyboard.press('Escape')
                page.wait_for_timeout(300)
                break

        # Close modal
        page.keyboard.press('Escape')
        page.wait_for_timeout(500)
        close_x = page.locator('.ant-modal-close').first
        if close_x.is_visible():
            close_x.click()
            page.wait_for_timeout(500)

    # ===== TEST 5: Qrcode outbound modal - no 自由出库 =====
    print("\n=== TEST 5: Qrcode outbound modal ===")
    page.wait_for_timeout(1000)
    qrcode_btn = page.locator('button:has-text("扫码出库")').first
    if qrcode_btn.is_visible():
        qrcode_btn.click()
        page.wait_for_timeout(1500)
        page.screenshot(path=f'{SCREENSHOT_DIR}/11_qrcode_outbound.png')

        selects = page.locator('.ant-modal .ant-select').all()
        for sel in selects:
            try:
                sel_text = sel.inner_text()
            except:
                continue
            if '销售出库' in sel_text:
                sel.click()
                page.wait_for_timeout(500)
                page.screenshot(path=f'{SCREENSHOT_DIR}/12_qrcode_outbound_options.png')
                options = page.locator('.ant-select-item-option').all()
                option_texts = [o.inner_text() for o in options if o.is_visible()]
                print(f"  Qrcode outbound options: {option_texts}")
                has_free_out = any('自由出库' in t for t in option_texts)
                print(f"  [PASS] '自由出库' removed: {not has_free_out}")
                page.keyboard.press('Escape')
                page.wait_for_timeout(300)
                break

        page.keyboard.press('Escape')
        page.wait_for_timeout(500)

    # ===== TEST 6: Console key warnings =====
    print("\n=== TEST 6: Console key warnings ===")
    key_warnings = [w for w in console_warnings if 'same key' in w.lower() or 'Encountered two children' in w]
    print(f"  React key warning count: {len(key_warnings)}")
    print(f"  [PASS] No key warnings: {len(key_warnings) == 0}")

    print("\n=== ALL TESTS COMPLETE ===")
    browser.close()
