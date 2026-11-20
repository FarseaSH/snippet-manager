---
snippet_name: 占位符替换功能测试
snippet_tags: [placeholder, 参数, 日期时间, 测试]
---

填写当前 Tab 说明下方的代码参数，检查显示和复制是否同步更新。原始 Markdown 始终保留占位符。可依次检查 `:@文本与数字`、`:@日期与时间` 和 `:@Markdown 预览`。

# 文本与数字

`name` 只接受小写字母、数字和连字符；`port` 只接受一到五位数字。`optional` 没有默认值，未填写时保留占位符。重复的 `name` 共用一个输入框。

```bash
curl "http://@host:text:localhost@:@port:number/^[0-9]{1,5}$/:8080@/users/@name:text/^[a-z][a-z0-9-]*$/:demo@"
echo "用户：@name:text/^[a-z][a-z0-9-]*$/:demo@"
echo "倍率：@ratio:number:1.5@"
echo "备注：@optional@"
echo "默认类型：@message::hello@"
echo "邮件：@email:text/^[^@]+@[^@]+$/:user\@example.com@"
```

# 日期与时间

`start` 在多个位置使用不同格式，但只需选择一次日期和时间，并支持秒。`day` 只显示日期控件；`clock` 只显示时间控件。日期使用本地日历值，不做时区转换。

```text
文件名：report_@start:date(YYYYMMDD_HHmmss):2026-11-10T14:30:25@.csv
显示：@start:date(YYYY年M月D日 HH:mm:ss):2026-11-10T14:30:25@
短日期：@start:date(YY/M/D):2026-11-10T14:30:25@
仅日期：@day:date(YYYY/MM/DD):2026-11-10@
仅时间：@clock:date(HH:mm):09:05@
```

# Markdown 预览

输入标题后，源码立即更新，预览在停止输入约 250ms 后更新，连续输入时保留原预览，不应反复闪现加载文案。滚动预览后修改标题，应尽量保持阅读位置；底栏复制最新源码，内嵌代码块复制当前可见版本。输入 HTML 时仍按安全的 Markdown 规则渲染。

````markdown
## @title:text:每日报告@

生成日期：@generated:date(YYYY年M月D日 HH:mm):2026-11-10T14:30@

```text
报告名称：@title:text:每日报告@
```
````

# 独立参数

这里的 `name` 与其他 Tab 分开保存。切回其他 Tab、刷新或重新打开页面，已填写的参数应保持；点击“重置参数”只重置当前 Tab 并删除其保存的历史。可分别填写不同值、刷新检查归属，再重置当前 Tab 并确认其他 Tab 的内容仍在。

```python
name = "@name:text:独立值@"
print(name)
```

# 填写提示与默认值

灰色默认值在聚焦时保留，直接输入会替换它；清空后恢复默认值，按右方向键 `→` 接受默认值并继续编辑。点击名称旁的 `e.g.` 示例可替换当前输入。长正则显示 `/ … /`，悬停、键盘聚焦或点击查看完整规则。无默认值且未填写的框保持空白和红色，不显示提示文案。

```text
用户名：@username:text/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/[填写用户名 e.g. alice-smith]:demo@
服务器：@server:[服务器地址 e.g. localhost:3000]:localhost@
备注：@note:text[可包含空格 e.g. alpha  beta]@
邮件：@contact:text[联系邮箱 e.g. user\@example.com]:guest\@example.com@
开始时间：@meeting:date(YYYY-MM-DD HH:mm)[选择开始时间 e.g. 2027-01-02 03:04]:2026-11-10T14:30@
```
