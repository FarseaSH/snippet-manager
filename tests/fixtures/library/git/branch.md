---
snippet_name: Git Branch
snippet_tags: [git, branch]
---

分支创建、删除和切换。

# Create Branch

创建新分支。

```bash
git switch -c feature/example
```

# Delete Branch

未合并的分支会拒绝删除。

```bash
git branch -d feature/example
```

# Switch Branch

切换到已有分支。

```bash
git switch main
```
