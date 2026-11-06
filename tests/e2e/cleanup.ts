import fs from 'node:fs/promises';
import path from 'node:path';

export default async function cleanup() {
  const root = process.env.APP_TEST_CONTENT_DIR;
  if (root && path.dirname(root) === path.resolve('.generated') && path.basename(root).startsWith('e2e-snippets-')) {
    await fs.rm(root, { recursive: true, force: true });
  }
}
