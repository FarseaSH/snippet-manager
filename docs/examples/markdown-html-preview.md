---
snippet_name: Markdown 内嵌 HTML 预览测试
snippet_tags: [markdown, html, 预览, 开发测试]
---

验证 Markdown 中 HTML 代码块的独立预览。默认显示预览，「预览」按钮激活时呈淡橙色；点击关闭后查看代码，再次点击恢复预览。切换时保留交互，点击「重新运行」恢复初始状态。

# 文档中的 HTML 示例

````markdown
# 在文档里体验 HTML

每个 HTML 代码块都是独立页面。可以复制代码单独使用，无需引用其它 Tab。

## 1. 带样式的卡片

支持 HTML 片段及内联样式，预览样式不会改变外面的文档。

```html
<style>
  body { margin: 0; padding: 20px; font-family: system-ui, sans-serif; }
  .card { padding: 24px; border: 1px solid #e6eaf0; border-radius: 12px; background: #fff7ed; }
  h2 { margin: 0 0 8px; color: #c2410c; }
  p { margin: 0; color: #6f7987; }
</style>
<article class="card">
  <h2>你好，HTML</h2>
  <p>这是 Markdown 中一个可以独立预览的代码块。</p>
</article>
```

## 2. 可以点击的计数器

点击后切回代码、再次预览或进入全屏，计数应保持；重新运行后回到零。

```html
<style>
  body { padding: 20px; font-family: system-ui, sans-serif; }
  button { padding: 10px 18px; border: 0; border-radius: 8px; background: #c2410c; color: #fff; font: inherit; cursor: pointer; }
</style>
<button id="counter" type="button">点击次数：0</button>
<script>
  const button = document.querySelector('#counter');
  let count = 0;
  button.addEventListener('click', () => {
    button.textContent = `点击次数：${++count}`;
  });
</script>
```

## 3. 完整文档与自适应高度

也支持完整 HTML 文档。点击展开后，预览达到高度上限，内部可以滚动；全屏可获得更多空间。

```html5
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>文档与高度测试</title>
    <style>
      body { margin: 0; padding: 20px; font-family: system-ui, sans-serif; }
      #details { height: 800px; padding: 20px; background: linear-gradient(#fff7ed, #e6eaf0); }
    </style>
  </head>
  <body>
    <h2>完整 HTML 文档</h2>
    <button type="button" onclick="document.querySelector('#details').hidden = !document.querySelector('#details').hidden">展开 / 收起内容</button>
    <section id="details" hidden>这是一段较长的预览内容。</section>
  </body>
</html>
```

## 普通代码与原始 HTML

其它语言继续显示代码，不提供 HTML 预览。

```js
console.log('这是普通 JavaScript 代码块');
```

以下原始 HTML 仍按文字展示：

<strong>不会自动渲染为加粗内容</strong>
````

# 本地引用边界

这个 Tab 专门验证错误提示：预览不会读取其它代码块、Tab 或 snippet 的文件。

````md
# 独立资源边界

此例会提示不支持本地资源。将样式写入当前块的 `<style>` 即可；完整的远程 CDN 地址也可以使用。

```htm
<link rel="stylesheet" href="./style.css">
<p>不会引用旁边 CSS 代码块的内容。</p>
```

```css
p { color: red; }
```
````
