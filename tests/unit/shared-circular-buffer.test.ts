/**
 * shared/circular-buffer 叶子单测（C1 叶子下沉，行为移植自旧仓 utils 口径）。
 *
 * unit 层纪律：无网络/无真实磁盘/无 PTY。纯类。
 */
import { describe, test, expect } from "bun:test"
import { CircularBuffer } from "../../src/shared"

describe("CircularBuffer", () => {
  test("未满：按序存取", () => {
    const buf = new CircularBuffer<number>(4)
    buf.add(1)
    buf.add(2)
    expect(buf.length()).toBe(2)
    expect(buf.toArray()).toEqual([1, 2])
  })

  test("满了：淘汰最旧", () => {
    const buf = new CircularBuffer<number>(3)
    buf.add(1)
    buf.add(2)
    buf.add(3)
    buf.add(4) // 淘汰 1
    expect(buf.length()).toBe(3)
    expect(buf.toArray()).toEqual([2, 3, 4])
  })

  test("getRecent 取最近 N（N > size 时返回全部）", () => {
    const buf = new CircularBuffer<number>(5)
    buf.add(1)
    buf.add(2)
    buf.add(3)
    expect(buf.getRecent(2)).toEqual([2, 3])
    expect(buf.getRecent(10)).toEqual([1, 2, 3])
    expect(buf.getRecent(0)).toEqual([])
  })

  test("getRecent 跨 ring 回绕（head 已回卷）", () => {
    const buf = new CircularBuffer<number>(3)
    buf.add(1)
    buf.add(2)
    buf.add(3)
    buf.add(4) // head 回绕到 1 位
    expect(buf.getRecent(2)).toEqual([3, 4])
  })

  test("addAll 批量（超容量淘汰最旧，保留满容量窗）", () => {
    const buf = new CircularBuffer<string>(4)
    buf.addAll(["a", "b", "c", "d", "e", "f"])
    expect(buf.toArray()).toEqual(["c", "d", "e", "f"])
    expect(buf.length()).toBe(4)
  })

  test("空 buffer：toArray 空 / getRecent 空", () => {
    const buf = new CircularBuffer<number>(3)
    expect(buf.toArray()).toEqual([])
    expect(buf.getRecent(1)).toEqual([])
    expect(buf.length()).toBe(0)
  })

  test("clear 重置", () => {
    const buf = new CircularBuffer<number>(3)
    buf.add(1)
    buf.add(2)
    buf.clear()
    expect(buf.length()).toBe(0)
    expect(buf.toArray()).toEqual([])
    // clear 后重新填充不串味
    buf.add(9)
    expect(buf.toArray()).toEqual([9])
  })
})
