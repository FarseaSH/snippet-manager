---
snippet_name: HTML 多文件预览
snippet_tags: [html, css, javascript, 预览, demo]
---

一个可以直接保存为文件的网页示例。`:@index.html` 引用同组的 `:@assets/style.css` 和 `:@assets/main.js`；切到其他 Tab 再回来，计数保持。修改参数后等待约 500ms，或点击“重新运行”，页面会重新初始化。

# index.html

HTML 默认预览，底栏可查看原始源代码。将每个 Tab 保存成同名文件即可在普通静态服务器中使用。

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>交互卡片</title>
  <link rel="stylesheet" href="./assets/style.css">
</head>
<body>
  <main class="card">
    <span class="eyebrow">HTML · CSS · JavaScript</span>
    <h1>你好，@name:text:Snippet Manager@</h1>
    <p>样式和脚本来自同组文件，页面可以直接交互。</p>
    <button id="counter" type="button">加载中…</button>
    <p class="hint">切换 Tab 后再回来，试试计数是否保留。</p>
  </main>
  <script type="module" src="./assets/main.js"></script>
</body>
</html>
```

# assets/theme.css

这是由主样式通过标准 CSS `@import` 引用的主题。修改颜色参数后，返回 HTML 即可看到更新。

```css
:root {
  --accent: @accent:text:#c2410c@;
  --ink: #27272a;
}
```

# assets/style.css

相对引用以当前 CSS 文件所在目录为起点。

```css
@import "./theme.css";

* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 36px 24px;
  background: #ffffff;
  color: var(--ink);
  font: 15px/1.7 system-ui, sans-serif;
}
.card { max-width: 520px; margin: 0 auto; padding: 28px; border: 1px solid #e6eaf0; border-radius: 16px; }
.eyebrow { color: var(--accent); font: 12px ui-monospace, monospace; }
h1 { margin: 12px 0; font-size: 25px; line-height: 1.4; }
button { padding: 10px 18px; border: 0; border-radius: 8px; background: var(--accent); color: white; cursor: pointer; font: inherit; }
.hint { color: #71717a; font-size: 12px; }
```

# assets/math.js

这是可复用的 ES 模块，也支持用固定字符串路径进行动态 `import()`。

```js
export const increment = value => value + 1;
```

# assets/main.js

模块使用标准相对导入。默认计数按当前 Tab 的参数替换。

```js
import { increment } from './math.js';

let count = @start:number:0@;
const button = document.querySelector('#counter');
const render = () => { button.textContent = `点击次数：${count}`; };
button.addEventListener('click', () => { count = increment(count); render(); });
render();
```

# second.html

另一个独立页面，内联样式、脚本也正常运行。两个 HTML Tab 各自保留交互状态。

```html
<!doctype html>
<html lang="zh-CN">
<meta charset="UTF-8">
<style>
  body { padding: 24px; font: 16px system-ui, sans-serif; }
  input { padding: 8px 12px; border: 1px solid #6f7987; border-radius: 6px; }
</style>
<h1>独立的第二页</h1>
<label>留言 <input placeholder="切换 Tab 后内容保持"></label>
</html>
```

# cdn.html

这个页面直接加载远程 CDN，需要网络；外部资源不进入应用的离线预缓存，加载失败会显示提示。

```html
<!doctype html>
<html lang="zh-CN">
<meta charset="UTF-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
<main class="container py-4">
  <h1>CDN 示例</h1>
  <p id="result">正在加载 lodash…</p>
</main>
<script src="https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js"></script>
<script>
  document.querySelector('#result').textContent = _.join(['标准 HTML', '远程 CDN', '直接运行'], ' · ');
</script>
</html>
```
