---
snippet_name: 转换示例 · JSON 转 Python
snippet_tags: [转换, json, python, 示例]
snippet_type: transform
transform:
  input_language: json
  example: '{"name":"demo","enabled":true,"missing":null,"items":[1,2,3]}'
---

将 JSON 转成 Python 的 `data` 变量赋值，支持嵌套对象、数组、布尔值和空值。函数返回 `py` 别名，输出按 Python 高亮；输出仅用于阅读和复制。见 `:@转换代码`。

# 转换代码

```js
function python(value) {
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("数字必须为有限值");
    return String(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(python).join(", ") + "]";
  return "{" + Object.entries(value).map(([key, item]) => JSON.stringify(key) + ": " + python(item)).join(", ") + "}";
}

export default function transform(input) {
  try {
    return { ok: true, output: "data = " + python(JSON.parse(input)), language: "py" };
  } catch {
    return { ok: false, error: { message: "请输入有效的 JSON，数字必须为有限值" } };
  }
}
```
