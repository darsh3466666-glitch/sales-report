export function createServerFn(_opts?: any) {
  const builder = {
    inputValidator: (_schema?: any) => builder,
    validator: (_schema?: any) => builder,
    handler: (fn: any) => fn,
  };
  return builder;
}

export function useServerFn(fn: any) {
  return fn;
}
