---
snippet_name: Read JSON File
snippet_tags: [python, json]
---

读取本地 JSON 文件，不需要安装额外依赖。

```python
import json

def read_json(path):
    with open(path, encoding="utf-8") as file:
        data = json.load(file)
    return data

print(read_json("data.json"))
```
