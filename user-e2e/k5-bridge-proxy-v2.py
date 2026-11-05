#!/usr/bin/env python3
"""Tier 1 双臂对比桥代理 v2（0.1.88 gate Tier 1 判据配套，f4 §C 补充条款 1）。

在 k5-bridge-proxy.py（v1，请求体落盘）之上增加：响应首块 tee 落盘
（NNN-resp-head.bin，前 4096 字节）——SSE 流首 chunk / 非 stream 响应体含
model + system_fingerprint 字段，作 serving 换面直证（f4 补充 1：双字段都记）。

仅 e2e 沙箱用；零写产品面。用法：
  python3 k5-bridge-proxy-v2.py --port 8998 --upstream 127.0.0.1:8999 --logdir <dir>
"""
import argparse
import http.client
import http.server
import json
import os
import threading

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8998)
    ap.add_argument('--upstream', default='127.0.0.1:8999')
    ap.add_argument('--logdir', required=True)
    args = ap.parse_args()
    os.makedirs(args.logdir, exist_ok=True)
    counter = {'n': 0}
    lock = threading.Lock()

    class Handler(http.server.BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'

        def log_message(self, fmt, *a):
            pass

        def _handle(self):
            length = int(self.headers.get('Content-Length') or 0)
            body = self.rfile.read(length) if length else b''
            with lock:
                counter['n'] += 1
                n = counter['n']
            with open(os.path.join(args.logdir, '%03d-meta.json' % n), 'w') as f:
                json.dump({
                    'n': n,
                    'method': self.command,
                    'path': self.path,
                    'headers': dict(self.headers),
                    'bodyBytes': len(body),
                }, f, ensure_ascii=False, indent=1)
            with open(os.path.join(args.logdir, '%03d-body.bin' % n), 'wb') as f:
                f.write(body)
            # 请求体顶层 model 字段（wire 直证）
            try:
                req_model = json.loads(body).get('model', '') if body else ''
            except Exception:  # noqa: BLE001
                req_model = ''
            host, _, port = args.upstream.partition(':')
            conn = http.client.HTTPConnection(host, int(port or 8999), timeout=300)
            fwd = {k: v for k, v in self.headers.items()
                   if k.lower() not in ('host', 'connection', 'content-length',
                                        'transfer-encoding', 'accept-encoding')}
            try:
                conn.request(self.command, self.path, body=body if body else None,
                             headers=fwd)
                resp = conn.getresponse()
                self.send_response(resp.status)
                for k, v in resp.getheaders():
                    if k.lower() in ('content-length', 'transfer-encoding',
                                     'connection', 'content-encoding'):
                        continue
                    self.send_header(k, v)
                self.send_header('Connection', 'close')
                self.end_headers()
                head_written = False
                head = b''
                total = 0
                while True:
                    chunk = resp.read(4096)
                    if not chunk:
                        break
                    total += len(chunk)
                    if not head_written:
                        head = (head + chunk)[:4096]
                        if len(head) >= 4096:
                            head_written = True
                    self.wfile.write(chunk)
                    self.wfile.flush()
                if not head_written and head:
                    head_written = True
                with open(os.path.join(args.logdir, '%03d-resp-head.bin' % n), 'wb') as f:
                    f.write(head)
                with open(os.path.join(args.logdir, '%03d-resp-meta.json' % n), 'w') as f:
                    json.dump({
                        'n': n,
                        'status': resp.status,
                        'respBytes': total,
                        'reqModel': req_model,
                    }, f, ensure_ascii=False, indent=1)
            except Exception as e:  # noqa: BLE001
                try:
                    self.send_response(502)
                    self.end_headers()
                    self.wfile.write(str(e).encode())
                except Exception:
                    pass
            finally:
                conn.close()

        do_GET = _handle
        do_POST = _handle
        do_PUT = _handle
        do_DELETE = _handle

    srv = http.server.ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print('READY port=%d upstream=%s logdir=%s' % (args.port, args.upstream, args.logdir), flush=True)
    srv.serve_forever()

if __name__ == '__main__':
    main()
