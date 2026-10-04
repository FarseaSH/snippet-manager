# Snippet 格式规范

本文说明如何为 Snippet Manager 编写内容，规则与当前解析器一致。新建文件时可以直接复制下面的模板。

## 1. 文件与目录

| 对象 | 约定 |
| --- | --- |
| 内容目录 | 项目根目录下的 `snippets/`，支持任意层级的子目录 |
| Snippet | 一个 UTF-8 编码的 `.md` 文件，对应一个页面 |
| Folder | 文件所在的真实目录，用于分类；不通过标签指定目录 |
| Sub Snippet | 正文中一个顶层围栏代码块，对应一段可以单独复制的代码 |

例如，`snippets/linux/ssh-proxy.md` 属于 `linux` 分类。文件名决定页面路径，页面标题由文件中的 `snippet_name` 决定，两者可以不同。

推荐目录和文件名使用小写英文及连字符，例如 `python/files/read-json.md`，方便链接和版本管理。中文文件名也支持。改名或移动文件会改变页面地址，需要同步更新引用它的链接。

以 `.` 开头的文件、目录和符号链接不会被扫描。项目根目录的 `docs/`、`.pj/` 和 `README.md` 不会进入内容库。

## 2. 推荐模板：一个文件包含多个子片段

将下面内容保存为 `snippets/linux/ssh-proxy.md`。一个文件围绕一个主题，每个子片段描述一种具体用法。

````markdown
---
snippet_name: SSH SOCKS Proxy
snippet_tags: [linux, ssh, proxy]
---

通过 SSH 创建本地 SOCKS5 代理，供支持 SOCKS 的应用使用。

# Start Proxy

监听本机 1080 端口，`-N` 表示不执行远程命令。

```bash
ssh -N -D 127.0.0.1:1080 user@example.com
```

将 `user@example.com` 替换为你的登录用户和主机。

# Test with curl

使用代理请求网页，并让代理端解析域名。

```bash
curl --proxy socks5h://127.0.0.1:1080 https://example.com
```
````

页面标题为 **SSH SOCKS Proxy**，包含 **Start Proxy** 和 **Test with curl** 两个 Tab。第一个一级标题之前的文字是整个文件的说明；每段代码前后的文字用于解释相应子片段。

## 3. Front Matter：两个必填字段

文件必须从 YAML Front Matter 开始，用两行 `---` 包住元数据。开头的 `---` 前不要添加标题、注释或空行。

```yaml
---
snippet_name: SSH SOCKS Proxy
snippet_tags: [linux, ssh, proxy]
---
```

| 字段 | 必填 | 类型与要求 | 用途 |
| --- | --- | --- | --- |
| `snippet_name` | 是 | 非空字符串，去除首尾空白后仍有内容 | 列表名称、页面标题和搜索 |
| `snippet_tags` | 是 | 字符串数组，可以是 `[]` | 标签展示和搜索 |

字段名及大小写必须保持一致。没有标签时也必须写 `snippet_tags: []`。重复标签会自动去重，其他字段目前不参与展示或分类。

标签也可以分行填写：

```yaml
snippet_tags:
  - linux
  - ssh
  - proxy
```

推荐同一类标签统一使用小写名称。含特殊字符、冒号，或者看起来像数字、布尔值的名称应使用引号，例如 `snippet_name: "JSON: 格式化"`、`snippet_tags: ["2026", "true"]`。

以下写法无效：

```yaml
snippet_name: ""               # 名称为空
snippet_tags: linux, ssh        # 这是字符串，不是数组
```

缺少任一必填字段、YAML 无法解析、重复 YAML 字段，或标签数组中含有非字符串值，都会导致这个文件被跳过。

## 4. 标题与子片段的对应关系

正文中的一级标题 `# 名称` 用于命名子片段，**不要把它当成整个页面的标题再写一遍**。页面标题已经由 `snippet_name` 提供。

- 每个一级标题只命名它后面、下一个一级标题之前的第一个顶层围栏代码块。
- 同一一级标题下再写第二个代码块，会创建另一个子片段，名称自动设为 `Untitled`。
- 所有没有关联一级标题的代码块依次命名为 `Untitled`、`Untitled 2`、`Untitled 3`，编号只计算这些未命名的代码块。
- 二级及更深的标题（`##`、`###`）属于说明内容，不用于命名子片段。
- 子片段按代码块在文件中出现的顺序展示。推荐每个代码块前写一个独立、明确的一级标题。

第一个一级标题之前的普通正文作为整个文件的说明。在一级标题之后，代码前的说明及代码后的补充归相应子片段；如果又出现一个代码块，后续说明改归这个新子片段，直到下一个代码块或一级标题。

如果一个一级标题后没有关联代码块，该标题及正文仍会保留。有其他代码块的文件会收到警告，不会丢失这部分内容。仅说明的文件不因使用一级标题而收到这种警告。

## 5. 代码块写法

使用三个或更多反引号，也可以使用三个或更多波浪号包住代码。推荐使用三个反引号，并填写小写语言标记：

````markdown
```python
import json

print(json.dumps({"ok": True}))
```
````

| 代码类型 | 推荐语言标记 | 常用别名 |
| --- | --- | --- |
| Python | `python` | `py` |
| JavaScript | `javascript` | `js` |
| TypeScript | `typescript` | `ts` |
| Bash / Shell | `bash` | `sh`、`shell` |
| Windows Batch | `bat` | 推荐直接写 `bat` |
| PowerShell | `powershell` | 推荐直接写 `powershell` |
| JSON / YAML / SQL | `json`、`yaml`、`sql` | YAML 也可写 `yml` |
| 纯文本 | `text` | 也可以不填写语言标记 |

语言标记用于语法高亮和图标选择，与目录、标签、子片段名称无关。未填写或无法识别的语言仍可展示和复制，使用可用的纯文本展示或默认图标。

围栏必须位于 Markdown 顶层，推荐顶格书写。**列表、引用中的围栏代码块，以及用四个空格缩进的代码块，只作为说明里的示例，不会生成子片段或 Tab。**

代码中保留实际需要的缩进和空行，不手动添加行号。命令示例一般不添加终端提示符 `$` 或 `>`，避免复制时把提示符一起带入。地址、用户名及参数可以使用明确的占位值，并在说明中解释如何替换。

“复制当前代码”只复制当前代码块的内容，包含其缩进和空行，不包含围栏、语言标记、一级标题或说明。“复制 Markdown”则复制整个源文件，包括 Front Matter。

## 6. 只有一段代码，或只有说明

只有一个顶层代码块时，页面直接显示代码，不显示 Tab 栏，代码前后的说明仍会保留。例如保存为 `snippets/python/hello.md`：

````markdown
---
snippet_name: Python Hello
snippet_tags: [python]
---

打印一条消息。

# Hello

```python
print("hello")
```
````

没有顶层代码块也是有效 Snippet，正文完整展示，代码区按无代码内容处理，没有 Tab 或代码状态栏，不会因此报错。例如保存为 `snippets/guides/naming.md`：

````markdown
---
snippet_name: 命名约定
snippet_tags: [guide]
---

## 文件命名

推荐使用小写英文和连字符，例如 `read-json.md`。
````

空的顶层围栏代码块仍算一个子片段；如果只需要写说明，直接省略代码块即可。

## 7. 说明、链接和图片

说明支持普通 Markdown，包括段落、列表、引用、表格、行内代码、链接和图片。直接写 Markdown，不依赖自定义 HTML：原始 HTML 会按文本展示。

推荐开头用一两句话说明这个文件解决什么问题。中栏列表预览说明，最多显示两行；页面中的长说明默认折叠为约五行，点击后可以展开，不需要在源文件中手动截断。

库内链接和图片路径以**当前 Markdown 文件所在目录**为基准，例如在 `snippets/guides/organizing.md` 中：

```markdown
[Python Requests](../python/http/requests.md)
![内容流转示意](assets/workflow.svg)
```

其中图片实际位于 `snippets/guides/assets/workflow.svg`。链接指向有效 `.md` 文件时，会转换成该 Snippet 的页面地址；引用到的本地图片及其他本地资源会随站点打包。

本地资源放在 `snippets/` 内，推荐用非隐藏的 `assets/` 子目录管理。不要使用电脑上的绝对路径。资源缺失、链接指向不存在或被跳过的 Snippet、相对路径超出 `snippets/` 时会产生警告，当前文件仍可展示，但该链接或资源可能不可用。

外部网页可以正常使用 `https://` 链接。外部图片不会作为本地资源打包，离线使用时不保证可访问。

## 8. 可选：目录排序与图标

创建真实目录即可产生分类，不必先登记。需要调整目录顺序或指定图标时，编辑 `snippets/_folders.yml`：

```yaml
folders:
  - linux[bash]
  - python[python]:
      - http
      - files:
          - json[json]
  - git
```

`folders` 的每项使用真实目录名，末尾可追加 `[图标标记]`；有子目录时加 `:` 并使用嵌套数组设置该目录下的子目录顺序。叶子目录可以直接写 `- linux[bash]`，也可以写 `- linux[bash]:`。未配置的目录仍会显示，并按名称排列在已配置目录之后。配置不创建目录，也不控制 Snippet 顺序。

图标直接写在目录名末尾的中括号内：

- 中括号前是该层的真实目录名，不写完整路径。例如 `python[python]` 对应 `snippets/python/`，嵌套的 `json[json]` 对应 `snippets/python/files/json/`。实际目录名称与页面显示名称不包含图标标记。
- 标记使用 `python`、`javascript`、`typescript`、`bash`、`json` 等，不带文件扩展名前的 `.`；支持 `py`、`js`、`ts`、`sh` 等别名，忽略标记的大小写及首尾空格。
- 子目录继承最近一个已配置父目录的图标。上例中 `python/http`、`python/files` 使用 Python 图标，`python/files/json` 及其子目录使用 JSON 图标。
- 没有自身或父目录配置时统一使用普通文件夹图标，不随展开或选中状态改变。空标记或不支持的标记会产生警告，仅忽略该图标，目录排序、子目录配置及父目录图标继承仍有效；不存在的目录会产生警告，该目录项忽略。
- 左侧目录树、中栏每个 Snippet 的路径图标、窄屏目录选择按钮和手机子目录入口使用同一套规则。路径图标根据 Snippet 实际所属目录显示，不随当前搜索或父目录筛选范围改变。

`_folders.yml` 与 `folders` 均可省略；目录排序和图标共用这一个配置字段。保存后开发页面实时更新；部署时图标配置随静态数据一起发布。

Snippet 列表按 `snippet_name` 排序，同名时按路径排序。浏览父目录时，列表同时包含直属和所有子目录下的 Snippet。

## 9. 保存与检查

开发时执行 `npm run dev`，添加、修改或删除 `snippets/` 中的文件会自动更新页面，不需要先构建数据。发布时执行 `npm run build`，生成一次静态内容。

写完一个文件后，检查以下内容即可：

1. 文件出现在正确目录，页面名称和标签符合预期。
2. 每个顶层代码块都有预期的名称、语言和顺序。
3. 当前代码复制后保留所需缩进，没有多余提示符或手写行号。
4. 说明完整，链接和图片可以访问。
5. 开发或构建控制台没有该文件的格式错误；错误文件会被跳过，其他有效文件仍继续处理。

现有示例可参考 [SSH SOCKS Proxy](../snippets/linux/ssh-proxy.md)、[Git Branch](../snippets/git/branch.md) 和 [仅说明片段](../snippets/guides/organizing.md)。
