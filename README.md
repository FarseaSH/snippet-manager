# Snippet Manager

一个基于 Markdown 的个人代码片段浏览器。React + TypeScript + Vite；公开静态部署；支持全库搜索、四种复制、移动端导航和 PWA 离线使用。

## 开始使用

使用 Node.js 24 或更高版本：

```bash
npm ci
npm run dev
```

打开 http://127.0.0.1:5173 。修改、添加、删除 `snippets/` 中的文件，页面会自动更新，无需先生成 JSON 或构建生产数据。开发模式不注册 Service Worker。

## 项目目录

```text
.pj/             产品方案，保持原位置
docs/            编写规范与项目文档
snippets/        内容源与 _folders.yml
scripts/         共用解析器、开发读取、发布构建
src/             React 界面、搜索逻辑与 PWA 通信
public/icons/    应用安装图标
tests/           内容、搜索与浏览器测试
dist/            自动生成的生产产物
```

## 编写内容

完整的文件约定、可复制模板和注意事项见 [Snippet 格式规范](docs/Snippet格式规范.md)。

````markdown
---
snippet_name: 我的片段
snippet_tags: [python, example]
---

整个文件的说明。

# Hello

这段代码的介绍。

```python
print("hello")
```

这段代码的补充说明。
````

- 每个顶层 fenced code block 生成一个 Sub Snippet；多个子片段通过 Tab 切换，只有一个时直接显示代码；一级标题只命名其后、下一个一级标题前的第一个代码块。
- 没有标题的代码块使用 `Untitled`，后续自动编号。
- 说明中的列表、引用内代码块与缩进代码保留原结构。
- 只有一个代码块时保留全部说明，省略摘要列表和 Tab 栏；没有代码块也可正常阅读。
- 当前代码的语言、只读状态、行数和“复制当前代码”按钮位于编辑器下方，归属于当前 Tab 并保持在代码区底部；切换子片段时同步更新，没有代码时不显示状态栏。
- 编辑器与状态栏共用浅灰色背景和圆角矩形容器，行号区及手机端高亮展示保持相同背景。编辑器高度由详情页剩余空间动态决定，不设置固定高度，也不按代码行数改变高度；状态栏保持在详情页底部，两侧及底部保留页边距。长代码在代码区内滚动，长说明展开时在说明框内滚动，窗口缩放和说明展开、收起时编辑器同步伸缩。
- Tab、说明和底部状态栏按代码块的语言标记显示对应图标，支持 `py`、`js`、`ts`、`sh` 等别名；Bash / Shell 使用自绘的纯 `$_` SVG 图标，Batch（`bat`、`batch`、`cmd`）使用 [Lucide Terminal](https://lucide.dev/icons/terminal) 平面图标，其他语言 Logo 来自 [Simple Icons](https://github.com/simple-icons/simple-icons)。未知或缺失类型使用通用代码图标，所有图标随应用打包，可离线显示。
- 元数据错误的文件会跳过，控制台显示路径和原因，其他文件继续处理。
- 相对 `.md` 链接指向库内页面；本地图片随内容一起构建和缓存。
- `.pj/` 不作为内容源。示例内容可以替换为自己的代码库。

Folder 的真实目录决定分类，目录名称保留原始大小写、下划线和连字符，不进行标题格式转换；`_folders.yml` 可设置目录顺序和图标；中栏递归显示选中目录及所有子目录的片段，按名称排序。列表路径及目录入口使用对应文件夹图标，路径显示在名称上方，说明预览最多两行，超出显示省略号；搜索结果也只预览说明，不展示代码。

从全部片段或父目录打开 Snippet 时，保留原列表范围、顺序与目录选择，只更新选中项和右侧详情；连续打开其他片段、浏览器前进后退及刷新时仍保留来源目录。清空搜索后恢复搜索前的目录范围，手机端返回同样回到来源列表。直接打开片段链接、没有来源目录时，使用该片段所属目录。

桌面没有全宽顶栏：品牌放在左侧文件夹栏顶部，搜索放在中间列表栏顶部。手机端保留紧凑的搜索与返回入口，搜索词在列表与详情间切换时保留。

宽屏中栏不重复显示目录标题与路径栏；隐藏左侧文件夹栏的窄屏布局通过当前路径按钮选择目录，根目录显示“内容库根目录”。搜索时保留搜索结果标题与数量。

代码页说明默认显示约 5 行，长内容底部以渐变毛玻璃提示更多内容，单击说明框展开，再次单击收起，不显示展开按钮；短说明完整显示。链接、子片段跳转与文字选择不触发折叠，键盘 Enter / Space 也可切换，切换 Tab 保持展开状态。子 Snippet 说明使用纯语言 Logo 代替圆点，无外框或折角，Logo 根据各代码块语言显示（如 Python、JavaScript），未知类型使用默认代码符号；名称采用普通字体，不使用行内代码的填充样式，不自动插入分隔线，名称与说明链接不显示下划线；Logo 和名称属于同一按钮，共享悬停效果与键盘焦点，点击任意一处都切换到对应 Tab。

```yaml
folders:
  - python[python]:
      - http
      - files:
          - json[json]
  - git
  - linux[bash]
```

`folders` 每项写真实目录名，末尾可加 `[语言标记]` 指定图标，例如 `python[python]`、`linux[sh]`；有子目录时在名称后加 `:` 并嵌套数组。标记不带 `.`，支持 `py`、`js`、`sh` 等别名。子目录继承最近父目录的图标，也可以单独指定；未配置时统一显示普通文件夹图标。中括号不属于实际目录名或显示名称。不存在的目录、无效标记或类型只产生警告，不影响有效内容、排序和其他配置；保存后开发页面实时更新。

桌面和平板代码区使用 Monaco 只读编辑器，提供等宽字体、行号、语言高亮、缩进参考线、括号匹配、代码折叠及编辑器内查找（Ctrl / ⌘ + F）。长代码在编辑器内滚动，底部保留只读状态、总行数和完整代码复制；不修改 Markdown 源文件。手机与触摸设备使用适合触摸选择的只读高亮展示，编辑器加载失败时也自动使用这一展示方式。编辑器、语言模块和 Worker 随应用本地打包并进入 PWA 全量缓存，不依赖 CDN。

## 测试

```bash
npm run check
npm test
npm run test:e2e
```

普通测试无需先构建。浏览器测试会自动启动开发服务器；使用本机 Chrome（macOS），其他环境需要先执行 `npx playwright install chromium`。

生产离线验证：

```bash
npm run build
APP_TEST_MODE=production npm run test:e2e
```

生产测试需要 localhost 或 HTTPS，以注册 Service Worker。PWA 可安装到桌面或 Android；iPhone / iPad 通过浏览器“添加到主屏幕”。全部资源缓存成功后才提示“全库可离线使用”。新版本完整缓存后提示刷新，准备失败时旧版本继续可用。

## 静态构建与部署

```bash
npm run build
npm run preview
```

部署 `dist/` 目录；无需服务器端 Node.js 或数据库。有效 Markdown 在 `/raw/` 下直接输出，原文不重写。页面路由同时生成 `index.html`，可使用支持目录首页的静态托管直接打开深层链接。

站点部署在子路径时：

```bash
SITE_BASE=/snippet-manager/ npm run build
SITE_BASE=/snippet-manager/ npm run preview
```

将 `dist/` 挂载到相应子路径。基础路径同时作用于页面、Raw、图片、Manifest 和 Service Worker。文件移动或改名会改变 URL。

如果托管平台使用 SPA 回退规则，应让 `/raw/`、`/data/`、`/content-assets/`、`/assets/` 下不存在的文件返回 HTTP 404；页面导航才回退至应用 HTML。现有静态文件应优先直接响应，`version.json`、`sw.js` 建议使用重新验证缓存策略。

浏览器内的代码和 Markdown 复制来自当前内容版本；公共 Raw URL 指向站点当前发布的文件。源码已按公开访问设计。

完整产品规则见 [.pj/Snippet Manager 产品规划 V0.1(1).md](<.pj/Snippet Manager 产品规划 V0.1(1).md>)。
