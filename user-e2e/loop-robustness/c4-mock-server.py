#!/usr/bin/env python3
"""0.1.58 PAC V2-06 loop 鲁棒性 · C4 活面 mock upstream（e2e lane，0.1.57 D4-B mock 同族）。

三模式（单进程端口，OpenAI 协议 /v1/chat/completions，SSE/JSON 双模）：

  C4-1 mid-stream partial（--mode midstream --port 8981，供直接 provider 活面探针
  c4-1-provider-live.ts：真 OpenAI SDK 流式客户端 + setEndpointConfigSource 注入本 mock）：
    流式主请求（messages 含 C4LIVE-058 标记 且 tools 非空）→ SSE 先发 2 个
    text_delta partial chunk（"Hel" + "lo "，各 0.3s 窗 flush）→ 流中途 RST 断流
    （SO_LINGER=1/0 → 客户端 ECONNRESET 族，对齐设计「断流」面与单测 sdkConnError
    ('ECONNRESET') 形状）→ 产品 C4-1 面 = partial 保留（assistant 轮次内容不丢）+
    interrupted 语义标记 + 单发终止（不整流重发）。非主循环 → 短文本 ok。

  C4-2 退避时序（--mode backoff --port 8982，供 PTY 主循环探针〔引擎主循环 = 非流式
  chat()，loop.ts L19/L362；chatStream 残留守不入引擎面〕；响应前瞬断 = 协议无关面）：
    主循环请求 #1/#2 → 响应前立即 socket destroy（瞬断类 ECONNRESET 族）；
    #3 起 → PONG-C4 终答（SSE/JSON 依 stream 标志）→ 干净隔离 provider 3 次重试
    预算内 C4-2 指数退避（缺省 base 500ms × 2^attempt = 500/1000，cap 8s；末次
    不退避）时序观测（本服务端请求日志 timestamps 断言前两段单调递增 + 带内）+
    预算内完成（无跨层 turnRecovery 重发混淆，#262 既有层出本断言面）。
    〔v1 定因登记：drop-3 面第 3 段 gap 2ms = provider 预算耗尽后 turnRecovery
    跨层重发（非本波 scope）→ v2 改 drop-2 隔离 provider 预算面〕

  0.1.62 /goal 评估器 judge（--mode judge --port 8983，供 goal 活探针
  user-e2e/tui-goal-0162.ts：产品 evaluateGoal（small 角色无 tools，首行
  MET/UNMET 解析）对 mock judge 活面 = 确定性两态零模型非定式，gate 判据⑥
  mock judge 活探针面；活面真 judge 仅生产观察面）：
    judge 请求判别 = 消息含 'Goal condition:'（evaluateGoal userPrompt 前缀，
    与主循环 C4LIVE-058 标记互斥）；canned 两态按请求序判别（--judge-plan
    'U,U,M'：U = 首行 UNMET+原因〔续跑支 reminder 面〕，M = 首行 MET+原因
    〔自清除 goal_met 面〕；序列耗尽 = 末态重复——maxGoalTurns 守卫面
    可确定驱动）。非 judge 请求 → 短文本 ok（不进计数）。

请求日志 = <out>/c4-<mode>-requests.jsonl（ts + path + 请求摘要 + tools 计数）。
用法：python3 c4-mock-server.py <out_dir> --mode midstream --port 8981
      python3 c4-mock-server.py <out_dir> --mode backoff   --port 8982
      python3 c4-mock-server.py <out_dir> --mode judge     --port 8983 --judge-plan U,U,M
"""
import json, os, sys, time, socket, struct, argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MARKER = 'C4LIVE-058'
# C4-1 midstream partial 窗（各 chunk 间 flush 延迟）：缺省 0.3s（防 client 首 chunk
# 未到先断）；ATLAS_E2E_C4_FLUSH_S 可配（0 = 立即 RST 变体，测 SDK 读中收 RST 语义）
FLUSH_S = float(os.environ.get('ATLAS_E2E_C4_FLUSH_S', '0.3'))


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument('out_dir')
    p.add_argument('--mode', choices=['midstream', 'backoff', 'judge', 'quota403', 'plain403'], required=True)
    p.add_argument('--port', type=int, required=True)
    # 0.1.62 judge 模式：canned 两态请求序计划（U=UNMET 续跑 / M=MET 自清除；
    # 耗尽 = 末态重复；env ATLAS_E2E_C4_JUDGE_PLAN 可覆写）
    p.add_argument('--judge-plan', default=os.environ.get('ATLAS_E2E_C4_JUDGE_PLAN', 'U,M'),
                   help="judge canned plan, comma-sep U/M per evaluator request (default 'U,M')")
    return p.parse_args()


class State:
    def __init__(self):
        self.main_calls = 0  # 主循环请求计数（C4-2 断言面 = attempt 序号）
        self.judge_calls = 0  # 0.1.62 judge 评估器请求计数（plan 序号判别面）


def make_handler(mode, out_dir, state, judge_plan='U,M'):
    log_path = os.path.join(out_dir, f'c4-{mode}-requests.jsonl')
    os.makedirs(out_dir, exist_ok=True)

    def log_req(entry):
        with open(log_path, 'a') as f:
            f.write(json.dumps(entry) + '\n')

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _send_sse(self, chunks):
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            for c in chunks:
                self.wfile.write(('data: ' + json.dumps(c) + '\n\n').encode())
                self.wfile.flush()
            self.wfile.write(b'data: [DONE]\n\n')
            self.wfile.flush()

        def _send_json(self, obj):
            data = json.dumps(obj).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _final_text(self, body, text):
            model = body.get('model', 'c4mock')
            cid, now = 'chatcmpl-c4mock', int(time.time())
            if body.get('stream'):
                self._send_sse([
                    {'id': cid, 'object': 'chat.completion.chunk', 'created': now, 'model': model,
                     'choices': [{'index': 0, 'delta': {'role': 'assistant', 'content': text}, 'finish_reason': None}]},
                    {'id': cid, 'object': 'chat.completion.chunk', 'created': now, 'model': model,
                     'choices': [{'index': 0, 'delta': {}, 'finish_reason': 'stop'}]},
                    {'id': cid, 'object': 'chat.completion.chunk', 'created': now, 'model': model,
                     'choices': [], 'usage': {'prompt_tokens': 100, 'completion_tokens': 20, 'total_tokens': 120}},
                ])
            else:
                self._send_json({'id': cid, 'object': 'chat.completion', 'created': now, 'model': model,
                                 'choices': [{'index': 0, 'message': {'role': 'assistant', 'content': text},
                                              'finish_reason': 'stop'}],
                                 'usage': {'prompt_tokens': 100, 'completion_tokens': 20, 'total_tokens': 120}})

        def do_GET(self):
            self._send_json({'object': 'list', 'data': []})

        def do_POST(self):
            ln = int(self.headers.get('Content-Length', 0))
            raw = self.rfile.read(ln) if ln else b'{}'
            try:
                body = json.loads(raw)
            except Exception:
                body = {}
            msgs = [m for m in body.get('messages', []) if isinstance(m, dict)]
            tools = body.get('tools') or []

            def msg_text(m):
                c = m.get('content')
                return c if isinstance(c, str) else (json.dumps(c, ensure_ascii=False) if c is not None else '')

            is_main = any(MARKER in msg_text(m) for m in msgs) and len(tools) > 0
            state.main_calls += 1 if is_main else 0
            call_no = state.main_calls if is_main else 0
            log_req({'ts': time.time(), 'path': self.path, 'mode': mode,
                     'main': is_main, 'call_no': call_no,
                     'tools_count': len(tools), 'model': body.get('model')})

            # ── 0.1.62 judge：goal 评估器（small 角色无 tools）canned 两态请求序 ──
            if mode == 'judge':
                is_judge = any('Goal condition:' in msg_text(m) for m in msgs)
                if not is_judge:
                    self._final_text(body, 'ok')
                    return
                state.judge_calls += 1
                plan = [x.strip().upper() for x in judge_plan.split(',') if x.strip()] or ['U', 'M']
                letter = plan[min(state.judge_calls - 1, len(plan) - 1)]  # 耗尽 = 末态重复
                canned = ('UNMET\ncanned-unmet: goal not yet achieved (judge request #{}).'.format(state.judge_calls)
                          if letter == 'U'
                          else 'MET\ncanned-met: goal achieved (judge request #{}).'.format(state.judge_calls))
                log_req({'ts': time.time(), 'path': self.path, 'mode': 'judge',
                         'judge': True, 'call_no': state.judge_calls, 'plan_letter': letter,
                         'tools_count': len(tools), 'model': body.get('model')})
                self._final_text(body, canned)
                return

            # ── 0.1.71 quota403/plain403：403 错误体判别面（quota 签名 vs 泛 403；
            #    供 tui-quota403-0171 活探针：池轮询全败 → A-2 quota_exhausted 子型 +
            #    A-3 可行动提示行，对照泛 403 = 恒等 auth 面零 quota 文案）──
            if mode in ('quota403', 'plain403'):
                err_body = ({'error': {'message': 'not enough quota to pre-consume',
                                       'type': 'quota_exhausted'}}
                            if mode == 'quota403'
                            else {'error': {'message': 'Forbidden', 'type': 'forbidden'}})
                payload = json.dumps(err_body).encode()
                self.send_response(403)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
                log_req({'ts': time.time(), 'path': self.path, 'mode': mode,
                         'status': 403, 'main': is_main, 'call_no': call_no,
                         'model': body.get('model')})
                return

            # ── side-channel（非主循环）：短文本，不耗故障计数/不进断言 ──
            if not is_main:
                self._final_text(body, 'ok')
                return

            if mode == 'midstream':
                # C4-1：SSE 先发 2 个 partial chunk → 流中途 RST 断（SO_LINGER=1/0
                # → 客户端 ECONNRESET 族；clean FIN 会被 SDK 当作流正常结束，非本面）
                try:
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/event-stream')
                    self.send_header('Cache-Control', 'no-cache')
                    self.end_headers()
                    model = body.get('model', 'c4mock')
                    cid, now = 'chatcmpl-c4mock', int(time.time())
                    for piece in ('Hel', 'lo '):
                        chunk = {'id': cid, 'object': 'chat.completion.chunk', 'created': now, 'model': model,
                                 'choices': [{'index': 0, 'delta': {'role': 'assistant', 'content': piece},
                                              'finish_reason': None}]}
                        self.wfile.write(('data: ' + json.dumps(chunk) + '\n\n').encode())
                        self.wfile.flush()
                        if FLUSH_S > 0:
                            time.sleep(FLUSH_S)  # partial 窗（防 client 首 chunk 未到先断）
                    # 中途 RST 断：SO_LINGER linger=0 → close 发 RST（ECONNRESET 族）
                    sock = self.connection
                    sock.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER,
                                    struct.pack('ii', 1, 0))
                    sock.close()
                except Exception:
                    try:
                        self.connection.close()
                    except Exception:
                        pass
                return

            # mode == 'backoff'：C4-2（v2：drop 前 2 次，第 3 次起成功 = 干净隔离
            # provider 3 次预算内退避；v1 drop-3 面第 3 段 = turnRecovery 跨层重发，
            # 非本波 scope，出断言面）
            if call_no <= 2:
                # 前 2 次主循环 = 瞬断类（响应前 socket destroy = ECONNRESET 族）
                self.connection.close()
                return
            self._final_text(body, 'PONG-C4')

    return H


def main():
    args = parse_args()
    state = State()
    handler = make_handler(args.mode, args.out_dir, state, args.judge_plan)
    ThreadingHTTPServer(('127.0.0.1', args.port), handler).serve_forever()


if __name__ == '__main__':
    main()
