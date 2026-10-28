import { z } from "zod";

const envSchema = z.object({
  IEDUCAR_BASE_URL: z.string().url(),
  IEDUCAR_API_TOKEN: z.string().min(1, "IEDUCAR_API_TOKEN é obrigatório (gere com: php artisan admin:token)"),
  MOODLE_BASE_URL: z.string().url(),
  MOODLE_HOST_HEADER: z.string().min(1).optional(),
  MOODLE_WS_TOKEN: z.string().min(1, "MOODLE_WS_TOKEN é obrigatório (gere em Administração do site > Web services > Gerenciar tokens)"),
  MOODLE_CATEGORY_ID: z.coerce.number().int().positive().default(1),
  ACTIVE_YEAR: z.coerce.number().int().default(new Date().getFullYear()),
  POLL_INTERVAL_SECONDS: z.coerce.number().int().positive().default(30),
  PORT: z.coerce.number().int().positive().default(3000),
  DB_PATH: z.string().default("/app/data/integration.db"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuração inválida:\n${issues}`);
  }
  return parsed.data;
}
