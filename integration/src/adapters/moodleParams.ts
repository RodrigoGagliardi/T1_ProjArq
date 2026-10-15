/**
 * Moodle Web Services REST espera parametros em notacao de array estilo PHP
 * (ex: courses[0][fullname]=Turma+A). Esta funcao achata um objeto/array JS
 * aninhado nesse formato, para ser enviado como application/x-www-form-urlencoded.
 */
export function flattenMoodleParams(value: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};

  function walk(val: unknown, path: string) {
    if (val === null || val === undefined) return;
    if (Array.isArray(val)) {
      val.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (typeof val === "object") {
      for (const [key, nested] of Object.entries(val as Record<string, unknown>)) {
        walk(nested, path ? `${path}[${key}]` : key);
      }
      return;
    }
    out[path] = String(val);
  }

  walk(value, prefix);
  return out;
}
