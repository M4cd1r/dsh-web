# Agent Note: dsh-usage sidebar usage panel

Status: implemented

## Problem

dsh web GUI 的侧边栏只展示插件入口（任务看板、SSH、技能中心），对每个已安装
provider 还剩多少订阅 / API 配额没有任何提示。dsh-usage 插件本就在宿主侧探测
每个已安装 provider 的余额 / 编程套餐端点并输出规范化 overview，但只渲染成设置
分区卡片（以及宠物气泡）——当天的配额状态始终藏在一次点击之后。

## Decision

在 `packages/dsh-usage` 内实现一个可折叠侧边栏面板，放在侧边栏插件区（技能中心
入口与工作区浏览器之间），默认展开，折叠状态按浏览器记忆（localStorage）。面板
渲染既有 loopback 围栏的 `/api/dsh-usage/overview` 文档：

- 编程套餐类 provider 渲染 5 小时 / 每周 / 每月配额进度条（每窗口已用百分比与
  重置时间）；
- 仅有余额的 provider 渲染「名称 + 剩余金额」行（左名称右金额，如 DeepSeek
  ¥12.34）；
- 没有程序化端点的 provider 渲染一行灰字说明；
- 展开且页面可见时每 60 秒重读一次 overview，并提供手动探测刷新。

切换行沿用家族共享的 `sidebar-entry-core` 模式（纯 DOM、MutationObserver
自愈、侧边栏内无 React 树）；面板紧随切换行之下，由跟随自愈的小型占位观察器
保持位置。宿主半区只新增一个配置键（`sidebarPanel`，默认 `true`），经分区设置行
的复选框暴露；浏览器半区通过同一 settings scope 即时挂载 / 卸载（插件自身的
`enabled` 开关同样约束它）。语义契约新增 `sidebar-panel` part 值，owner 为
`usage`。`/api/dsh-usage` 的 overview 与 refresh 路由同时接受 loopback 与
有效配对设备请求，与技能中心 / 宠物 / Git 图谱的围栏一致；未配对、被撤销或
未知的局域网设备仍返回 `403`。

## Architecture

- `src/core/sidebar-model.ts`：纯 `buildSidebarRows()` / `formatBalance()`，
  文案以回调注入；无 DOM 单测锁定。
- `src/client/sidebar-block.ts`：切换行 + 面板 DOM、轮询 / 刷新、折叠持久化；
  `src/client/sidebar.module.css` 承载入口与面板样式（宿主表面 token）。
- `src/client/index.ts` 在 settings scope 订阅（`enabled` 且 `sidebarPanel`）
  下挂载面板。
- `scripts/sync-shared.mjs` 为 `dsh-usage` 增加 `sidebar-entry-core.ts` 与
  `body-mutations.ts` 的同步副本消费者。
- `src/host/access.ts` 封装共享同步的 `pair-access.ts` 围栏，用量路由构造函数
  接收实时宿主 context。
- dsh-web-all 聚合包内联浏览器半区；其提交的 `lib/` 与
  `scripts/lib-artifact-fingerprints.json` 随同一 PR 更新。

## Alternatives considered

- 独立仓库 `dsh-usage-sidebar` 自带探测（最初方案）：用户决定否决——探测适配器
  与凭据处理已在 dsh-usage 中，第二个插件只会重复两者，而侧边栏面板只是同一份
  wire 文档的渲染面。
- 侧边栏家族区内挂 React 根：包体更重，且是左栏第一棵 React 树，对用户无可见
  收益；家族先例（task-board / ssh / skill-explorer）均为纯 DOM + 自愈占位。
- 扩展共享 `sidebar-entry-core` 挂载包装元素：会改动全部四个消费者的家族契约；
  面板作为兄弟节点由自己的占位观察器跟随，核心保持不动。
- 保持 overview/refresh 仅 loopback：否决，因为已配对的局域网浏览器会继续对面板
  所需的同一份个人账户文档收到 `403`。

## Consequences

- 每页侧边栏多一行 36 px 入口；面板仅在展开且可见时轮询，折叠或后台页面零轮询
  流量（宿主自身 60 秒探测周期不受影响）。
- 皮肤：块携带 `data-dsh-plugin="usage"`，part 为 `sidebar-entry`（行）与
  `sidebar-panel`（根）；竖屏移动端沿用既有规则整块隐藏。
- dsh-web-all 聚合包体增加约 30 kB；其 lib/ 产物与指纹同步刷新。
- `sidebarPanel` 默认 `true`，存量 profile 无需配置即显示面板；关闭后入口即时
  消失，设置分区不受影响。
- 远程访问不新增对 `dsh-remote-web-ui` 的依赖：没有其实时配对服务时，局域网请求
  与以前一样返回 `403`。