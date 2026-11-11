---
snippet_name: JSON 格式化转换
snippet_tags: [json, 转换, 测试]
snippet_type: transform
transform:
  input_language: json
  output_language: json
  example: '{"name":"demo","enabled":true,"items":[1,2,3]}'
---

在 `:@转换` 中输入 JSON，停止输入约 500ms 后自动生成带缩进的结果。输入有误时会显示提示，修正后自动恢复。可在 `:@转换代码` 中查看和复制实现。

# 转换代码

```js
export default function transform(input) {
  let value;
  try {
    value = JSON.parse(input);
  } catch {
    return {
      ok: false,
      error: { message: "请输入有效的 JSON 文本" }
    };
  }
  return {
    ok: true,
    output: JSON.stringify(value, null, 2)
  };
}
```
