---
snippet_name: Python Requests
snippet_tags: [python, requests, http]
---

用 Requests 发送 HTTP 请求，包含查询参数、JSON 请求体与响应解析。请按接口约定设置超时和请求参数，示例可以直接复制后修改。请按接口约定设置超时和请求参数，示例可以直接复制后修改。请按接口约定设置超时和请求参数，示例可以直接复制后修改。请按接口约定设置超时和请求参数，示例可以直接复制后修改。请按接口约定设置超时和请求参数，示例可以直接复制后修改。请按接口约定设置超时和请求参数，示例可以直接复制后修改。请按接口约定设置超时和请求参数，示例可以直接复制后修改。

# GET Request

传递查询参数。

```python
import requests

response = requests.get(
    "https://example.com/api",
    params={"page": 1, "limit": 20},
    timeout=10,
)

response.raise_for_status()
```

# POST Request

提交 JSON 请求体。

```python
import requests

response = requests.post(
    "https://example.com/api",
    json={"name": "example"},
    timeout=10,
)
response.raise_for_status()
```

# JSON Response

读取响应数据。

```python
data = response.json()
print(data)
```
