import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute actual handlers with an explicit import allowlist. No real DB, auth,
// provider, environment variables, or network are reachable from the sandbox.
export function loader(stubs: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const cache = new Map<string, { exports: any }>();
  function load(file: string): any {
    const filename = resolve(file);
    if (cache.has(filename)) return cache.get(filename)!.exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    runInNewContext(source, {
      module, exports: module.exports, URL, Request, Response,
      console: { error() {} }, process: { env: {} },
      fetch: () => { throw new Error('Unexpected network access'); },
      require: (id: string) => {
        if (id in stubs) return stubs[id];
        if (id === 'zod') return require('zod');
        if (id.startsWith('.') || id.startsWith('@/lib/notifications') || id === '@/lib/validators') {
          const path = id.startsWith('@/') ? resolve('src', id.slice(2)) : resolve(dirname(filename), id);
          return load(existsSync(`${path}.ts`) ? `${path}.ts` : `${path}/index.ts`);
        }
        throw new Error(`Unstubbed import: ${id}`);
      },
      ...globals,
    }, { filename });
    return module.exports;
  }
  return load;
}
