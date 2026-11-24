---
snippet_name: Markdown 快捷复制测试
snippet_tags: [Markdown, 复制, UI测试]
---

说明中的 `npm run dev` 支持 Ctrl / ⌘ 单击复制；按住修饰键时末尾显示橙色图标。可通过 `:@复制示例` 检查预览中的行内代码、代码块和 HTML 源码。

# 复制示例

按住 Ctrl（Mac 为 ⌘）后，代码块正文出现橙色遮罩。复制后检查工具栏反馈；切换 HTML 块到源码模式检查遮罩，实际 HTML 预览的按钮应正常交互。

````markdown
# 复制体验

行内代码 `hello  world`、`中文 & <tag>` 与普通[链接](https://example.com)。

```js
function hello(name) {
  console.log(`Hello, ${name}`);
}

hello("world");
```

> ```unknown-language
> nested code
>     indentation
> ```

```
plain text
```

```html
<button onclick="this.textContent = 'clicked'">Click me</button>
```
````
