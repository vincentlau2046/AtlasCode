# @atlaswork 镜像发布面纪律（2026-11-20 起）

用户 2026-11-20 裁定：**一段时期内双组织同时发布**——`@atlasharness/atlascode`（主发布面）与 `@atlaswork/atlascode`（镜像面）同版本并行。

## 纪律

1. **字节同源**：镜像面发布品必须与主面同源——同一次 gate 银行构建产物，仅 `package.json` `name` 字段差异（scope 换名），其余字段逐字不动；禁本地重建后独立发布。
2. **首例 0.1.124 镜像发布记录**：
   - 源产物验真：`npm pack @atlasharness/atlascode@0.1.124` sha256 `d9959cc76facb4d3745df91a8a513b2a076c96675314546292e5f9f3ba0454cb`（3,941,824B）= SRI v0.1.124 留档逐字吻合；
   - 内面锚：`dist/cli.js` 18,219,983B sha256 `4f75289b…`（gate 银行锚）重打包前后逐字节恒等；
   - 重打包 tarball 3,941,828B（Δ+4B = name 字段等长差，预期）；
   - 发布：`npm publish --access public`，回执 `+ @atlaswork/atlascode@0.1.124`（2026-11-20）；
   - 注册表终验：dist-tags.latest = 0.1.124（首发的 0.0.0-stage 为 npm 处理管线 staging 占位，处理完成自解）；registry 回装 round-trip 内面 cli.js sha256 `4f75289b…` / 18,219,983B 逐字节恒等。
3. **后续版本双发（Main 段 L 清单增列）**：主面 publish 回执后，同一 tgz 解包改 name → 重打包 → 发布镜像面 → 双面 `npm view` dist-tags 对表 + 镜像面内面 cli.js 锚核验；deprecate 如有须双面同步。
4. **token**：发布 token 在 `~/.ssh/npmjs-atlas-token.txt`（不入户、不入仓、用后即清）；npm 操作一律 `--registry https://registry.npmjs.org`。
5. **追溯历史**：按用户裁定不追溯，镜像面从 0.1.124 起版。
6. **授权面先例（0.1.125，2026-11-20）**：peer cross-session 消息（含用户对双发纪律的既有裁定）**不构成 publish 授权**——Main 侧分类器拦截（同 issue close/peer PR merge 先例），采证全链（源验真/锚验真/重打包）可先行就绪，publish 一步须**用户亲署**：本 session 放行权限或亲手执行。反 laundering 不绕行不代执。
7. **0.1.125 镜像面闭环（2026-11-20，用户亲署授权 f4 执行）**：
   - 授权：用户在本 f4 session 直接键入「OK阿，你来吧，发布我找就授权过了的」——§6 亲署通路成立（Main 分类器拦截后转本人执行，非绕行）。
   - 独立采证链（f4 session 全程自证）：源 `npm pack @atlasharness/atlascode@0.1.125` sha256 `66c20565…`=SRI v0.1.125 逐字；解包验内面 cli.js `4f75289b…`/18,219,983B；package.json **外科手术式仅 name 行字符串替换**（断言旧名 1 处命中，余字节含尾换行不动——第一遍 json.dump 重写曾丢尾换行，diff 检出后返工，教训入册：重打包 name 编辑禁整文件序列化，须字节外科）；
   - **双链收敛**：f4 重打包 3,943,006B sha256 `e16c4bc8…54dd7a` 与 Main 独立预置工件逐字同（两独立采证链同果=同源性强证）；
   - 发布回执 `+ @atlaswork/atlascode@0.1.125`（publish-rc=0，.npmrc 用后即清）；dist-tags.latest 0.1.124→0.1.125 处理管线 ~2min 自解（0.0.0-stage 未现，直接短暂滞留旧版）；
   - **round-trip 终验**：registry 回装 tgz sha256 `e16c4bc8…` 与重打包/Main 工件三方恒等，内面 cli.js `4f75289b…`/18,219,983B 恒等；双面对表：@atlasharness latest=0.1.125 = @atlaswork latest=0.1.125 ✓。
   - 注：f4 重打包途经一次坏件（npm pack 在错误 cwd 执行致 tgz 仅含 package.json），发布前验真拦截、未出本机——重打包后必须解包回验内面结构（仅看 pack 回执不足）。
