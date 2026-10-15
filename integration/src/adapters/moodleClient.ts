import axios, { type AxiosInstance } from "axios";
import type { Logger } from "../logger.js";
import { flattenMoodleParams } from "./moodleParams.js";

export const MOODLE_ROLE = {
  TEACHER: 3,
  STUDENT: 5,
} as const;

export class MoodleApiError extends Error {
  constructor(public readonly errorcode: string, message: string) {
    super(`Moodle webservice error [${errorcode}]: ${message}`);
  }
}

export interface MoodleCourseInput {
  fullname: string;
  shortname: string;
  categoryid: number;
  idnumber?: string;
  summary?: string;
}

export interface MoodleUserInput {
  username: string;
  password: string;
  firstname: string;
  lastname: string;
  email: string;
  idnumber: string;
}

export interface MoodleClientOptions {
  baseUrl: string;
  token: string;
  logger: Logger;
}

/**
 * Cliente para o protocolo REST dos Web Services do Moodle
 * (admin/webservice/ - ver readme publicado na Entrega 1).
 */
export class MoodleClient {
  private readonly http: AxiosInstance;
  private readonly logger: Logger;
  private readonly token: string;

  constructor(opts: MoodleClientOptions) {
    this.logger = opts.logger;
    this.token = opts.token;
    this.http = axios.create({
      baseURL: opts.baseUrl,
      timeout: 15_000,
    });
  }

  async call<T>(wsfunction: string, params: Record<string, unknown> = {}): Promise<T> {
    const body = new URLSearchParams({
      wstoken: this.token,
      wsfunction,
      moodlewsrestformat: "json",
      ...flattenMoodleParams(params),
    });

    const { data } = await this.http.post<T | { exception: string; errorcode: string; message: string }>(
      "/webservice/rest/server.php",
      body,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );

    if (data && typeof data === "object" && "exception" in data) {
      this.logger.warn({ wsfunction, data }, "moodle webservice returned an error");
      throw new MoodleApiError(data.errorcode, data.message);
    }
    return data as T;
  }

  async createCourse(input: MoodleCourseInput): Promise<{ id: number; shortname: string }> {
    const result = await this.call<Array<{ id: number; shortname: string }>>("core_course_create_courses", {
      courses: [input],
    });
    return result[0];
  }

  async updateCourse(id: number, input: Partial<MoodleCourseInput>): Promise<void> {
    await this.call("core_course_update_courses", { courses: [{ id, ...input }] });
  }

  async findCourseByShortname(shortname: string): Promise<{ id: number; shortname: string } | null> {
    const result = await this.call<{ courses: Array<{ id: number; shortname: string }> }>(
      "core_course_get_courses_by_field",
      { field: "shortname", value: shortname },
    );
    return result.courses[0] ?? null;
  }

  async findUserByIdNumber(idnumber: string): Promise<{ id: number } | null> {
    const result = await this.call<{ users: Array<{ id: number }> }>("core_user_get_users", {
      criteria: [{ key: "idnumber", value: idnumber }],
    });
    return result.users[0] ?? null;
  }

  async createUser(input: MoodleUserInput): Promise<{ id: number }> {
    const result = await this.call<Array<{ id: number }>>("core_user_create_users", {
      users: [{ ...input, auth: "manual" }],
    });
    return result[0];
  }

  async enrolUser(courseId: number, userId: number, roleId: number): Promise<void> {
    await this.call("enrol_manual_enrol_users", {
      enrolments: [{ roleid: roleId, userid: userId, courseid: courseId }],
    });
  }

  async getEnrolledUserIds(courseId: number): Promise<Set<number>> {
    const result = await this.call<Array<{ id: number }>>("core_enrol_get_enrolled_users", {
      courseid: courseId,
    });
    return new Set(result.map((u) => u.id));
  }
}
