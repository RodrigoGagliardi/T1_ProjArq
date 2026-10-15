import axios, { type AxiosInstance } from "axios";
import type { Logger } from "../logger.js";
import type {
  IEducarRegistrationDTO,
  IEducarSchoolClassDTO,
  LaravelPaginatedResponse,
} from "../domain/types.js";

export interface IEducarClientOptions {
  baseUrl: string;
  token: string;
  logger: Logger;
  pageSize?: number;
}

/**
 * Cliente HTTP para a API REST (somente leitura) ja existente do iEducar.
 * Ver routes/api.php - as rotas usam auth:sanctum, autenticacao por Bearer token
 * (nao ha endpoint de login; o token e gerado via `php artisan admin:token`).
 */
export class IEducarClient {
  private readonly http: AxiosInstance;
  private readonly logger: Logger;
  private readonly pageSize: number;

  constructor(opts: IEducarClientOptions) {
    this.logger = opts.logger;
    // Paginas pequenas por padrao: o endpoint com `include=enrollments` eager-carrega
    // o relacionamento por item, e medimos ~25s para 100 turmas contra a API ao vivo
    // (bem acima do timeout razoavel para um unico request). Paginas de 20 ficam na
    // casa de poucos segundos.
    this.pageSize = opts.pageSize ?? 20;
    this.http = axios.create({
      baseURL: opts.baseUrl,
      headers: {
        Authorization: `Bearer ${opts.token}`,
        Accept: "application/json",
      },
      timeout: 30_000,
    });
  }

  /** Itera todas as paginas de um endpoint paginado do iEducar, devolvendo a lista completa. */
  private async fetchAllPages<T>(path: string, params: Record<string, unknown>): Promise<T[]> {
    const results: T[] = [];
    let page = 1;
    while (true) {
      const response = await this.http.get<LaravelPaginatedResponse<T>>(path, {
        params: { ...params, show: this.pageSize, page },
      });
      results.push(...response.data.data);
      const { current_page, last_page } = response.data.meta;
      this.logger.debug({ path, current_page, last_page, count: response.data.data.length }, "fetched page");
      if (current_page >= last_page) break;
      page += 1;
    }
    return results;
  }

  /**
   * Busca turmas ativas de um ano, com as enturmacoes (matricula_turma) embutidas via
   * `include` (ver app/Http/Controllers/ResourceController.php::include) - confirmado
   * funcionando contra a API ao vivo.
   */
  async fetchActiveSchoolClasses(year: number): Promise<IEducarSchoolClassDTO[]> {
    return this.fetchAllPages<IEducarSchoolClassDTO>("/api/school-class", {
      active: 1,
      year_eq: year,
      include: "enrollments:ref_cod_matricula,ref_cod_turma,ativo",
    });
  }

  /**
   * NOTA: o filtro `?active=1` trava (timeout) o endpoint `/api/registration` nesta
   * versao do iEducar - confirmado contra a API ao vivo (bug pre-existente do
   * monolito, fora do escopo desta integracao). Por isso filtramos apenas por
   * `year_eq` no servidor e checamos o campo `ativo` do DTO no lado do cliente
   * (ver normalizeRegistration / Registration.active).
   */
  async fetchActiveRegistrations(year: number): Promise<IEducarRegistrationDTO[]> {
    return this.fetchAllPages<IEducarRegistrationDTO>("/api/registration", {
      year_eq: year,
    });
  }
}
