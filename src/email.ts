import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";
import nodemailer from "nodemailer";

import { config, getEmailRecipients } from "./config.js";
import type { SummarizedDigest } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "..", "templates");

/**
 * Format date as "January 2, 2026"
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Load and compile Handlebars template
 */
function loadTemplate(): HandlebarsTemplateDelegate {
  const templatePath = join(TEMPLATES_DIR, "digest.html");
  const templateSource = readFileSync(templatePath, "utf-8");

  // Register helper to generate Karakeep deep link URLs
  const baseUrl = config.karakeepUrl;
  Handlebars.registerHelper("karakeepLink", (bookmarkId: string) => {
    return `${baseUrl}/reader/${bookmarkId}`;
  });

  return Handlebars.compile(templateSource);
}

/**
 * Generate Karakeep deep link URL for a bookmark
 */
function getKarakeepLink(bookmarkId: string): string {
  const baseUrl = config.karakeepUrl;
  return `${baseUrl}/reader/${bookmarkId}`;
}

/**
 * Generate plain text version of the digest
 */
function generatePlainText(digest: SummarizedDigest): string {
  const lines: string[] = [];

  lines.push("YOUR WEEKLY KARAKEEP DIGEST");
  lines.push(`${digest.stats.totalUnread} unread items - ${formatDate(digest.stats.generatedAt)}`);
  lines.push("");
  lines.push("=".repeat(50));
  lines.push("");

  if (digest.recentlySaved.length > 0) {
    lines.push("HOT OFF THE PRESS");
    lines.push("Your latest finds from the past month");
    lines.push("-".repeat(20));
    for (const item of digest.recentlySaved) {
      lines.push(`* ${item.title}`);
      const readTimePart = item.readTime ? `${item.readTime} min read | ` : "";
      lines.push(`  ${readTimePart}Saved ${item.daysAgo} days ago | ${item.source}`);
      lines.push(`  ${getKarakeepLink(item.id)}`);
      lines.push(`  ${item.aiSummary}`);
      lines.push("");
    }
    lines.push("");
  }

  if (digest.buriedTreasure.length > 0) {
    lines.push("BURIED TREASURE");
    lines.push("Saved 30+ days ago, still unread");
    lines.push("-".repeat(20));
    for (const item of digest.buriedTreasure) {
      lines.push(`* ${item.title}`);
      const readTimePart = item.readTime ? `${item.readTime} min read | ` : "";
      lines.push(`  ${readTimePart}Saved ${item.daysAgo} days ago | ${item.source}`);
      lines.push(`  ${getKarakeepLink(item.id)}`);
      lines.push(`  ${item.aiSummary}`);
      lines.push("");
    }
    lines.push("");
  }

  if (digest.thisMonthLastYear.length > 0) {
    lines.push("THROWBACK: ONE YEAR AGO");
    lines.push("What you were reading this time last year");
    lines.push("-".repeat(20));
    for (const item of digest.thisMonthLastYear) {
      lines.push(`* ${item.title}`);
      const readTimePart = item.readTime ? `${item.readTime} min read | ` : "";
      lines.push(`  ${readTimePart}Saved ${item.daysAgo} days ago | ${item.source}`);
      lines.push(`  ${getKarakeepLink(item.id)}`);
      lines.push(`  ${item.aiSummary}`);
      lines.push("");
    }
    lines.push("");
  }

  if (digest.tagRoundup) {
    lines.push(`${digest.tagRoundup.tag.toUpperCase()} ROUNDUP`);
    lines.push("-".repeat(20));
    lines.push(digest.tagRoundup.synthesis.overview);
    lines.push("");
    lines.push("Key insights:");
    for (const insight of digest.tagRoundup.synthesis.keyInsights) {
      lines.push(`  - ${insight}`);
    }
    lines.push("");
    lines.push(`Standout: ${digest.tagRoundup.synthesis.standout}`);
    lines.push("");
    lines.push("Articles:");
    for (const item of digest.tagRoundup.bookmarks) {
      lines.push(`  * ${item.title}`);
      const readTimePart = item.readTime ? `${item.readTime} min | ` : "";
      lines.push(`    ${readTimePart}${item.daysAgo}d ago | ${item.source}`);
      lines.push(`    ${getKarakeepLink(item.id)}`);
    }
    lines.push("");
  }

  if (digest.randomPick) {
    lines.push("RANDOM PICK");
    lines.push("-".repeat(20));
    lines.push(`* ${digest.randomPick.title}`);
    const readTimePart = digest.randomPick.readTime
      ? `${digest.randomPick.readTime} min read | `
      : "";
    lines.push(
      `  ${readTimePart}Saved ${digest.randomPick.daysAgo} days ago | ${digest.randomPick.source}`
    );
    lines.push(`  ${getKarakeepLink(digest.randomPick.id)}`);
    lines.push(`  ${digest.randomPick.aiSummary}`);
    lines.push("");
  }

  if (digest.fromTheArchives) {
    lines.push("FROM THE ARCHIVES");
    lines.push("A forgotten gem from your archived collection");
    lines.push("-".repeat(20));
    lines.push(`* ${digest.fromTheArchives.title}`);
    const readTimePart = digest.fromTheArchives.readTime
      ? `${digest.fromTheArchives.readTime} min read | `
      : "";
    lines.push(
      `  ${readTimePart}Saved ${digest.fromTheArchives.daysAgo} days ago | ${digest.fromTheArchives.source}`
    );
    lines.push(`  ${getKarakeepLink(digest.fromTheArchives.id)}`);
    lines.push(`  ${digest.fromTheArchives.aiSummary}`);
    lines.push("");
  }

  lines.push("=".repeat(50));
  lines.push("Generated by Karakeep Digest");

  if (config.karakeepUrl) {
    lines.push(`Open Karakeep: ${config.karakeepUrl}`);
  }

  return lines.join("\n");
}

/**
 * Render digest to HTML
 */
export function renderDigest(digest: SummarizedDigest): {
  html: string;
  plainText: string;
} {
  const template = loadTemplate();

  const context = {
    ...digest,
    totalUnread: digest.stats.totalUnread,
    formattedDate: formatDate(digest.stats.generatedAt),
    karakeepUrl: config.karakeepUrl,
  };

  const html = template(context);
  const plainText = generatePlainText(digest);

  return { html, plainText };
}

/**
 * Create SMTP transport
 * Auto-detects secure mode based on port if not explicitly configured:
 * - Port 465: implicit TLS (secure: true)
 * - Port 587/25: STARTTLS (secure: false, nodemailer upgrades automatically)
 */
function createTransport(): nodemailer.Transporter {
  // Auto-detect secure mode if not explicitly set
  const secure = config.smtpSecure !== undefined ? config.smtpSecure : config.smtpPort === 465;

  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  });
}

/**
 * Send the digest email
 */
export async function sendDigest(html: string, plainText: string): Promise<string> {
  const transport = createTransport();
  const recipients = getEmailRecipients();

  console.log(`Sending digest to ${recipients.join(", ")}...`);

  const info = await transport.sendMail({
    from: config.emailFrom,
    to: recipients.join(", "),
    subject: `Your Weekly Karakeep Digest - ${formatDate(new Date())}`,
    text: plainText,
    html,
  });

  console.log(`Email sent: ${info.messageId}`);
  return info.messageId;
}

/**
 * Verify SMTP connection
 */
export async function verifySmtpConnection(): Promise<boolean> {
  try {
    const transport = createTransport();
    await transport.verify();
    return true;
  } catch (error) {
    console.error("SMTP verification failed:", (error as Error).message);
    return false;
  }
}
