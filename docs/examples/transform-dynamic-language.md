---
snippet_name: 转换示例 · 动态输出语言
snippet_tags: [转换, markdown, json, python, 示例]
snippet_type: transform
transform:
  output_language: text
  example: |-
    md
    # 动态输出

    试试复制 `demo`，或复制下面的代码块。

    ```python
    print("hello")
    ```
---

第一行指定输出语言，后续所有行作为输出原文。支持 `md` / `markdown`、`json`、`py` / `python`、`text`。尝试修改第一行，观察 Markdown 默认预览、源码选择保留，以及切换语言后重新默认预览。未知语言也可输入，按纯文本展示；第一行留空则使用文件的默认语言。转换实现见 `:@转换代码`。

# 转换代码

```js
export default function transform(input) {
  const newline = input.indexOf("\n");
  if (newline < 0) {
    return { ok: false, error: { message: "第一行填写语言，并从第二行开始输入内容" } };
  }
  return {
    ok: true,
    output: input.slice(newline + 1),
    language: input.slice(0, newline).trim()
  };
}
```
