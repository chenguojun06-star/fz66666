#!/usr/bin/env python3
"""
系统健康检查脚本
定时执行，及时发现服务异常

用法：
  python3 scripts/system-health-check.py              # 检查所有项
  python3 scripts/system-health-check.py --quick     # 仅快速检查
  python3 scripts/system-health-check.py --watch     # 持续监控模式
"""

import sys
import time
import argparse
import subprocess
import ssl
from datetime import datetime
from typing import Optional
import urllib.request
import urllib.error

# ============================================================
# 配置
# ============================================================
API_BASE_URL = "https://api.webyszl.cn"
LOCAL_API_URL = "http://localhost:8088"
TIMEOUT = 5  # 请求超时秒数

# 健康检查项配置
HEALTH_CHECKS = {
    "api_service": {
        "url": f"{API_BASE_URL}/api/auth/login",
        "method": "GET",
        "expected_status": 401,  # 无token应返回401
        "critical": True,
    },
    "db_connection": {
        "check": "db",
        "critical": True,
    },
    "redis_connection": {
        "check": "redis",
        "critical": True,
    },
}


def print_status(ok: bool, msg: str):
    """打印带颜色的状态"""
    prefix = "✅" if ok else "❌"
    print(f"  {prefix} {msg}")


def check_api(url: str, expected_status: int, timeout: int = 5) -> tuple[bool, str]:
    """检查API是否可访问"""
    try:
        # 创建不验证SSL证书的上下文
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        req = urllib.request.Request(url, method="GET")
        req.add_header("User-Agent", "HealthCheck/1.0")
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            status = resp.getcode()
            if status == expected_status:
                return True, f"HTTP {status}"
            else:
                return False, f"HTTP {status} (期望 {expected_status})"
    except urllib.error.HTTPError as e:
        if e.code == expected_status:
            return True, f"HTTP {e.code}"
        return False, f"HTTP {e.code} (期望 {expected_status})"
    except Exception as e:
        return False, str(e)


def check_mysql() -> tuple[bool, str]:
    """检查MySQL连接"""
    try:
        import pymysql
        # 从环境变量或配置读取数据库连接信息
        result = subprocess.run(
            ["python3", "-c", """
import os
host = os.getenv('DB_HOST', '127.0.0.1')
port = int(os.getenv('DB_PORT', '3308'))
user = os.getenv('DB_USER', 'root')
password = os.getenv('DB_PASSWORD', os.getenv('MCP_DB_PASSWORD', ''))
conn = __import__('pymysql').connect(host=host, port=port, user=user, password=password, connect_timeout=3)
conn.ping(reconnect=False)
print('OK')
conn.close()
"""],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0 and "OK" in result.stdout:
            return True, "连接正常"
        return False, result.stderr or result.stdout
    except ImportError:
        # pymysql未安装，尝试mysql命令行
        return check_mysql_cli()
    except Exception as e:
        return False, str(e)


def check_mysql_cli() -> tuple[bool, str]:
    """使用mysql命令行检查MySQL"""
    try:
        result = subprocess.run(
            ["mysql", "-h", "127.0.0.1", "-P", "3308", "-u", "root",
             "-e", "SELECT 1", "-s"],
            capture_output=True,
            text=True,
            timeout=5,
            env={"MYSQL_PWD": "changeme"}
        )
        if result.returncode == 0:
            return True, "连接正常"
        return False, result.stderr[:100]
    except FileNotFoundError:
        return False, "mysql命令行未安装"
    except Exception as e:
        return False, str(e)


def check_redis() -> tuple[bool, str]:
    """检查Redis连接"""
    try:
        result = subprocess.run(
            ["python3", "-c", """
import os
import redis
r = redis.Redis(
    host=os.getenv('SPRING_REDIS_HOST', '127.0.0.1'),
    port=int(os.getenv('SPRING_REDIS_PORT', '6379')),
    password=os.getenv('SPRING_REDIS_PASSWORD') or None,
    db=int(os.getenv('SPRING_REDIS_DATABASE', '0')),
    socket_timeout=3
)
r.ping()
print('OK')
"""],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0 and "OK" in result.stdout:
            return True, "连接正常"
        return False, result.stderr or result.stdout
    except ImportError:
        # redis-cli
        try:
            result = subprocess.run(
                ["redis-cli", "-h", "127.0.0.1", "-p", "6379", "ping"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0 and "PONG" in result.stdout:
                return True, "连接正常"
            return False, result.stderr[:100]
        except FileNotFoundError:
            return False, "redis-cli未安装"
    except Exception as e:
        return False, str(e)


def check_critical_apis() -> tuple[bool, str]:
    """检查关键业务API"""
    apis = [
        ("/api/tenant/list", 200),  # 租户列表
        ("/api/production/order/page", 401),  # 需要token
    ]

    failures = []
    for path, expected in apis:
        ok, msg = check_api(f"{API_BASE_URL}{path}", expected)
        if not ok:
            failures.append(f"{path}: {msg}")

    if failures:
        return False, "; ".join(failures)
    return True, "关键API正常"


def check_database_health() -> tuple[bool, str]:
    """检查数据库健康指标"""
    try:
        result = subprocess.run(
            ["python3", "-c", """
import os
import pymysql

conn = pymysql.connect(
    host=os.getenv('DB_HOST', '127.0.0.1'),
    port=int(os.getenv('DB_PORT', '3308')),
    user=os.getenv('DB_USER', 'root'),
    password=os.getenv('DB_PASSWORD', os.getenv('MCP_DB_PASSWORD', '')),
    database='fashion_supplychain',
    connect_timeout=5
)

cursor = conn.cursor()

# 检查连接数
cursor.execute("SHOW STATUS LIKE 'Threads_connected'")
threads = cursor.fetchone()[1]

# 检查慢查询数量
cursor.execute("SHOW GLOBAL STATUS LIKE 'Slow_queries'")
slow = cursor.fetchone()[1]

# 检查最大连接数使用率
cursor.execute("SHOW VARIABLES LIKE 'max_connections'")
max_conn = int(cursor.fetchone()[1])
usage = int(threads) / max_conn * 100

print(f"连接数: {threads}/{max_conn} ({usage:.1f}%)")
print(f"慢查询: {slow}")

cursor.close()
conn.close()
"""],
            capture_output=True,
            text=True,
            timeout=15
        )
        if result.returncode == 0:
            return True, result.stdout.strip().replace("\n", "; ")
        return False, result.stderr[:100]
    except ImportError:
        return check_database_health_cli()
    except Exception as e:
        return False, str(e)


def check_database_health_cli() -> tuple[bool, str]:
    """使用命令行检查数据库健康"""
    try:
        result = subprocess.run(
            ["mysql", "-h", "127.0.0.1", "-P", "3308", "-u", "root",
             "-e", """
SELECT '连接数' as metric, VARIABLE_VALUE as value
FROM performance_schema.global_status
WHERE VARIABLE_NAME = 'Threads_connected'
UNION ALL
SELECT '慢查询', VARIABLE_VALUE
FROM performance_schema.global_status
WHERE VARIABLE_NAME = 'Slow_queries';
""", "-s", "--silent"],
            capture_output=True,
            text=True,
            timeout=10,
            env={"MYSQL_PWD": "changeme"}
        )
        if result.returncode == 0:
            return True, result.stdout.strip()[:100]
        return False, result.stderr[:100]
    except Exception as e:
        return False, str(e)


def check_flyway_migrations() -> tuple[bool, str]:
    """检查Flyway迁移状态"""
    try:
        result = subprocess.run(
            ["python3", "-c", """
import os
import pymysql

conn = pymysql.connect(
    host=os.getenv('DB_HOST', '127.0.0.1'),
    port=int(os.getenv('DB_PORT', '3308')),
    user=os.getenv('DB_USER', 'root'),
    password=os.getenv('DB_PASSWORD', os.getenv('MCP_DB_PASSWORD', '')),
    connect_timeout=5
)

cursor = conn.cursor(pymysql.cursors.DictCursor)
cursor.execute(\"\"\"
    SELECT version, description, success, installed_on
    FROM fashion_supplychain.flyway_schema_history
    WHERE type = 'SQL'
    ORDER BY installed_rank DESC
    LIMIT 5
\"\"\")

rows = cursor.fetchall()
for row in rows:
    status = '✅' if row['success'] else '❌'
    print(f"{status} {row['version']}: {row['description']}")

# 检查是否有失败的迁移
cursor.execute(\"\"\"
    SELECT COUNT(*) as cnt
    FROM fashion_supplychain.flyway_schema_history
    WHERE success = 0
\"\"\")
failed = cursor.fetchone()['cnt']

cursor.close()
conn.close()

if failed > 0:
    print(f"❌ 有 {failed} 个失败的迁移!")
    exit(1)
"""],
            capture_output=True,
            text=True,
            timeout=15
        )
        if result.returncode == 0:
            return True, "迁移状态正常"
        return False, "存在失败的迁移"
    except Exception as e:
        return False, str(e)


def quick_check() -> bool:
    """快速检查：仅检查API可用性"""
    print("🔍 快速检查...")
    ok1, msg1 = check_api(f"{API_BASE_URL}/api/auth/login", 401)
    print_status(ok1, f"API服务: {msg1}")
    return ok1


def full_check() -> bool:
    """完整检查"""
    print("🔍 系统健康检查")
    print("=" * 50)
    print(f"⏰ {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 50)

    all_ok = True

    # 1. API服务检查
    print("\n📡 API服务检查:")
    for name, config in HEALTH_CHECKS.items():
        if "url" in config:
            ok, msg = check_api(config["url"], config["expected_status"])
            print_status(ok, f"{name}: {msg}")
            if not ok and config.get("critical"):
                all_ok = False

    # 2. 关键API检查
    print("\n🔑 关键业务API:")
    ok, msg = check_critical_apis()
    print_status(ok, msg)
    if not ok:
        all_ok = False

    # 3. 数据库连接检查
    print("\n🗄️ 数据库检查:")
    ok, msg = check_mysql()
    print_status(ok, f"MySQL: {msg}")
    if not ok:
        all_ok = False

    # 4. 数据库健康指标
    print("\n📊 数据库健康指标:")
    ok, msg = check_database_health()
    print_status(ok, msg)

    # 5. Flyway迁移状态
    print("\n🔄 Flyway迁移:")
    ok, msg = check_flyway_migrations()
    print_status(ok, msg)

    # 6. Redis连接检查
    print("\n📦 Redis检查:")
    ok, msg = check_redis()
    print_status(ok, f"Redis: {msg}")

    # 汇总
    print("\n" + "=" * 50)
    if all_ok:
        print("🎉 所有检查通过")
    else:
        print("⚠️ 部分检查失败，请关注!")
    print("=" * 50)

    return all_ok


def watch_mode(interval: int = 60):
    """持续监控模式"""
    print(f"👀 持续监控模式 (间隔 {interval}秒, Ctrl+C 退出)")
    print("=" * 50)

    consecutive_failures = 0
    while True:
        try:
            ok = full_check()
            if ok:
                consecutive_failures = 0
            else:
                consecutive_failures += 1
                if consecutive_failures >= 3:
                    print("\n🚨 连续3次检查失败，发送告警...")
                    # TODO: 集成告警通知（钉钉/企微/邮件）

            time.sleep(interval)
        except KeyboardInterrupt:
            print("\n\n👋 退出监控")
            break


def main():
    parser = argparse.ArgumentParser(description="系统健康检查")
    parser.add_argument("--quick", action="store_true", help="快速检查模式")
    parser.add_argument("--watch", action="store_true", help="持续监控模式")
    parser.add_argument("--interval", type=int, default=60, help="监控间隔秒数")
    args = parser.parse_args()

    if args.quick:
        ok = quick_check()
    elif args.watch:
        watch_mode(args.interval)
    else:
        ok = full_check()
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
