/**
 * 段 L 呈批书 §3-1 预注册形（f4 批复 @63fc4615）：AtlasWeb 载体元数据。
 * 读 dist 两 web bundle（runtime / execution）算 sha256，写
 * dist/atlasweb-carrier.json——AtlasWeb 消费侧装配验真锚（镜像双发
 * 禁独立重建的机械判据面）。
 *
 * fail-closed：bundle 缺失 = 报错退出（须先跑对应 build 步），禁静默空值。
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dir, '..')
const BUNDLES = [
  { key: 'runtimeSha256', file: join('dist', 'web-session-runtime', 'index.js') },
  {
    key: 'executionSha256',
    file: join('dist', 'web-session-runtime-execution', 'index.js'),
  },
] as const

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  version: string
}
const carrier: Record<string, string> = { product: 'atlascode', version: pkg.version }
for (const { key, file } of BUNDLES) {
  const abs = join(ROOT, file)
  if (!existsSync(abs)) {
    console.error(
      `emit-atlasweb-carrier: ${file} missing — run the corresponding build step first`,
    )
    process.exit(1)
  }
  carrier[key] = createHash('sha256').update(readFileSync(abs)).digest('hex')
}
const out = join(ROOT, 'dist', 'atlasweb-carrier.json')
writeFileSync(out, JSON.stringify(carrier, null, 2) + '\n')
console.log(`atlasweb-carrier: ${join('dist', 'atlasweb-carrier.json')}`)
for (const [k, v] of Object.entries(carrier)) {
  console.log(`  ${k} = ${v}`)
}
