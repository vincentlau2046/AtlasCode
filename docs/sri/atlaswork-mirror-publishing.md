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
7. **0.1.125 镜像面状态**：就绪候用户动作（工件 `$CLAUDE_JOB_DIR/tmp/mirror-0125/atlaswork-atlascode-0.1.125.tgz` 3,943,006B sha256 `e16c4bc8…`，仅 name 1 行差、内面 cli.js `4f75289b…` 恒等；源 tgz sha256 `66c20565…`=SRI v0.1.125 逐字）。发布后补双面对表 + round-trip 核验。
