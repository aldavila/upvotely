import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the actual handlers with isolated dependencies. No DB, auth provider,
// AI service or network can load unless a test explicitly supplies a fake.
export function loadSource(entry: string, stubs: Record<string, unknown>, env: Record<string, string> = {}, fetchStub?: typeof fetch): any {
  const cache = new Map<string, { exports: any }>();
  function load(file: string): any {
    let path = resolve(file);
    if (!path.endsWith('.ts')) path = existsSync(`${path}.ts`) ? `${path}.ts` : resolve(path, 'index.ts');
    if (cache.has(path)) return cache.get(path)!.exports;
    const mod = { exports: {} };
    cache.set(path, mod);
    const code = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    runInNewContext(code, {
      module: mod, exports: mod.exports,
      require: (id: string) => {
        if (id in stubs) return stubs[id];
        if (['@/lib/db', '@/lib/auth', '@/lib/api-auth'].includes(id) || id.startsWith('@/lib/ai/')) throw new Error('Missing fake dependency');
        if (id.startsWith('@/')) return load(resolve('src', id.slice(2)));
        if (id.startsWith('.')) return load(resolve(dirname(path), id));
        if (['next/server', 'zod', 'node:crypto', 'crypto'].includes(id)) return require(id);
        throw new Error('Unexpected dependency');
      },
      Request, Response, URL, URLSearchParams, Buffer, Date, AbortSignal,
      process: { env },
      console: { error: () => {} },
      fetch: fetchStub ?? (() => { throw new Error('Network forbidden in tests'); }),
    }, { filename: path });
    return mod.exports;
  }
  return load(entry);
}
