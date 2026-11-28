/**
 * AtlasWeb S0-R cursor/result snapshot 账本（工单 §4.3 / 呈批书 §7.5）。
 *
 * opaque 随机 token ↔ 实例内绑定 {product, scope, session, baselineId,
 * generation, revision, expiry}。伪造/未知 → 'unknown'（调用方按
 * resetRequired+新 baseline 或 closed 处置）；跨域 → 'mismatch'
 * （scopeDenied）；过期 → 'expired'（resetRequired+新 baseline）。
 * LRU 淘汰序：未 pin（无活跃 subscription 绑定）先淘；全 pinned 淘最旧
 * pinned 并回调 onActiveEvict（显式 resetRequired，禁静默失效）。
 */

import { randomUUID } from 'node:crypto'

import { WebSessionError } from './errors'

export type CursorVerifyResult =
  | { ok: true; binding: CursorBinding }
  | { ok: false; why: 'unknown' | 'expired' | 'mismatch'; message: string }

export interface CursorBinding {
  /**
   * token 内部版本化（S0-R5 呈批书 §3 @6e772c02）：opaque token 不变，
   * payload 结构版本字段在册（v1 = 首个携字节锚的版本；升级 wire 不
   * breaking——消费侧只持 opaque token）。
   */
  v: 1
  productId: string
  scopeId: string
  sessionId: string
  baselineId: string
  generation: string
  revision: number
  /**
   * S0-R5 加性字节锚（§12-3 机制钉）：resume 续接的读取起点（完整记录
   * 边界或含 pendingPartial 的 EOF）与文件身份锚。加性面，既有五字段
   * 不动。
   */
  byteOffset: number
  ino: number
}

interface Entry {
  token: string
  binding: CursorBinding
  expiresAt: number
  pinned: boolean
}

export class CursorLedger {
  private readonly entries = new Map<string, Entry>()
  private readonly payloadBytes = new Map<string, number>()

  constructor(
    private readonly capacity: number,
    private readonly ttlMs: number,
    private readonly maxPayloadBytes: number,
    private readonly onActiveEvict?: (token: string, binding: CursorBinding) => void,
  ) {}

  issue(binding: CursorBinding, payloadBytes = 0): string {
    // W-FC-1 修形 1（工单 docs/2026-11-28-wfc1-ledger-evict-ticket.md §3，
    // 候选 A 采）：单 payload 本身超账本字节上界 → 显性拒绝（resourceLimit），
    // 禁静默 overshoot。落点 = evictForInsert 之前：拒绝零副作用（entries/
    // payloadBytes 未触、pinned victim 零误淘、onActiveEvict 零误触发——
    // T1 零副作用断言锁此放置）。守恒不变量（成功 issue 后
    // totalPayloadBytes() ≤ maxPayloadBytes）由此闭合。先例 = 同文件
    // assertLedgerConfig throw 形（候选 B result union 弃，工单 §5 自决 1）。
    if (payloadBytes > this.maxPayloadBytes) {
      throw new WebSessionError(
        'resourceLimit',
        `ledger payload exceeds cap (${payloadBytes} > ${this.maxPayloadBytes} bytes)`,
      )
    }
    this.evictForInsert(payloadBytes)
    const token = randomUUID()
    this.entries.set(token, {
      token,
      binding,
      expiresAt: Date.now() + this.ttlMs,
      pinned: false,
    })
    this.payloadBytes.set(token, payloadBytes)
    return token
  }

  /** 活跃 subscription 绑定 pin（LRU 淘序：未 pin 先淘）。 */
  pin(token: string): void {
    const e = this.entries.get(token)
    if (e) e.pinned = true
  }

  unpin(token: string): void {
    const e = this.entries.get(token)
    if (e) e.pinned = false
  }

  refreshExpiry(token: string): void {
    const e = this.entries.get(token)
    if (e) e.expiresAt = Date.now() + this.ttlMs
  }

  verify(
    token: string,
    who: { productId: string; scopeId: string; sessionId: string },
  ): CursorVerifyResult {
    const e = this.entries.get(token)
    if (!e) {
      return { ok: false, why: 'unknown', message: 'cursor unknown (restart or forged)' }
    }
    const b = e.binding
    if (
      b.productId !== who.productId ||
      b.scopeId !== who.scopeId ||
      b.sessionId !== who.sessionId
    ) {
      return { ok: false, why: 'mismatch', message: 'cursor bound to a different domain' }
    }
    if (Date.now() > e.expiresAt) {
      this.entries.delete(token)
      this.payloadBytes.delete(token)
      return { ok: false, why: 'expired', message: 'cursor expired' }
    }
    // 访问刷新 LRU 序
    this.entries.delete(token)
    this.entries.set(token, e)
    return { ok: true, binding: b }
  }

  totalPayloadBytes(): number {
    let n = 0
    for (const v of this.payloadBytes.values()) n += v
    return n
  }

  size(): number {
    return this.entries.size
  }

  private evictForInsert(incomingBytes: number): void {
    // 先清过期
    const now = Date.now()
    for (const [t, e] of this.entries) {
      if (now > e.expiresAt) {
        this.entries.delete(t)
        this.payloadBytes.delete(t)
      }
    }
    // LRU（Map 插入序 = 最旧在前）：未 pin 先淘，再 pinned（回调显式 reset）
    while (this.entries.size >= this.capacity || this.totalPayloadBytes() + incomingBytes > this.maxPayloadBytes) {
      const unpinned = [...this.entries.values()].filter(e => !e.pinned)
      const victim = unpinned[0] ?? this.entries.values().next().value
      if (!victim) break
      this.entries.delete(victim.token)
      this.payloadBytes.delete(victim.token)
      if (victim.pinned) {
        this.onActiveEvict?.(victim.token, victim.binding)
      }
    }
  }
}

/** 语义化构造：账本实例共用 invalidRequest 拒面（容量/TTL 由 limits 校验）。 */
export function assertLedgerConfig(capacity: number, ttlMs: number): void {
  if (capacity < 1 || ttlMs < 1) {
    throw new WebSessionError('invalidRequest', 'ledger capacity/ttl must be >= 1')
  }
}
