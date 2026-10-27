import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the actual routes with fake auth, database and network boundaries.
// Transpilation lets regression tests run even before the PR's type errors are fixed.
export function load(file: string, mocks: Record<string, unknown>, globals = {}) {
  const cache = new Map<string, { exports: any }>();
  function visit(filename: string): any {
    const path = resolve(filename);
    if (cache.has(path)) return cache.get(path)!.exports;
    const module = { exports: {} };
    cache.set(path, module);
    const code = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const localRequire = (name: string): any => {
      if (name in mocks) return mocks[name];
      if (name.startsWith('@/') || name.startsWith('.')) {
        const base = name.startsWith('@/') ? resolve('src', name.slice(2)) : resolve(dirname(path), name);
        return visit(existsSync(`${base}.ts`) ? `${base}.ts` : `${base}/index.ts`);
      }
      // Fail closed if a test accidentally reaches a real network boundary.
      if (['https', 'http', 'dns', 'dns/promises', 'net'].includes(name.replace(/^node:/, '')) && !name.endsWith('net')) {
        throw new Error('Unstubbed network module');
      }
      return require(name);
    };
    runInNewContext(code, {
      module, exports: module.exports, require: localRequire, URL, Buffer, AbortSignal,
      console: { error() {} }, setTimeout: (fn: () => void) => { fn(); },
      fetch: () => { throw new Error('Unstubbed fetch'); }, ...globals,
    }, { filename: path });
    return module.exports;
  }
  return visit(file);
}
