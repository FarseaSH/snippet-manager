---
snippet_name: 转换示例 · JSON 转 Markdown
snippet_tags: [转换, markdown, json, 示例]
snippet_type: transform
transform:
  input_language: json
  example: '{"name":"demo","enabled":true,"items":[1,2,3]}'
---

将 JSON 生成一份 Markdown 报告。右侧默认预览，包含标题、列表、行内代码和 JSON 代码块；可分别复制代码块、行内代码或完整 Markdown，也可切换源码。输入更新后保留预览 / 源码选择。实现见 `:@转换代码`。

# 转换代码

```js
export default function transform(input) {
  let value;
  try {
    value = JSON.parse(input);
  } catch {
    return { ok: false, error: { message: "请输入有效的 JSON 文本" } };
  }
  const json = JSON.stringify(value, null, 2);
  // Choose a fence longer than any backtick sequence in the generated content.
  const fence = "`".repeat(Math.max(3, ...Array.from(json.matchAll(/`+/g), match => match[0].length + 1)));
  const kind = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  const output = [
    "# JSON 转换报告",
    "",
    "- 数据类型：`" + kind + "`",
    "- 字符数量：" + input.length,
    "",
    "## 格式化结果",
    "",
    fence + "json",
    json,
    fence
  ].join("\n");
  return { ok: true, output, language: "markdown" };
}
```
