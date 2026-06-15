import type { FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeAny, output } from "zod";

/** Parses input with a zod schema, sending a 400 with details on failure. */
export function parse<S extends ZodTypeAny>(
  schema: S,
  data: unknown,
  reply: FastifyReply,
): output<S> | undefined {
  const result = schema.safeParse(data);
  if (!result.success) {
    reply.code(400).send({
      error: "validation_error",
      issues: result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
    return undefined;
  }
  return result.data;
}

export function clientIp(request: FastifyRequest): string {
  return request.ip;
}

export function userAgent(request: FastifyRequest): string | null {
  const ua = request.headers["user-agent"];
  return typeof ua === "string" ? ua.slice(0, 512) : null;
}
