---
snippet_name: 转换示例 · 返回 JSON 语言
snippet_tags: [转换, json, 示例]
snippet_type: transform
transform:
  input_language: json
  output_language: text
  example: '{"name":"demo","enabled":true,"items":[1,2,3]}'
---

在 `:@转换` 中填入示例，输出会使用函数返回的 `json` 高亮，覆盖文件配置的 `text`。输入错误时显示校验提示。实现见 `:@转换代码`。

# 转换代码

```js
export default function transform(input) {
  try {
    return {
      ok: true,
      output: JSON.stringify(JSON.parse(input), null, 2),
      language: "json"
    };
  } catch {
    return { ok: false, error: { message: "请输入有效的 JSON 文本" } };
  }
}
```
