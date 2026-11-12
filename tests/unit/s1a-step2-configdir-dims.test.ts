/**
 * 0.1.99 S1a 步 2 判别格四格套件（工单 docs/2026-11-12-p0-wave-0199-s1a-step2-ticket.md
 * §7 lock-face 定谳形：判据三格升四格 + env 四层次序钉死 + 倒置惰性 getter 形）：
 *
 *   ① atlascode 默认恒等格（硬判据）：product.configDirName undefined + provider
 *      未注入/注入读 undefined → getConfigDirName 恒 '.atlas'（行为字节级不变）。
 *   ② product 层判别格（步 2 核心维度直判）：注入 configDirName='.atlas-office'
 *      的 provider → getConfigDirName 返回同值（office 真注册缺位下 provider 槽
 *      = 测试注入口，lock-face 吸收③）。
 *   ③ env 优先序格（四层钉死）：ATLAS_CONFIG_DIR > ATLAS_CONFIG_DIR_NAME >
 *      product.configDirName > '.atlas'——显式用户意图恒压部署期产品默认，
 *      两两相邻层逐对判。
 *   ④ office 目录探针隔离格（0.1.98 §8 顺延项兑现）：product 层生效下完整配置
 *      路径 = ~/.atlas-office ≠ ~/.atlas，两路径互不写穿（join 语义形式判据，
 *      真盘探针面归 e2e）。
 *
 * provider 槽为进程级单槽——每用例 try/finally resetConfigDirNameProvider +
 * env save/restore（mock.module 跨用例泄漏同族守）。
 */
import { describe, test, expect } from 'bun:test'
import { homedir } from 'os'
import { join } from 'path'
import {
  getConfigDirName,
  getConfigDirNameForProject,
  setConfigDirNameProvider,
  resetConfigDirNameProvider,
  getActiveProductDefinition,
} from '../../src/shared'

/** env 双键 save/restore + provider 复位围栏。 */
function withEnv(
  env: { ATLAS_CONFIG_DIR?: string; ATLAS_CONFIG_DIR_NAME?: string },
  fn: () => void,
): void {
  const prevDir = process.env.ATLAS_CONFIG_DIR
  const prevName = process.env.ATLAS_CONFIG_DIR_NAME
  try {
    if (env.ATLAS_CONFIG_DIR === undefined) delete process.env.ATLAS_CONFIG_DIR
    else process.env.ATLAS_CONFIG_DIR = env.ATLAS_CONFIG_DIR
    if (env.ATLAS_CONFIG_DIR_NAME === undefined)
      delete process.env.ATLAS_CONFIG_DIR_NAME
    else process.env.ATLAS_CONFIG_DIR_NAME = env.ATLAS_CONFIG_DIR_NAME
    fn()
  } finally {
    if (prevDir === undefined) delete process.env.ATLAS_CONFIG_DIR
    else process.env.ATLAS_CONFIG_DIR = prevDir
    if (prevName === undefined) delete process.env.ATLAS_CONFIG_DIR_NAME
    else process.env.ATLAS_CONFIG_DIR_NAME = prevName
    resetConfigDirNameProvider()
  }
}

describe('configDirName 维度激活（0.1.99 S1a 步 2，判别格四格）', () => {
  test('① atlascode 默认恒等格：provider 未注入 / 读 undefined → 恒 .atlas', () => {
    withEnv({}, () => {
      expect(getConfigDirName()).toBe('.atlas')
      // provider 注入但活跃产品读出 undefined（atlascode 缺省形）→ 恒等不破
      setConfigDirNameProvider(
        () => getActiveProductDefinition().configDirName,
      )
      expect(getConfigDirName()).toBe('.atlas')
      // provider 返回空串 = 无此层（falsy 短路），同降级语义
      setConfigDirNameProvider(() => '')
      expect(getConfigDirName()).toBe('.atlas')
    })
  })

  test("② product 层判别格：注入 '.atlas-office' → getConfigDirName 同值", () => {
    withEnv({}, () => {
      setConfigDirNameProvider(() => '.atlas-office')
      expect(getConfigDirName()).toBe('.atlas-office')
    })
  })

  test('③ env 优先序格：四层两两相邻逐对判（显式恒压产品默认）+ 双出口各验', () => {
    // L1 > L2：ATLAS_CONFIG_DIR 压 ATLAS_CONFIG_DIR_NAME（仅 homedir 锚出口）
    withEnv(
      { ATLAS_CONFIG_DIR: '/explicit/dir', ATLAS_CONFIG_DIR_NAME: 'name-dir' },
      () => {
        expect(getConfigDirName()).toBe('/explicit/dir')
        // row F：L1 对项目根锚出口恒不可见（剥离格主判，此处相邻序复证）
        expect(getConfigDirNameForProject()).toBe('name-dir')
      },
    )
    // L2 > L3：NAME 压 product 默认（双出口同序）
    withEnv({ ATLAS_CONFIG_DIR_NAME: 'name-dir' }, () => {
      setConfigDirNameProvider(() => '.atlas-office')
      expect(getConfigDirName()).toBe('name-dir')
      expect(getConfigDirNameForProject()).toBe('name-dir')
    })
    // L3 > L4：product 默认压缺省（双出口同序）
    withEnv({}, () => {
      setConfigDirNameProvider(() => '.atlas-office')
      expect(getConfigDirName()).toBe('.atlas-office')
      expect(getConfigDirNameForProject()).toBe('.atlas-office')
    })
    // L4：全空缺省（双出口同值）
    withEnv({}, () => {
      expect(getConfigDirName()).toBe('.atlas')
      expect(getConfigDirNameForProject()).toBe('.atlas')
    })
    // ForProject 三层序相邻复证（L2 > L3 > L4 已上，L1 剥离细判归 ⑤）
  })

  test("⑤ ForProject L1 剥离格：ATLAS_CONFIG_DIR 全路径对项目根锚出口恒不可见", () => {
    withEnv({ ATLAS_CONFIG_DIR: '/explicit/user/dir' }, () => {
      // homedir 锚出口吃 L1 全路径
      expect(getConfigDirName()).toBe('/explicit/user/dir')
      // 项目根锚出口剥 L1：继续走 NAME > product > '.atlas'
      setConfigDirNameProvider(() => '.atlas-office')
      expect(getConfigDirNameForProject()).toBe('.atlas-office')
      setConfigDirNameProvider(() => undefined)
      expect(getConfigDirNameForProject()).toBe('.atlas')
    })
    // NAME 亦压于 product（ForProject 自身层序完整）
    withEnv(
      { ATLAS_CONFIG_DIR: '/explicit/user/dir', ATLAS_CONFIG_DIR_NAME: 'name-dir' },
      () => {
        setConfigDirNameProvider(() => '.atlas-office')
        expect(getConfigDirNameForProject()).toBe('name-dir')
      },
    )
  })

  test('⑥ 两出口同值恒等格：L1 未设时 getConfigDirName ≡ ForProject（行为字节级不变判据）', () => {
    // 四种 L3/L4 组合下恒等（L1/L2 对两出口同值无分支差——L2 两出口同读）
    const productValues: Array<string | undefined> = [
      undefined,
      '',
      '.atlas-office',
    ]
    for (const pv of productValues) {
      withEnv({}, () => {
        setConfigDirNameProvider(() => pv)
        expect(getConfigDirNameForProject()).toBe(getConfigDirName())
      })
      withEnv({ ATLAS_CONFIG_DIR_NAME: 'name-dir' }, () => {
        setConfigDirNameProvider(() => pv)
        expect(getConfigDirNameForProject()).toBe(getConfigDirName())
      })
    }
  })

  test('④ office 目录探针隔离格：.atlas-office 与 .atlas 完整路径互斥（零写穿形式判据）', () => {
    withEnv({}, () => {
      setConfigDirNameProvider(() => '.atlas-office')
      const officePath = join(homedir(), getConfigDirName())
      const defaultPath = join(homedir(), '.atlas')
      expect(officePath).toBe(join(homedir(), '.atlas-office'))
      expect(officePath).not.toBe(defaultPath)
      expect(officePath.startsWith(defaultPath + '/')).toBe(false)
      expect(defaultPath.startsWith(officePath + '/')).toBe(false)
    })
  })
})
