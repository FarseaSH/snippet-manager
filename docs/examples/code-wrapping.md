---
snippet_name: 自动换行与行号测试
snippet_tags: [编辑器, Markdown, 换行, UI测试]
---

在任意代码框开启自动换行，检查所有 snippet、子 Tab、转换输入/输出和 Markdown 内嵌代码块一起同步，新代码块也沿用当前状态。长行只显示一次行号、空行正常编号，原文复制不增加换行；切换 snippet、放大和恢复保留全局状态，刷新后恢复关闭。

# 普通代码

```js
const message = "你好，World。这是一条很长的代码，用于检查自动换行后中文、English、标点和空格能否在正文区域内自然折行，而行号依旧只对应原始代码行。This is a long line for checking wrapping, selection, and copying without changing the original source.";
const url = "https://example.com/very_long_path_without_any_whitespace_abcdefghijklmnopqrstuvwxyz_abcdefghijklmnopqrstuvwxyz_abcdefghijklmnopqrstuvwxyz_abcdefghijklmnopqrstuvwxyz_abcdefghijklmnopqrstuvwxyz_abcdefghijklmnopqrstuvwxyz";

	console.log(message, url);
```

# Markdown 代码块

````markdown
## 共享全局状态的代码块开关

```js
const message = "中文与 English mixed together: try selecting this long line after enabling wrapping, then copy it and confirm the original source still contains a single logical line. 这一行还用于检查软换行处不出现回车标记，只有真正的换行才显示标记。";

	console.log(message);
```

```text
another_code_block_with_a_very_long_unbroken_value_abcdefghijklmnopqrstuvwxyz_abcdefghijklmnopqrstuvwxyz_abcdefghijklmnopqrstuvwxyz_abcdefghijklmnopqrstuvwxyz_abcdefghijklmnopqrstuvwxyz_abcdefghijklmnopqrstuvwxyz
```

HTML 块在源码模式提供自动换行按钮，实际预览保留原有交互。

```html
<p>这是一段很长的 HTML 文本。切换至源码后开启自动换行，检查文字与行号的位置；再切换回预览，验证按钮隐藏且预览内容继续正常显示。This HTML block has a long source line for checking the wrapping toggle.</p>
```
````
