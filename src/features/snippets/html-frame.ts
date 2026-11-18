import type { HtmlProject } from './html-project';

// These functions are serialized into the opaque-origin frame. Keep them self-contained.
function bridge(token: string, autoSize: boolean) {
  const send = (type: string, extra: Record<string, unknown> = {}) => parent.postMessage({ channel: 'snippet-html', token, type, ...extra }, '*');
  let count = 0;
  addEventListener('error', event => {
    if (count++ >= 20) return;
    const element = event.target;
    if (element instanceof HTMLElement && element !== document.documentElement) {
      send('error', { message: `资源加载失败：${element.dataset.previewSource || element.getAttribute('src') || element.getAttribute('href') || element.tagName}` });
    } else send('error', { message: event.message || '脚本运行失败；跨域脚本可能不提供详细错误信息。' });
  }, true);
  addEventListener('unhandledrejection', event => {
    if (count++ < 20) send('error', { message: String(event.reason?.message ?? event.reason ?? '异步执行失败') });
  });
  let pending = false;
  addEventListener('scroll', () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; send('scroll', { x: scrollX, y: scrollY }); });
  }, { passive: true });
  addEventListener('message', event => {
    if (event.source === parent && event.data?.token === token && event.data.type === 'restore-scroll') {
      scrollTo(Number(event.data.x) || 0, Number(event.data.y) || 0);
    }
  });
  addEventListener('keydown', event => { if (event.key === 'Escape') send('escape'); }, true);
  addEventListener('click', event => {
    const anchor = event.target instanceof Element ? event.target.closest('a') : null;
    const href = anchor?.getAttribute('href');
    if (href?.startsWith('#')) {
      event.preventDefault();
      try { document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView(); } catch { /* malformed fragment */ }
    }
  });
  addEventListener('load', () => send('ready'), { once: true });
  if (autoSize) {
    let measuring = false;
    const measure = () => {
      if (measuring) return;
      measuring = true;
      requestAnimationFrame(() => {
        measuring = false;
        const body = document.body;
        if (body) send('height', { height: Math.ceil(Math.max(body.scrollHeight, body.getBoundingClientRect().bottom + scrollY + (parseFloat(getComputedStyle(body).marginBottom) || 0))) });
      });
    };
    addEventListener('load', () => {
      const observer = new ResizeObserver(measure);
      observer.observe(document.documentElement);
      if (document.body) observer.observe(document.body);
      document.fonts.ready.then(measure);
      measure();
    }, { once: true });
    addEventListener('resize', measure);
  }
}

function bootstrap(project: HtmlProject, token: string, bridgeSource: string) {
  const urls: Record<string, string> = {};
  const keys = Object.keys(project.resources).sort((a, b) => b.length - a.length);
  const replaceUrls = (text: string) => {
    for (const key of keys) if (text.includes(key)) text = text.split(key).join(resource(key));
    return text;
  };
  function resource(key: string): string {
    if (urls[key]) return urls[key];
    const file = project.resources[key];
    const code = file.kind === 'css' ? replaceUrls(file.code) : file.code;
    return urls[key] = URL.createObjectURL(new Blob([code], { type: `${file.mime};charset=utf-8` }));
  }
  try {
    const html = new DOMParser().parseFromString(project.html, 'text/html');
    for (const element of html.querySelectorAll('*')) {
      for (const attribute of [...element.attributes]) {
        const replaced = replaceUrls(attribute.value);
        if (replaced !== attribute.value) {
          if (['src', 'href', 'poster'].includes(attribute.name)) (element as HTMLElement).dataset.previewSource = attribute.value.replace('https://snippet-preview.invalid/', './');
          element.setAttribute(attribute.name, replaced);
        }
      }
      if (element.tagName === 'STYLE') element.textContent = replaceUrls(element.textContent ?? '');
      if (element.tagName === 'SCRIPT' && element.getAttribute('type') === 'importmap') element.textContent = replaceUrls(element.textContent ?? '');
    }
    const imports: Record<string, string> = {};
    for (const key of keys) imports[key] = resource(key);
    const map = html.createElement('script');
    map.type = 'importmap'; map.textContent = JSON.stringify({ imports });
    const policy = html.createElement('meta');
    policy.httpEquiv = 'Content-Security-Policy';
    policy.content = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob: https: http:; style-src 'unsafe-inline' blob: https: http:; img-src data: blob: https: http:; font-src data: blob: https: http:; media-src data: blob: https: http:; connect-src https: http:; base-uri https://snippet-preview.invalid; form-action 'none'; frame-src 'none'; object-src 'none'";
    const base = html.createElement('base'); base.href = project.base;
    const runtime = html.createElement('script'); runtime.textContent = bridgeSource;
    html.head.prepend(policy, base, runtime, map);
    // document.write preserves parser-blocking scripts, defer/async and module ordering.
    document.open();
    document.write('<!doctype html>\n' + html.documentElement.outerHTML);
    document.close();
    addEventListener('pagehide', () => Object.values(urls).forEach(url => URL.revokeObjectURL(url)), { once: true });
  } catch (error) {
    parent.postMessage({ channel: 'snippet-html', token, type: 'error', message: error instanceof Error ? error.message : String(error) }, '*');
  }
}

export function htmlFrameDocument(project: HtmlProject, token: string, autoSize = false) {
  const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
  const runtime = `(${bridge.toString()})(${json(token)},${json(autoSize)})`;
  // Wait until srcdoc's initial parser finishes before replacing its document.
  // Writing reentrantly from a parser script can strand blocking CDN scripts.
  return `<!doctype html><meta charset="utf-8"><script>addEventListener('load',()=>setTimeout(()=>(${bootstrap.toString()})(${json(project)},${json(token)},${json(runtime)}),0),{once:true})</script>`;
}
