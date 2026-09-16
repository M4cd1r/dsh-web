# Agent Note: z.ai GLM coding plan support

Status: implemented

## Problem

dsh-usage 的套餐适配器只为 `zai-coding`（国际）与 `zai-coding-cn`（国内）两个
provider id 服务 GLM 编程计划，但 pi-ai provider 目录里国际站编程计划注册的 id
是 `zai`，运行时上报的也正是该 id。于是使用 z.ai 编程套餐的用户完全看不到套餐
数据：`adapterFor("zai")` 为 undefined，轮询跳过该路由，个人套餐页签、侧边栏面板
与宠物气泡全部保持沉默。旧解析器还把 `limits[]` 每一条都当作配额窗口——MCP 请求
上限（`TIME_LIMIT`）会以裸 `unit-5` 键渲染成伪窗口——而新积分制套餐的服务器取整
百分比掩盖了真实已用比例。

## Decision

GLM 编程计划适配器现在同时服务 `zai`（pi-ai 目录 id）、旧别名 `zai-coding` 与
`zai-coding-cn`，运行时上报的任何 z.ai 路由都解析到同一个适配器。解析器围绕共享的
`{host}/api/monitor/usage/quota/limit` 信封做了加固：

- 只有 `TOKENS_LIMIT`（token 制套餐）与 `CREDIT_LIMIT`（积分制套餐的改名桶）成为
  配额窗口；`TIME_LIMIT` MCP / 功能请求上限永不渲染；
- 窗口按未文档化的 `unit` 码映射到共享窗口词表（`5h` / `week` / `month`）——
  3（5 小时）、6（每周）、5（每月）；未知 unit 直接丢弃，而不是用无本地化键展示；
- 存在绝对值时（`currentValue` 消耗对 `usage` 配给，如积分制套餐），以精确已用
  占比替代服务器取整的 `percentage`；任何百分比仍收敛到 0-100；
- 包在 HTTP 200 内的失败信封（`success: false`）一如既往拒绝，不产生数据。

旧版仅 5 小时、现行 5 小时 + 每周与积分制套餐都由同一端点解析；套餐档位
（`data.level`）作为套餐名透出。测试覆盖乱序数组回归（窗口按 unit 而非位置识别）、
积分比例解析、旧版仅 5 小时、`TIME_LIMIT` / 未知 unit 跳过与失败信封；README
三件套记录路由 id 与套餐形态。交叉链接：适配器注册表源自 [用量统计插件 note](../../implemented/feature/2026-08-29-usage-statistics-plugin.md)，
由 [侧边栏用量面板 note](../../implemented/feature/2026-09-16-dsh-usage-sidebar-panel.md) 渲染。

## Alternatives considered

- 为 `zai` 单建适配器：端点、认证（原始 key，不带 Bearer 前缀）与解析与其余
  GLM 路由完全一致；维持同一适配器家族才能保证家族级回落（宠物气泡、消费分组）
  与 DeepSeek 家族的别名机制一致。
- 把 `TIME_LIMIT` MCP 上限渲染成 `month` 窗口：它是请求上限而非 token/积分配额
  窗口，未使用的上限会以误导性标签渲染成常驻 0% 进度条。
- 为未知窗口保留通用 `unit-N` 回落键：浏览器与设置分区字典没有这类标签，裸键会
  泄漏进 UI；直接丢弃未知窗口更安全。

## Consequences

- 已配置的 z.ai provider（路由 `zai`，key 经 `llm-pi-ai` profile 的 `apiKeyEnv`
  解析，如 `ZAI_API_KEY`）现在会探测其编程套餐配额，并在个人套餐页签、侧边栏面板
  与宠物气泡中渲染 5 小时与/或每周窗口；旧版、现行与积分制套餐均无需额外配置。
- `TIME_LIMIT` MCP 上限刻意不展示；此前它会在裸 `unit-5` 键下渲染成伪窗口。
- 无本地化改动：所有产出的窗口键（`5h`、`week`、`month`）已存在于 zh/en 字典与
  ru 语言包，`i18n:check` 保持通过。