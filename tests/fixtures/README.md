# 浏览器测试内容

`library/` 是可随仓库提交的最小测试内容库，包含固定的 8 个 snippet、目录图标配置和本地图片。测试启动时会将它复制到 `.generated/e2e-snippets-*`，临时文件和配置修改只作用于这一份副本，结束后自动清理。

Markdown 预览的完整示例同时保存在 `docs/examples/markdown-preview.md`，可以复制到个人 `snippets/` 中体验。测试不依赖被 Git 忽略的个人内容。
