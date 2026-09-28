/**
 * engine/skill 域 D 波 S-E2a unit 层（零盘零模型）：$ARGUMENTS 占位符
 * 替换族（src/engine/skill/argumentSubstitution.ts 逐字语义，shell-quote
 * 引号保留 + 失败回落空白切分 + 命名/索引/全参三形态 + 无占位符追加）。
 */
import { describe, expect, test } from 'bun:test'

import {
  generateProgressiveArgumentHint,
  parseArgumentNames,
  parseArguments,
  substituteArguments,
} from '../../src/engine/skill'

describe('parseArguments', () => {
  test('空白切分', () => {
    expect(parseArguments('foo bar baz')).toEqual(['foo', 'bar', 'baz'])
  })

  test('引号串保留整体（shell-quote 语义）', () => {
    expect(parseArguments('foo "hello world" baz')).toEqual([
      'foo',
      'hello world',
      'baz',
    ])
  })

  test('空串 → 空数组', () => {
    expect(parseArguments('')).toEqual([])
    expect(parseArguments('   ')).toEqual([])
  })

  test('未闭合引号：shell-quote 剥引号不抛（语义留痕）', () => {
    expect(parseArguments('foo "unterminated')).toEqual([
      'foo',
      'unterminated',
    ])
  })

  test('shell 操作符 token 过滤（仅留字符串 token）', () => {
    expect(parseArguments('foo > bar')).toEqual(['foo', 'bar'])
  })
})

describe('parseArgumentNames', () => {
  test('空格分隔字符串 / 数组双形态', () => {
    expect(parseArgumentNames('foo bar baz')).toEqual(['foo', 'bar', 'baz'])
    expect(parseArgumentNames(['foo', 'bar', 'baz'])).toEqual([
      'foo',
      'bar',
      'baz',
    ])
  })

  test('过滤空串与纯数字名（$0/$1 简写冲突）', () => {
    expect(parseArgumentNames(['foo', '', '12', 'bar'])).toEqual([
      'foo',
      'bar',
    ])
    expect(parseArgumentNames('  ')).toEqual([])
  })

  test('undefined → 空数组', () => {
    expect(parseArgumentNames(undefined)).toEqual([])
  })
})

describe('generateProgressiveArgumentHint', () => {
  test('剩余参数提示串', () => {
    expect(generateProgressiveArgumentHint(['a', 'b', 'c'], ['x'])).toBe(
      '[b] [c]',
    )
    expect(generateProgressiveArgumentHint(['a'], ['x', 'y'])).toBeUndefined()
  })
})

describe('substituteArguments', () => {
  test('$ARGUMENTS 全参串', () => {
    expect(substituteArguments('Args: $ARGUMENTS', 'a b')).toBe('Args: a b')
  })

  test('$ARGUMENTS[i] 索引参', () => {
    expect(substituteArguments('$ARGUMENTS[1] $ARGUMENTS[0]', 'a b')).toBe(
      'b a',
    )
    // 越界索引 → 空串
    expect(substituteArguments('$ARGUMENTS[5]', 'a')).toBe('')
  })

  test('$0/$1 简写索引参', () => {
    expect(substituteArguments('$1->$0', 'a b')).toBe('b->a')
  })

  test('命名参按位置映射（$name 不含 $nameXxx / $name[...]）', () => {
    expect(
      substituteArguments('$foo $bar', 'x y', true, ['foo', 'bar']),
    ).toBe('x y')
    // 未提供位置 → 空串
    expect(substituteArguments('$foo $bar', 'x', true, ['foo', 'bar'])).toBe(
      'x ',
    )
  })

  test('无占位符命中 + appendIfNoPlaceholder → 追加 ARGUMENTS 尾段', () => {
    expect(substituteArguments('body', 'a b')).toBe('body\n\nARGUMENTS: a b')
    expect(substituteArguments('body', 'a b', false)).toBe('body')
  })

  test('args 未提供（undefined/null）→ 原样返回', () => {
    expect(substituteArguments('$ARGUMENTS', undefined)).toBe('$ARGUMENTS')
    expect(substituteArguments('$ARGUMENTS', null)).toBe('$ARGUMENTS')
  })
})
