# 组件与业务适配器

组件源码和调用约定以 `packages/daily-ui/src/` 中的 JSDoc 为准。下述方法对应当前接口；升级时同时检查组件版本与变更说明。

## 可搜索选择器

从消费者自己的 vendor 目录导入 `createSearchableSelect`。在配置的 `elements: { ... }` 中传入六个元素引用：`root`、`input`、`popup`、`list`、`results`、`clearButton`。

| 配置                  | 含义                                                              |
| --------------------- | ----------------------------------------------------------------- |
| `onSelect(value)`     | 确认真实选项或清除后，值变化时通知页面；清除值是空字符串          |
| `labels`              | `all`、`empty`、`noResults`、`count(n)`、`unavailable` 等业务文案 |
| `formatOption(value)` | 候选与选中值的显示方式，例如为虚构作者加 `@`                      |
| `disableWhenEmpty`    | 没有候选且无已选值时是否禁用输入，由业务决定                      |

实例的 `setOptions(values, selected = '')` 更新候选与已选值，`getValue()` 读取已选值，`destroy()` 解除事件并取消组件后续动作。输入草稿不通过 `onSelect` 发出。

页面负责给输入关联可读标签，给列表唯一 `id`，并提供初始隐藏的弹层。结构中的 `.daily-ui-field`、`.daily-ui-clear`、`.daily-ui-popup` 与共享样式配合。实例会设置相应组件 data 属性与必要的候选 ARIA 状态。

## 日期导航

`createDateNavigation` 在配置的 `elements: { ... }` 中接受 `sidebar`、`scroller`、`list`、`moreButton`、`status`、`selectedDate`、`header`、`readingHeading` 等元素引用。这里的 `selectedDate` 是“当前阅读日期”提示元素，不是业务日期值。

| 配置                                  | 含义                                                               |
| ------------------------------------- | ------------------------------------------------------------------ |
| `loadPage({ scope, cursor, signal })` | 读取下一页的回调，返回 `{ items, nextCursor }`；消费者自行连接 API |
| `onSelect(date)`                      | 用户明确选择日期时，通知页面更新正文                               |
| `hrefForDate(date, scope)`            | 日期链接生成规则，URL 与历史策略继续归页面                         |
| `formatMeta(day)`                     | 日期项附加信息的业务格式                                           |
| `labels`                              | 加载、失败、耗尽、重试和当前日期等文案                             |

每个日期项至少提供稳定且唯一的字符串 `date`，它作为节点复用的 key；同一页和跨历史分页不得出现重复日期。其他字段由消费者自己定义并交给 `formatMeta` 读取。`scope` 是绑定分页游标的筛选范围，不是组件内置的某个 API 参数。

页面刷新导航的顺序如下；`readFirstPage` 是消费者自己的读取函数，示例不是共享组件提供的接口：

```js
const token = navigation.beginRefresh(scope);
try {
  const page = await readFirstPage(scope);
  navigation.commitRefresh(token, page, currentDate);
} catch (error) {
  if (navigation.failRefresh(token)) showReadError(error);
}
```

`setSelectedDate(date)` 只更新选中提示。`revealReading()` 将已滚出视口上方的阅读标题带回导航下方。`getState()` 提供当前导航状态用于观察，`destroy()` 失效未完成工作并解除事件与测量监听。

页面还需为正文响应单独做有效性校验。导航 token 保护日期分页，不能自动保护页面自己的摘要、来源弹窗或其他异步请求。

## 样式与生命周期

加载共享 `daily-ui.css`，通过 `--daily-ui-accent` 等组件变量映射现有视觉 token。共享选择器以组件 data 属性为边界，不要求覆盖全站 input、a 或页面布局。

组件初始化一次，在页面或挂载区域销毁时调用 `destroy()`；不要每次正文刷新都重新绑定一组全局监听。移动断点、弹层与真实输入方式仍需在消费者页面验收。

关联 [可搜索选择器](searchable-selection.md)、[异步导航状态](async-navigation.md)、[同步与升级](vendor-updates.md)。
