---
snippet_name: Markdown 代码选区测试
snippet_tags: [Markdown, 选区, UI测试]
---

拖选预览里的代码，检查淡橙色选区、原有语法颜色及空格、Tab、换行的隐约标记。下面代码混合了真实 Tab、四个空格缩进、中文和空行。选区应贴合字符，行尾不铺满；复制后应保留原始空白，不含装饰标记。

# 选区示例

````markdown
## 混合缩进与空行

```js
function greet(name) {
	const message = `你好，${name}`;
	console.log(message);

    return message;
}

greet("World");
```

拖选代码后点击正文空白处，检查选区清理。也可以跨正文和下方代码块选择，并用 Ctrl / ⌘ + C 检查原生复制。

```text
alpha beta
	Tab indentation
    Space indentation
```

HTML 块关闭“预览”后，在源码模式检查同样的选区效果；实际预览里的交互不受影响。

```html
<section>
	<p>你好，World</p>
</section>
```
````
