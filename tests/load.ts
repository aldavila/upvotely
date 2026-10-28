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
        if (['zod', 'node:crypto'].includes(id)) return require(id);
        if (id.startsWith('.') || id.startsWith('@/lib/notifications') || ['@/lib/validators', '@/lib/public-payloads', '@/lib/status-notification-policy', '@/lib/unsubscribe-token'].includes(id)) {
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
