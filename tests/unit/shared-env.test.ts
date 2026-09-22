/**
 * shared env 解析纯函数单测（B 波 S1）。
 *
 * unit 层纪律：无网络/无真实磁盘/无 PTY。纯函数 env 解析。
 */
import { describe, test, expect } from "bun:test"
import {
  parseBoolEnv,
  parseBoundedIntEnv,
  isEnvTruthy,
  isEnvDefinedFalsy,
} from "../../src/shared"

describe("parseBoolEnv", () => {
  test("undefined → false", () => {
    expect(parseBoolEnv(undefined)).toBe(false)
  })
  test('"1" → true', () => {
    expect(parseBoolEnv("1")).toBe(true)
  })
  test('"true" 大小写不敏感 → true', () => {
    expect(parseBoolEnv("true")).toBe(true)
    expect(parseBoolEnv("TRUE")).toBe(true)
    expect(parseBoolEnv("True")).toBe(true)
  })
  test("非真值 → false", () => {
    expect(parseBoolEnv("0")).toBe(false)
    expect(parseBoolEnv("false")).toBe(false)
    expect(parseBoolEnv("")).toBe(false)
    expect(parseBoolEnv("random")).toBe(false)
  })
})

describe("parseBoundedIntEnv", () => {
  test("undefined → defaultValue, status valid", () => {
    expect(parseBoundedIntEnv("X", undefined, 0, 100)).toEqual({
      effective: 0,
      status: "valid",
    })
  })
  test('"" → defaultValue, status valid', () => {
    expect(parseBoundedIntEnv("X", "", 75, 100)).toEqual({
      effective: 75,
      status: "valid",
    })
  })
  test("合法值 → parsed, status valid", () => {
    expect(parseBoundedIntEnv("X", "42", 0, 100)).toEqual({
      effective: 42,
      status: "valid",
    })
  })
  test("超上限 → cap, status capped", () => {
    expect(parseBoundedIntEnv("X", "999", 0, 100)).toEqual({
      effective: 100,
      status: "capped",
    })
  })
  test("负数/NaN → defaultValue, status invalid", () => {
    expect(parseBoundedIntEnv("X", "-5", 0, 100)).toEqual({
      effective: 0,
      status: "invalid",
    })
    expect(parseBoundedIntEnv("X", "abc", 0, 100)).toEqual({
      effective: 0,
      status: "invalid",
    })
  })
  test("0 是合法值（GLOB_TIMEOUT 不限时）", () => {
    expect(parseBoundedIntEnv("X", "0", 0, 1_800_000)).toEqual({
      effective: 0,
      status: "valid",
    })
  })
  test("min=1：0/负值 → invalid（timeout 类 env 语义，对齐旧仓 validateBoundedIntEnvVar）", () => {
    expect(parseBoundedIntEnv("X", "0", 120_000, 1_800_000, 1)).toEqual({
      effective: 120_000,
      status: "invalid",
    })
    expect(parseBoundedIntEnv("X", "-5", 120_000, 1_800_000, 1)).toEqual({
      effective: 120_000,
      status: "invalid",
    })
  })
  test("min=1 时合法正值与 cap 行为不变", () => {
    expect(parseBoundedIntEnv("X", "300", 120_000, 1_800_000, 1)).toEqual({
      effective: 300,
      status: "valid",
    })
    expect(parseBoundedIntEnv("X", "9999999", 120_000, 1_800_000, 1)).toEqual({
      effective: 1_800_000,
      status: "capped",
    })
  })
})

describe("isEnvTruthy（C1 布尔 env 单一事实源）", () => {
  test("真值集合", () => {
    for (const v of ["1", "true", "TRUE", "True", "yes", "YES", "on", " On "]) {
      expect(isEnvTruthy(v)).toBe(true)
    }
    expect(isEnvTruthy(true)).toBe(true)
  })
  test("假值/空/未设", () => {
    for (const v of ["0", "false", "no", "off", "", "random", undefined]) {
      expect(isEnvTruthy(v)).toBe(false)
    }
    expect(isEnvTruthy(false)).toBe(false)
  })
})

describe("isEnvDefinedFalsy（显式假值）", () => {
  test("显式假值集合", () => {
    for (const v of ["0", "false", "no", "off", "OFF"]) {
      expect(isEnvDefinedFalsy(v)).toBe(true)
    }
    expect(isEnvDefinedFalsy(false)).toBe(true)
  })
  test("未设/真值 → false（未设不算显式假）", () => {
    expect(isEnvDefinedFalsy(undefined)).toBe(false)
    for (const v of ["1", "true", "yes", "on"]) {
      expect(isEnvDefinedFalsy(v)).toBe(false)
    }
    expect(isEnvDefinedFalsy(true)).toBe(false)
  })
})
