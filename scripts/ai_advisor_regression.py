#!/usr/bin/env python3
"""AI 顾问回归脚本：验证知识库混合检索、推演沙盘、多智能体协同三条主链。"""
import json
import sys
import urllib.error
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8088"
USERNAME = sys.argv[2] if len(sys.argv) > 2 else "admin"
PASSWORD = sys.argv[3] if len(sys.argv) > 3 else "admin123"

PASS = 0
FAIL = 0
SKIP = 0


def req(method, path, data=None, token=None, timeout=60):
    url = BASE + path
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    body = json.dumps(data).encode("utf-8") if data is not None else None
    try:
        request = urllib.request.Request(url, data=body, headers=headers, method=method)
        with urllib.request.urlopen(request, timeout=timeout) as response:
            text = response.read().decode("utf-8", errors="replace")
            try:
                return response.getcode(), json.loads(text)
            except Exception:
                return response.getcode(), text
    except urllib.error.HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        try:
            return exc.code, json.loads(text)
        except Exception:
            return exc.code, text
    except Exception as exc:
        return 0, str(exc)


def mark(name, passed, detail=""):
    global PASS, FAIL, SKIP
    if passed is None:
        SKIP += 1
        icon = "⏭"
    elif passed:
        PASS += 1
        icon = "✅"
    else:
        FAIL += 1
        icon = "❌"
    suffix = f" [{detail}]" if detail else ""
    print(f"  {icon} {name}{suffix}")


def extract_token(login_body):
    if not isinstance(login_body, dict):
        return ""
    data = login_body.get("data")
    if isinstance(data, dict):
        return data.get("token", "")
    if isinstance(data, str):
        return data
    return ""


def advisor_answer(body):
    if not isinstance(body, dict):
        return ""
    data = body.get("data")
    if isinstance(data, dict):
        return data.get("answer", "")
    return ""


def contains_any(text, keywords):
    return any(keyword in text for keyword in keywords)


def main():
    print("\n=== AI 顾问回归测试 ===")
    print(f"BASE={BASE}")

    code, login = req("POST", "/api/system/user/login", {"username": USERNAME, "password": PASSWORD}, timeout=20)
    token = extract_token(login)
    login_ok = code == 200 and isinstance(login, dict) and login.get("code") == 200 and token
    mark("登录获取 Token", bool(login_ok), f"code={code}")
    if not login_ok:
        print("\n无法登录，停止回归。")
        return 1

    code, status = req("GET", "/api/intelligence/ai-advisor/status", token=token, timeout=20)
    enabled = code == 200 and isinstance(status, dict) and status.get("code") == 200 and bool(status.get("data", {}).get("enabled"))
    if not enabled:
        mark("AI 顾问已启用", None, "未配置模型直连/网关，跳过问答回归")
        print(f"\n结果：{PASS} PASS / {FAIL} FAIL / {SKIP} SKIP")
        return 0
    mark("AI 顾问已启用", True)

    cases = [
        {
            "name": "知识库混合检索",
            "question": "FOB 和 CMT 是什么意思，系统里建单前要注意什么？",
            "must_not": ["问题不能为空", "推理服务暂时不可用"],
            "should_have": ["FOB", "CMT", "建单", "【推荐追问】"],
            "timeout": 90,
        },
        {
            "name": "推演沙盘",
            "question": "如果把一个订单提前3天交货，通常会对完工日、成本和逾期风险有什么影响？",
            "must_not": ["问题不能为空", "推理服务暂时不可用"],
            "should_have": ["成本", "风险", "提前", "【推荐追问】"],
            "timeout": 90,
        },
        {
            "name": "多智能体协同",
            "question": "从排产、采购、合规、物流四个角度看，我现在最需要关注什么？",
            "must_not": ["问题不能为空", "推理服务暂时不可用"],
            "should_have": ["关注", "风险", "建议", "【推荐追问】"],
            "timeout": 180,
        },
    ]

    for case in cases:
        code, body = req(
            "POST",
            "/api/intelligence/ai-advisor/chat",
            {"question": case["question"]},
            token=token,
            timeout=case["timeout"],
        )
        answer = advisor_answer(body)
        passed = (
            code == 200
            and isinstance(body, dict)
            and body.get("code") == 200
            and isinstance(body.get("data"), dict)
            and body.get("data", {}).get("source") == "ai"
            and len(answer.strip()) >= 20
            and not contains_any(answer, case["must_not"])
            and contains_any(answer, case["should_have"])
        )
        detail = f"code={code}, len={len(answer)}, timeout={case['timeout']}"
        if not passed:
            detail += f", answer={answer[:160]}"
        mark(case["name"], passed, detail)

    print(f"\n结果：{PASS} PASS / {FAIL} FAIL / {SKIP} SKIP")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
