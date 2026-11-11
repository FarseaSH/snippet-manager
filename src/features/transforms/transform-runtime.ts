import { interpretTransformResult, type TransformExecution } from '../../core/transform';

// Only the worker evaluates snippet code. The opaque-origin frame has no site storage,
// and its CSP also applies to its blob workers, blocking network and external imports.
const workerSource = String.raw`
self.onmessage = async ({ data }) => {
  try {
    const module = await import(data.url);
    if (typeof module.default !== 'function') throw new Error('请使用 export default 导出一个转换函数。');
    const result = await module.default(data.input);
    self.postMessage({ type: 'result', value: result });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};`;

const sandboxSource = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none';"><script>
let worker, urls = [];
const cleanup = () => { worker?.terminate(); urls.forEach(url => URL.revokeObjectURL(url)); urls = []; };
addEventListener('pagehide', cleanup);
addEventListener('message', event => {
  if (event.source !== parent || !event.ports[0]) return;
  const port = event.ports[0];
  port.onmessage = () => cleanup();
  try {
    const moduleUrl = URL.createObjectURL(new Blob([event.data.code], { type: 'text/javascript' }));
    const workerUrl = URL.createObjectURL(new Blob([${JSON.stringify(workerSource)}], { type: 'text/javascript' }));
    urls = [moduleUrl, workerUrl];
    worker = new Worker(workerUrl);
    worker.onmessage = event => { port.postMessage(event.data); cleanup(); };
    worker.onerror = event => { event.preventDefault(); port.postMessage({ type: 'error', message: event.message || '转换函数执行失败。' }); cleanup(); };
    worker.postMessage({ url: moduleUrl, input: event.data.input });
  } catch (error) { port.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) }); cleanup(); }
});</script>`;

export function runTransform(code: string, input: string, signal: AbortSignal, timeout = 2000): Promise<TransformExecution> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('转换已取消', 'AbortError')); return; }
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.title = '转换执行环境';
    const channel = new MessageChannel();
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      channel.port1.postMessage('cancel');
      channel.port1.close();
      channel.port2.close();
      frame.remove();
    };
    const finish = (result: TransformExecution) => { if (!settled) { settled = true; cleanup(); resolve(result); } };
    const abort = () => { if (!settled) { settled = true; cleanup(); reject(new DOMException('转换已取消', 'AbortError')); } };
    const timer = setTimeout(() => finish({ status: 'error', message: '转换超时（2 秒），请检查代码或减少输入内容。' }), timeout);
    signal.addEventListener('abort', abort, { once: true });
    channel.port1.onmessage = event => {
      const data = event.data;
      if (data?.type === 'result') finish(interpretTransformResult(data.value));
      else finish({ status: 'error', message: typeof data?.message === 'string' ? data.message : '转换函数执行失败。' });
    };
    frame.onload = () => {
      if (!settled) frame.contentWindow?.postMessage({ code, input }, '*', [channel.port2]);
    };
    frame.srcdoc = sandboxSource;
    document.body.append(frame);
  });
}
