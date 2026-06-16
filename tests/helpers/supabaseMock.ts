import { vi } from "vitest";

/**
 * Thenable proxy that resolves to `value` and records every method call.
 * Suporta tanto `await chain` quanto terminais `.maybeSingle()`/`.single()`/
 * `.limit()`. Cada método retorna o próprio proxy (permite reatribuição de
 * query) e fica registrado em `_calls` para asserções.
 */
export function chain(value: unknown) {
  const calls: { method: string; args: unknown[] }[] = [];
  const obj: Record<string, unknown> = {};
  const proxy: unknown = new Proxy(obj, {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => unknown) => resolve(value);
      }
      if (prop === "_calls") return calls;
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args });
        return proxy;
      };
    },
  });
  return proxy as Record<string, (...args: unknown[]) => unknown> & {
    _calls: { method: string; args: unknown[] }[];
  };
}

/**
 * Cliente Supabase falso que roteia chamadas `from(table)` por nome da
 * tabela E pela ordem da chamada dentro daquela tabela (1ª chamada →
 * builder[0], etc). O último builder é reutilizado se houver mais chamadas.
 */
export function fakeSupabase(routes: Record<string, Array<() => unknown>>) {
  const calls: Record<string, number> = {};
  return {
    from: vi.fn((table: string) => {
      const idx = calls[table] ?? 0;
      calls[table] = idx + 1;
      const builders = routes[table];
      if (!builders) throw new Error(`Unexpected table: ${table}`);
      const builder = builders[idx] ?? builders[builders.length - 1];
      return builder();
    }),
    _calls: () => calls,
  };
}
