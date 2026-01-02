import { config as loadEnv } from "dotenv";
import { z } from "zod";

// Load environment variables
loadEnv();

const configSchema = z
  .object({
    // Karakeep
    karakeepUrl: z.string().url(),
    karakeepApiKey: z.string().min(1),

    // LLM - at least one must be provided
    anthropicApiKey: z.string().optional(),
    ollamaUrl: z.string().url().optional(),
    ollamaModel: z.string().default("llama3"),

    // SMTP
    smtpHost: z.string().min(1),
    smtpPort: z.coerce.number().int().positive(),
    smtpUser: z.string().min(1),
    smtpPass: z.string().min(1),
    smtpSecure: z.coerce.boolean().default(true),

    // Email addresses
    emailFrom: z.string().email(),
    emailTo: z.string().min(1), // Can be comma-separated

    // Digest configuration
    priorityTags: z.string().default("important,work,reference"),
    cronSchedule: z.string().default("0 8 * * 0"), // Sunday at 8am
    runMode: z.enum(["cli", "daemon"]).default("cli"),

    // Optional: Karakeep URL for email footer
    karakeepPublicUrl: z.string().url().optional(),
  })
  .refine((data) => data.anthropicApiKey || data.ollamaUrl, {
    message: "Either ANTHROPIC_API_KEY or OLLAMA_URL must be provided",
  });

function loadConfig() {
  const result = configSchema.safeParse({
    karakeepUrl: process.env.KARAKEEP_URL,
    karakeepApiKey: process.env.KARAKEEP_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    ollamaUrl: process.env.OLLAMA_URL,
    ollamaModel: process.env.OLLAMA_MODEL,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    smtpSecure: process.env.SMTP_SECURE,
    emailFrom: process.env.EMAIL_FROM,
    emailTo: process.env.EMAIL_TO,
    priorityTags: process.env.PRIORITY_TAGS,
    cronSchedule: process.env.CRON_SCHEDULE,
    runMode: process.env.RUN_MODE,
    karakeepPublicUrl: process.env.KARAKEEP_PUBLIC_URL,
  });

  if (!result.success) {
    console.error("Configuration validation failed:");
    result.error.issues.forEach((issue) => {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    });
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();

/**
 * Get priority tags as an array
 */
export function getPriorityTags(): string[] {
  return config.priorityTags
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Determine which LLM provider to use
 */
export function getLLMProvider(): "anthropic" | "ollama" {
  return config.anthropicApiKey ? "anthropic" : "ollama";
}

/**
 * Get email recipients as array
 */
export function getEmailRecipients(): string[] {
  return config.emailTo
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}
