# 快捷键（Keybindings）

> 内容事实源：`src/tui/keybindings/`（defaultBindings.ts / loadUserBindings.ts /
> schema.ts / reservedShortcuts.ts / template.ts）、`src/tui/commands/keybindings/`
> （/keybindings 命令）。

## 文件

- `~/.atlas/keybindings.json` — 用户自定义键位（文件缺失/非法不阻塞：回落到内置默认键位，
  仅 debug 日志提示）。必须含 `"bindings"` 数组，结构非法整体作废（fail-soft）。
- 文件被 watch：修改后自动生效，无需重启。

## 内置键位速查

完整默认表 = `/keybindings` 命令（TUI 内）或 `src/tui/keybindings/template.ts`
（生成 `~/.atlas/keybindings.json` 模板 + 各键 `$docs` 说明）。常用：

- `Esc` — 取消当前输入 / 打断流式输出（双击 Esc = 回退上一轮）
- `Ctrl+C` — 退出（输入中 = 清行，空行连按两次 = 退出；流式中 = 打断）
- `Tab` — 自动补全 / 工具名补全
- `↑/↓` — 输入历史
- 方向键 + `Ctrl+方向键` — 光标编辑（`/keybindings` 里按 context 分组查全量）

## 自定义示例

```jsonc
// ~/.atlas/keybindings.json
{
  "bindings": [
    {
      "key": "ctrl+k",
      "context": "global",
      "action": "some-action"
    }
  ]
}
```

- 保留键位（`reservedShortcuts.ts`）不可覆盖（系统/终端面冲突）。
- 非法块结构 → 该文件整体作废回落默认（不静默半生效）。
