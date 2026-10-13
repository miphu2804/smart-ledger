const RELATIVE = /^(\.{1,2}\/|\/|file:)/;

export async function resolve(specifier, context, next) {
  if (RELATIVE.test(specifier) && specifier.endsWith('.json')) {
    const out = await next(specifier, context);
    return { ...out, importAttributes: { ...context.importAttributes, type: 'json' } };
  }
  try {
    return await next(specifier, context);
  } catch (e) {
    if (!RELATIVE.test(specifier) || !['ERR_MODULE_NOT_FOUND', 'ERR_UNSUPPORTED_DIR_IMPORT'].includes(e?.code)) throw e;
    for (const suffix of ['.ts', '.tsx', '/index.ts']) {
      try {
        return await next(specifier + suffix, context);
      } catch {
        // thử đuôi kế tiếp
      }
    }
    throw e;
  }
}
