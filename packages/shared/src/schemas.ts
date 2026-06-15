import { z } from "zod";
import { ALL_PROCESS_ACTIONS } from "./rbac.js";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254);

export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(256)
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /[0-9]/.test(v), {
    message: "Password needs lower, upper, and a digit",
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: passwordSchema,
});

export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  role: z.string().min(1).max(64),
});

export const updateUserSchema = z.object({
  role: z.string().min(1).max(64).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export const resetPasswordSchema = z.object({
  newPassword: passwordSchema,
});

export const processActionSchema = z.enum([
  "start",
  "stop",
  "restart",
  "reload",
  "delete",
]);

export const processNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[^\0\n\r/]+$/, "Invalid process name");

export const bulkActionSchema = z.object({
  action: processActionSchema,
  names: z.array(processNameSchema).min(1).max(100),
});

export const grantActionSchema = z.enum(
  ALL_PROCESS_ACTIONS as [string, ...string[]],
);

export const setPermissionsSchema = z.object({
  grants: z
    .array(
      z.object({
        processName: processNameSchema,
        actions: z.array(grantActionSchema).max(ALL_PROCESS_ACTIONS.length),
      }),
    )
    .max(500),
});

/** Assign (or update/remove) a single user's access to one process. */
export const processAccessSchema = z.object({
  userId: z.number().int().positive(),
  actions: z.array(grantActionSchema).max(ALL_PROCESS_ACTIONS.length),
});

export const metricsQuerySchema = z.object({
  window: z.enum(["1h", "24h", "7d", "30d"]).default("1h"),
});

export const logsQuerySchema = z.object({
  stream: z.enum(["out", "err", "all"]).default("all"),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
  cursor: z.string().optional(),
  q: z.string().max(512).optional(),
  level: z.enum(["info", "warn", "error", "debug", "all"]).default("all"),
});

export const auditQuerySchema = z.object({
  actor: z.string().optional(),
  action: z.string().optional(),
  from: z.coerce.number().optional(),
  to: z.coerce.number().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type SetPermissionsInput = z.infer<typeof setPermissionsSchema>;
export type LogsQuery = z.infer<typeof logsQuerySchema>;
export type MetricsQuery = z.infer<typeof metricsQuerySchema>;
