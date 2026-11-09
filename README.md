# Frontend Topics

一个持续积累的前端专题库：把可复现的问题、交互约定、原因和测试，与可复用的小组件放在一起。

这里的知识来自实际实现与验收。每条结论都标明它是必须保持的交互契约、特定条件下的建议，还是尚待验证的问题。新的案例优先补充已有专题，不重复堆叠项目规则。

## 从哪里开始

- 阅读 [专题索引](docs/topics/README.md)，按问题找原因、边界和验收场景。
- 查阅 [FAQ](docs/topics/faq.md)，定位滚动、搜索和异步导航中的常见误判。
- 使用 [日常阅读组件](packages/daily-ui/src/)，按 [适配器接口](docs/topics/component-adapters.md) 接入：可搜索选择器、独立日期导航，以及匹配函数和组件样式。
- 按 [同步与升级](docs/topics/vendor-updates.md) 将一个明确版本复制到消费者自己的静态目录。
- 用 [复盘模板](docs/templates/retrospective.md) 记录已证实结果、剩余问题和规则调整。

## 两个组件，清楚的边界

| 部件         | 负责                                               | 由消费者负责                                   |
| ------------ | -------------------------------------------------- | ---------------------------------------------- |
| 可搜索选择器 | 搜索草稿、候选匹配、键盘与指针选择、取消与清除     | 标签、候选数据、确认后如何读取内容、URL 与历史 |
| 日期导航     | 独立滚动、历史分页的加载状态、刷新期间的旧响应失效 | 数据读取回调、日期格式、点击后正文如何变化     |

组件是无运行时依赖的 ES module。消费者提供 DOM、文案与回调，并保留自己的业务适配器。组件源码位于 `packages/daily-ui/src/`，版本由 `packages/daily-ui/package.json` 维护；其具体导出和参数以源码 JSDoc 为准。

## 快速开始

需要 Node.js 20 或更新版本。先安装开发依赖并验证此仓库：

```sh
npm ci
npm test
npx playwright install chromium
npm run test:e2e
npm run format:check
```

可交互的虚构数据示例可直接启动：

```sh
node scripts/example-server.mjs
```

在浏览器打开 `http://127.0.0.1:4187/`。示例仅用于本地开发，使用一百位虚构候选和生成日期，不连接任何业务服务。

消费者在自己的仓库根目录显式创建 `frontend-vendor.json`：

```json
{
  "schemaVersion": 1,
  "bundle": "daily-ui",
  "destination": "public/vendor/daily-ui",
  "source": "https://github.com/Miss-you/frontend-topics"
}
```

在本仓库预览，再明确写入；两个消费者可一次规划：

```sh
node scripts/sync.mjs --target ../reader-a --target ../reader-b --preview
node scripts/sync.mjs --target ../reader-a --target ../reader-b --write --version 1.0.1
node scripts/sync.mjs --target ../reader-a --target ../reader-b --check
```

当前示例版本为 `1.0.1`，实际升级时需替换为准备使用的源码版本。同步后，消费者可运行自己的 `npm run frontend:check` 检查本地副本与清单，无需保留本仓库检出目录；它与来源对照检查的区别见 [同步与升级](docs/topics/vendor-updates.md)。浏览器从消费者自己的 `public/vendor/daily-ui/` 读取组件，不从本地其他仓库或 CDN 导入。同步工具不改业务适配器；接入与升级后仍需运行消费者的验收。

## 怎样持续积累

1. 先记录能复现的问题和影响，再解释原因。
2. 将能稳定复现的行为写成测试，把适用条件留在正文。
3. 同类问题补到原专题的 FAQ，只有机制不同才新增专题。
4. 复盘时检查哪些工作尚未完成，哪些规则需要提升、降级或删除。
5. 把项目特有信息留在消费者仓库；公开内容使用虚构数据与通用接口。

新增内容遵循 [贡献约定](CONTRIBUTING.md)，可从 [专题模板](docs/templates/topic.md) 开始。初次整理的范围与验收记录见 [首个专题复盘](docs/retrospectives/2026-11-01-first-topic.md)。

新增的 [本地文本工具与导航案例](docs/retrospectives/2026-11-09-local-text-tool.md) 记录了数据流约束、主题刷新导致的输入丢失，以及发布产物与手机模拟的验收边界；这是知识归档，没有新增组件导出。

## 许可

组件、示例和文档按仓库中的 MIT 许可证提供。引用外部资料时保留其来源，不将第三方截图、私有数据或完整原文混入示例。
