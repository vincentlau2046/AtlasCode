# 0.1.97 CI 告警清零插入波工单（用户 2026-11-11 点名：清理 GitHub CI 告警，专门版本）

> 状态：`draft → 波前审视 → Atlas-reveiw 审计 → f4 双信号`。f4 工单（2026-11-11）。
> 上游：0.1.96 A1 五段闭环终态（工单 §17 @b2c16691）。
> 性质：**管道/基础设施波**——CI workflow + 发布 workflow 修形，**零产品代码面**（候选简化流程，先例 0.1.47 纯文本级零行为变更跳 gate；本波以「workflow 绿直证 + canon 净域」代 gate）。

---

## §0 波前审视（活码盘点 @ master b2c16691，f4 实核 2026-11-11）

### 0.1 告警画像（gh 实测 2026-11-11）

| 告警面 | 现状 | 量级 |
|---|---|---|
| CI workflow | **连续 30+ run 全 failure**（含 docs 提交也红） | 恒 4 fail / 5757 pass / 60 skip |
| Publish to npm workflow | tag 触发即 failure（v0.1.96 触发实据） | 每次推 tag 必红 |

 Dependabot alerts 已停用（无此项）；安全告警 API 404（未启用）——用户所见「大量告警」= 上述两 workflow 红叉面。

### 0.2 根因（f4 定因，本地复现 + CI log 直证）

**R-A：CI workflow env 偏离冻结 canon 口径**。canon（0.1.95 §10 冻结）= `FORCE_COLOR=3 CI=true bun test --isolate ./tests/`；ci.yml:34 实跑 `bun test --isolate tests/` **缺 FORCE_COLOR=3**（CI=true 由 runner 自动注入）。4 支失败全为环境性、本地 canon 全绿（f4 实跑两文件 30/30 PASS）：

1. **D4 裸色名根修 ×3**（tests/unit/colorize-d4.test.ts）：断言 SGR 序列在场——无 FORCE_COLOR 时 colorize 管线不突变 → 测试环境依赖（0.1.87 已登记「D4 裸色名族环境序 flake」即此根因，当时未根修）。
2. **sandbox 纵切 smoke ③**（tests/func/sandbox-smoke.test.ts:113-145）：断言 `config.ripgrep.command === "rg"`——CI runner **无系统 rg**（同文件 ④ 自证：「rg 缺失按 skip 不红（CI 无 rg 环境）」= 本套件已注册纪律，③ 违反本套件纪律缺同款 skip 门）。

**R-B：Publish workflow OIDC 断链（ENEEDAUTH 直证）**。publish 步 `npm publish --access public --provenance` 报 `ENEEDAUTH`——**node-version 20 → npm 10 不支持 OIDC trusted publishing**（须 npm ≥11.5.1）；workflow 头注设计 = OIDC 免密主通道（#197），从未成功过 → 每次推 tag 必红；0.1.96 实发布走本地 fallback（~/.npmrc token，§8.74.31 容灾面）。附带：本 workflow 若修好，将与本地发布形成同版本双通道 409 冲突面——**发布主通道定谳为必答点**（见 §1.3）。

### 0.3 f4 审视自决

1. 本波零产品代码：ci.yml + publish.yml 两文件 + （可资）npm 侧 trusted publisher 配置核验（须 repo admin 在 npm 后台确认——非会话内可验，列为验证腿）。
2. D4/sandbox ③ 修形取 workflow 侧对齐 canon（装 rg + FORCE_COLOR=3），**不动测试文件**——理由：canon 口径冻结是判读事实源，CI 偏离 canon 是 CI 侧缺陷非测试缺陷；测试侧补 skip 门会弱化本地判别力（③ 的 rg 断言在 rg 在场环境有真值）。备选（测试 skip 门）登记否决理由。
3. 版本 0.1.97；零产品行为 → 候选简化流程（candis 简化先例 0.1.47）：四件套本地照跑 + workflow 绿直证替代 e2e gate 全套；发布链 SRI 对表照旧不豁免。

## §1 波定义与工作段

- **波名**：CI 告警清零插入波。**版本**：0.1.97。
- **范围**：① ci.yml env 对齐 canon + rg 安装腿；② publish.yml npm/node 版本修形 + OIDC 验证；③ 发布主通道定谳（lock-face 必答）。
- **非目标**：测试文件改动（D4/sandbox ③ 测试本体不动）、产品代码、Dependabot 启用（另行呈用户，不属「清零」范围）。

### 段 W：workflow 修形（Main 落码）

1. **ci.yml**：test 步 `env: FORCE_COLOR: "3"`（CI=true runner 自带）；前置步装 ripgrep（`sudo apt-get install -y ripgrep` 或等效，runner ubuntu-latest）——修后判据 = CI run 全绿（含 docs-only 提交）。
2. **publish.yml**：node-version 20→24（npm 11 内载 ≥11.5.1 OIDC 支持；或显式 `npm i -g npm@latest`，Main 裁择）；其余不动。
3. **发布主通道定谳（lock-face 呈批，f4 预判）**：OIDC workflow 修通后 = **主通道**（供应链 attestation + provenance 价值面 + runner 直连免本地网络依赖），本地 ~/.npmrc 降应急 fallback（与 workflow 头注设计一致）；Main release 链改为「push tag → workflow publish → SRI 对表取 workflow run 产物值」；同版本双发 409 面以「单通道活、另通道仅灾备」消除。若 npm 侧 trusted publisher 未配置（验证腿发现），主通道定谳顺延、先修配置（repo admin 操作面，呈用户）。

### 段 V：验证（e2e/简化面）

- workflow 绿直证：① CI 全绿 run（任一后续 push 触发）；② publish 通道验证 = 下一次真实 release（0.1.97 段 L）走主通道 + SRI 四值对表照旧；③ 若 0.1.97 本身由 workflow 发布 = OIDC 通道真实验证一并完成。

## §2 Global Constraints

1. 零产品代码；ci.yml/publish.yml 改动最小面（diff 可逐行审）。
2. canon 口径不冻结变更——CI 向 canon 对齐，反向禁（改 canon 就 CI 属口径漂移，禁）。
3. 发布链 SRI 四值对表 + f4 复核不豁免（无论主通道谁）。
4. row F 预注册；Atlas-reveiw 波前审计。

## §3 Review Focus（Atlas-reveiw 审计建议焦点）

1. R-A 定因证据链：4 支失败全部环境性归因是否充分（本地 30/30 直证 + ④ skip 注记自证 rg 缺失事实）。
2. 装 rg 对 CI 时长/稳定性影响面（apt 安装秒级，无锁面风险）；FORCE_COLOR=3 是否引入他测试环境敏感（canon 本地全绿 = 已覆盖面）。
3. 发布主通道定谳的 409 竞态面与单通道纪律是否闭环（含 tag 触发时序：tag push → workflow 跑 → 期间禁本地 publish 的操作序）。
4. node 24/npm 11 升级的兼容面（build 步 bun 独立于 node，预期零影响）。
5. 简化流程适用性：本波「workflow 绿直证」能否替代 e2e gate 全套（f4 预判可，0.1.47 先例）。

## §4 流程

本工单 → Atlas-reveiw 审计 → f4 双信号 → Main 段 W 落码（+lock-face 定谳发布主通道）→ 段 V 验证 → 0.1.97 release（发布主通道首用）→ SRI 对表 → 收口。row F 全程。

## §5 Atlas-reveiw 审计闭环（2026-11-11，有修改通过）+ f4 修订吸收

审计锚全实锚（ci.yml 无 FORCE_COLOR / publish.yml node 20 + OIDC 头注 / ③ rg 断言 + ④ skip 注记 / colorize-d4 3 支环境依赖形）。必改 0、建议吸收 4，均判据/操作序面，吸收后直接双信号：

1. **【吸收①】修后首绿判据防假绿**：CI 首绿 run 须显式核 D4×3 + sandbox ③ 为 **PASS 非 skip**（装 rg 后 ③ 走真断言；若 resolver 行为使 ③ 意外 skip 须报 f4）——防「清零」变「静默化」。
2. **【吸收③】409 面收紧——幂等守已在位**：publish.yml 发布前 `npm view @$V` 命中即 no-op 跳过（审计实读发现，工单高估冲突面）；409 实际单向（workflow 先发、本地后发）。**定谳形收紧 = 串行 fallback 纪律**：主通道 workflow 采认（provenance + 免本地网络 + 头注本意，f4 预判认可）；本地 publish 仅在 workflow run 终态失败后启动（禁并发）；tag 时序操作序入 lock-face（push tag → 等 workflow 终态 → 失败才本地）。concurrency group `npm-publish` 串行已保证多 tag。
3. **【吸收⑤】主通道首用前置腿显式化**：0.1.97 发布走主通道 **以 npm 侧 trusted publisher 配置确认为前置腿**（repo admin 操作面非会话内可验）；未确认则 0.1.97 仍走本地通道发布（workflow 修形照落、不作主通道首用），首用顺延下版——防「发布卡未验通道」与「清零波自己出红发布」双败。
4. **【吸收②注记】低险注记采认**：runner passwordless sudo 直用 apt；③ 仅断言 command==="rg" 版本差无判别影响；CI 装系统 rg 与 0.1.44 根修设计同向（system rg 优先正是达真值条件）；node 24 固定大版本即可不必 pin 小版本。

f4 修订后判据面终形：修后 CI 首绿（D4×3 + ③ PASS 非 skip 显式核）+ 0.1.97 release SRI 四值对表不豁免 + 主通道首用以 trusted publisher 配置确认为条件（否则本地通道，首用顺延）。

## §6 f4 裁处：段 V row F 修订批准——Install ripgrep 双腿形（2026-11-11，@e851eb77 CI run 43043441803）

**定因采信**：apt 步 `Temporary failure resolving 'azure.archive.ubuntu.com'` 两 run 相隔 30 分钟同错（非瞬时）+ 同 run npm/github 全可达（bun install 绿）= runner 对 ubuntu apt 镜像持续网络故障面，修形逻辑无缺陷。

**修订批准：Install ripgrep 双腿形**，附带条件两条（硬）：
1. **版本 + sha256 双 pin**：BurntSushi/ripgrep 14.1.1 musl tarball URL 固定 + Main 落码时实算 sha256 钉入 workflow 注释 + `echo` 校验步（SRI 纪律同族——外部二进制入 CI 供应链面可审计；ripgrep release 无官方 checksum，自算一次钉死）。
2. **腿选择可见性**：两腿均 echo 实际采用腿（`rg-leg: apt` / `rg-leg: gh-release-static`）——CI log 判读可直证哪腿供 rg，防 fallback 静默生效判读混淆。

判据面不变（rg 在 PATH + ③ PASS 非 skip + 腿可见）。批准后落码复跑 CI。

## §7 f4 裁处：段 V 首绿采认 + publish.yml 挂起令（2026-11-11，@911fa880 CI run 43045532927）

**段 V 判据全满足采认**：CI 首绿 success（5772 pass / 49 skip / 0 fail，466 files）；判据显式核三点实锚——① D4×3 SGR 真在场 PASS 非 skip（FORCE_COLOR=3 口径根修实证）；② sandbox ①-④ 全 PASS，④ ripgrep 真查询 12.82ms 真跑非 skip（rg 功能直证）；③ 腿可见 `rg-leg: gh-release-static` + ripgrep 14.1.1 rev 直证 + sha256 校验过（apt 腿 3 重试仍 DNS 挂 → fallback 接管，双腿形设计生效，apt 镜像故障实锤入档）。

**publish.yml 挂起令（吸收⑤延伸，清零自洽硬要求）**：OIDC 未配置下推 tag = publish 必 failure（ENEEDAUTH 确定性）——「等 workflow 终态失败再本地发布」每次 tag 产红 run，与清零目标自破。裁定：**tag push 前 `gh workflow disable "Publish to npm"`（或临时移除 tag 触发，Main 裁择，须可逆 + 头注注记挂起原因与恢复条件）**；0.1.97 直接本地通道发布，「等 workflow 终态」步跳过并记档挂起面；**恢复条件 = ④ trusted publisher 配置确认 → re-enable + 主通道首用（下版）**。挂起后 GitHub 告警面 = 真零。

release 链照走：bump 0.1.97 + CHANGELOG → release commit → tag v0.1.97 → 本地 npm publish → SRI 留档 → f4 复核收口。

## §8 f4 终局收口：0.1.97 CI 告警清零波五段闭环终态（2026-11-12，@e9f709cc）

**release + 挂起链全闭环采认**：release commit 680ccd9e（bump + CHANGELOG）+ tag v0.1.97 + tag push 无 publish run（挂起生效实证）+ npm publish 0.1.97 本地通道 + SRI 留档 docs/sri/v0.1.97.md（e9f709cc）。

**f4 独立对表（registry 直下重算，§16 先例口径）——四值全 MATCH**：

| 值 | 留档 | f4 重算 | 判定 |
|---|---|---|---|
| dist.shasum | 76253775d32959f9… | packument + tgz 直下 sha1 双面同值 | MATCH |
| dist.integrity | sha512-WuscqiV/5IPHK… | packument 同值 | MATCH |
| unpackedSize | 18,179,326 B | 18,179,326 B 精确字节 | MATCH |
| cli.js | 18,171,100 B / sha256 2a8c3634… | **发布品与 v0.1.96 gate 银行字节级同值 Δ=0 = 零产品代码波的最强实证**（三版连续恒等：2a8c3634…） | MATCH |

**波终态**：CI 红叉 30+ 连败 → 绿（run 43045532927，判据显式核 PASS 非 skip）；publish ENEEDAUTH 根修（node 24）+ workflow 挂起（恢复条件 = ④ trusted publisher 确认）；GitHub 告警面 = 真零。**执行面挂起项两项（呈用户）**：① npm trusted publisher 配置（下版 OIDC 主通道首用 + workflow enable）；② GitCode Atlaswork 填仓（Main lane 安全分类器拦 + f4 lane 分类器同拦——两 lane 均持用户一手裁定仍被拦，解除 = 用户自执行 `git push gitcode master --tags` 或加 permission 规则后任一 lane 补推）。

**登记注记**：row F 双腿形（apt 镜像 DNS 故障 → gh-release-static fallback + sha256 双 pin + 腿可见）为本波唯一计划外修形，已 §6 批复产档；apt 腿保留作主腿（重试 3×），GitHub releases 静态二进制作 fallback。
