import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute handlers with isolated dependencies. Support both Linear tests passing
// sandbox globals and Slack tests passing env, fetch, and error-log arguments.
// DB, auth, AI, and network boundaries require explicit test fakes.
export function loadSource(entry: string, stubs: Record<string, unknown>, envOrGlobals: Record<string, unknown> = {}, fetchStub?: typeof fetch, errorLog: (...args: unknown[]) => void = () => {}): any {
  const usesGlobals = Object.values(envOrGlobals).some(value => typeof value !== 'string');
  const globals = usesGlobals ? envOrGlobals : {};
  const env = usesGlobals ? {} : envOrGlobals;
  const cache = new Map<string, { exports: any }>();
  function load(file: string): any {
    let path = resolve(file);
    if (!/\.tsx?$/.test(path)) path = existsSync(`${path}.ts`) ? `${path}.ts` : resolve(path, 'index.ts');
    if (cache.has(path)) return cache.get(path)!.exports;
    const mod = { exports: {} };
    cache.set(path, mod);
    const code = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    runInNewContext(code, {
      module: mod, exports: mod.exports,
      require: (id: string) => {
        if (Object.hasOwn(stubs, id)) return stubs[id];
        if (['@/lib/db', '@/lib/auth', '@/lib/api-auth'].includes(id) || id.startsWith('@/lib/ai/')) throw new Error('Missing fake dependency');
        if (id.startsWith('@/')) return load(resolve('src', id.slice(2)));
        if (id.startsWith('.')) return load(resolve(dirname(path), id));
        if (['next/server', 'zod', 'node:crypto', 'crypto'].includes(id)) return require(id);
        throw new Error('Unexpected dependency');
      },
      Request, Response, URL, URLSearchParams, Buffer, Date, AbortSignal,
      process: { env },
      console: { error: errorLog },
      fetch: fetchStub ?? (() => { throw new Error('Network forbidden in tests'); }),
      ...globals,
    }, { filename: path });
    return mod.exports;
  }
  return load(entry);
}
