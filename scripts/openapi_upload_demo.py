#!/usr/bin/env python3
import argparse
import hashlib
import hmac
import json
import time
from urllib import request


def sign(secret: str, timestamp: str, body: str) -> str:
    return hmac.new(secret.encode('utf-8'), (timestamp + body).encode('utf-8'), hashlib.sha256).hexdigest()


def post_json(url: str, app_key: str, app_secret: str, payload: dict):
    body = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
    timestamp = str(int(time.time()))
    signature = sign(app_secret, timestamp, body)

    req = request.Request(url=url, method='POST', data=body.encode('utf-8'))
    req.add_header('Content-Type', 'application/json; charset=utf-8')
    req.add_header('X-App-Key', app_key)
    req.add_header('X-Timestamp', timestamp)
    req.add_header('X-Signature', signature)

    with request.urlopen(req, timeout=30) as resp:
        print(resp.read().decode('utf-8'))


def main():
    parser = argparse.ArgumentParser(description='OpenAPI 批量上传示例')
    parser.add_argument('--base-url', required=True, help='如 http://localhost:8088')
    parser.add_argument('--app-key', required=True)
    parser.add_argument('--app-secret', required=True)
    parser.add_argument('--type', choices=['orders', 'purchases'], required=True)
    args = parser.parse_args()

    if args.type == 'orders':
        url = args.base_url.rstrip('/') + '/openapi/v1/order/upload'
        payload = {
            'strict': False,
            'orders': [
                {
                    'styleNo': 'FZ2024001',
                    'company': '客户A',
                    'quantity': 100,
                    'colors': ['黑色'],
                    'sizes': ['M'],
                    'expectedShipDate': '2026-03-15',
                    'remarks': '脚本演示上传'
                }
            ]
        }
    else:
        url = args.base_url.rstrip('/') + '/openapi/v1/material/purchase/upload'
        payload = {
            'strict': False,
            'materialPurchases': [
                {
                    'orderNo': 'PO202602140001',
                    'materialCode': 'MAT001',
                    'materialName': '面料A',
                    'materialType': 'FABRIC',
                    'unit': '米',
                    'purchaseQuantity': 100,
                    'arrivedQuantity': 0,
                    'unitPrice': 12.5,
                    'supplierName': '供应商A',
                    'expectedArrivalDate': '2026-03-01',
                    'remark': '脚本演示上传'
                }
            ]
        }

    post_json(url, args.app_key, args.app_secret, payload)


if __name__ == '__main__':
    main()
