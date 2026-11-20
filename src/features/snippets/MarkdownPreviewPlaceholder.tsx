import { useEffect, useState } from 'react';

export function MarkdownPreviewPlaceholder({ error }: { error?: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(timer);
  }, []);
  return <div className="markdown-preview" role={error || visible ? 'status' : undefined} aria-busy={!error}>
    {error ? '预览暂不可用，请查看源代码。' : visible ? '正在更新预览…' : null}
  </div>;
}
