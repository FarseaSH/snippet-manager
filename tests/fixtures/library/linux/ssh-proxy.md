---
snippet_name: SSH SOCKS Proxy
snippet_tags: [linux, ssh, proxy]
---

使用 SSH 创建 SOCKS 代理。

# Start Proxy

启动代理连接。

```bash
ssh -N -D 127.0.0.1:1080 user@example.com
```

# Test with curl

使用代理访问示例地址。

```bash
curl --proxy socks5h://127.0.0.1:1080 https://example.com
```
