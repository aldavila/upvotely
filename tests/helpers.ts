import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the real adapter code, replacing only external dependencies. Unknown
// imports and network access fail closed so tests cannot reach services/secrets.
export function loadSource<T>(file: string, imports: Record<string, unknown>, env: Record<string, string> = {}, fetcher?: typeof fetch): T {
  const source = ts.transpileModule(readFileSync(resolve(file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(source, {
    exports,
    require: (name: string) => {
      if (name in imports) return imports[name];
      if (name === '@/lib/status-notification-policy' || name === '@/lib/unsubscribe-token') {
        return require(resolve('.test-dist/src/lib', name.slice('@/lib/'.length)));
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
    process: { env },
    console: { error: () => undefined },
    URL,
    fetch: fetcher ?? (() => { throw new Error('Network disabled'); }),
  }, { filename: file });
  return exports as T;
}

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

export const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
