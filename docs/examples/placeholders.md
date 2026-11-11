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

输入标题后，预览和源代码应同步更新，内嵌代码块也可以复制。输入 HTML 时仍按安全的 Markdown 规则渲染。

````markdown
## @title:text:每日报告@

生成日期：@generated:date(YYYY年M月D日 HH:mm):2026-11-10T14:30@

```text
报告名称：@title:text:每日报告@
```
````

# 独立参数

这里的 `name` 与其他 Tab 分开保存。切回其他 Tab，已填写的参数应保持；点击“重置参数”只重置当前 Tab。

```python
name = "@name:text:独立值@"
print(name)
```
