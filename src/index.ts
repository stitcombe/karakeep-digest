import cron from "node-cron";

import { config } from "./config.js";
import { categorize, filterSufficientContent } from "./categorizer.js";
import { renderDigest, sendDigest, verifySmtpConnection } from "./email.js";
import { fetchArchivedBookmarks, fetchBookmarks, fetchThisMonthLastYear } from "./karakeep.js";
import { summarizeSections } from "./summarizer.js";

/**
 * Main digest generation and sending flow
 */
async function generateAndSendDigest(): Promise<void> {
  console.log("Starting Karakeep Digest...");
  const startTime = Date.now();

  try {
    // 1. Fetch all unread bookmarks
    console.log("Fetching unread bookmarks from Karakeep...");
    const bookmarks = await fetchBookmarks({ archived: false });
    console.log(`Fetched ${bookmarks.length} unread bookmarks`);
    const validBookmarks = filterSufficientContent(bookmarks);
    console.log(`  (${validBookmarks.length} with sufficient content for summarization)`);

    if (bookmarks.length === 0) {
      console.log("No unread bookmarks found. Skipping digest.");
      return;
    }

    // 2. Fetch historical bookmarks for "This Month Last Year"
    console.log("Fetching historical bookmarks...");
    const lastYearBookmarks = await fetchThisMonthLastYear();
    console.log(
      `Found ${lastYearBookmarks.length} bookmarks from this month last year`
    );
    const validLastYear = filterSufficientContent(lastYearBookmarks);
    console.log(`  (${validLastYear.length} with sufficient content)`);

    // 3. Fetch archived bookmarks for "From the Archives"
    console.log("Fetching archived bookmarks...");
    const archivedBookmarks = await fetchArchivedBookmarks();
    console.log(`Found ${archivedBookmarks.length} archived bookmarks`);
    const validArchived = filterSufficientContent(archivedBookmarks);
    console.log(`  (${validArchived.length} with sufficient content)`);

    // 4. Categorize into digest sections
    console.log("Categorizing bookmarks...");
    const sections = categorize(bookmarks, lastYearBookmarks, archivedBookmarks);

    console.log("Sections created:");
    console.log(`  - Recently Saved: ${sections.recentlySaved.length} items`);
    console.log(`  - Buried Treasure: ${sections.buriedTreasure.length} items`);
    console.log(
      `  - This Month Last Year: ${sections.thisMonthLastYear.length} items`
    );
    console.log(
      `  - Tag Roundup: ${sections.tagRoundup ? `${sections.tagRoundup.bookmarks.length} items (${sections.tagRoundup.tag})` : "none"}`
    );
    console.log(`  - Random Pick: ${sections.randomPick ? "yes" : "no"}`);
    console.log(`  - From the Archives: ${sections.fromTheArchives ? "yes" : "no"}`);

    // 5. Generate AI summaries for each section
    const summarized = await summarizeSections(sections);

    // 6. Render email
    console.log("Rendering email...");
    const { html, plainText } = renderDigest(summarized);

    // 7. Send email
    const messageId = await sendDigest(html, plainText);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Digest completed successfully in ${duration}s`);
    console.log(`Message ID: ${messageId}`);
  } catch (error) {
    console.error("Digest generation failed:", error);
    throw error;
  }
}

/**
 * Run in CLI mode (single execution)
 */
async function runCli(): Promise<void> {
  try {
    await generateAndSendDigest();
    process.exit(0);
  } catch {
    process.exit(1);
  }
}

/**
 * Run in daemon mode (scheduled execution)
 */
function runDaemon(): void {
  console.log(`Karakeep Digest daemon starting...`);
  console.log(`Schedule: ${config.cronSchedule}`);

  // Verify SMTP connection on startup
  verifySmtpConnection().then((ok) => {
    if (ok) {
      console.log("SMTP connection verified");
    } else {
      console.warn("SMTP verification failed - emails may not send");
    }
  });

  // Validate cron expression
  if (!cron.validate(config.cronSchedule)) {
    console.error(`Invalid cron schedule: ${config.cronSchedule}`);
    process.exit(1);
  }

  // Schedule the digest
  cron.schedule(config.cronSchedule, () => {
    console.log(`\n[${new Date().toISOString()}] Scheduled run triggered`);
    generateAndSendDigest().catch((error) => {
      console.error("Scheduled digest failed:", error);
    });
  });

  console.log("Daemon running. Waiting for scheduled time...");
  console.log("Press Ctrl+C to stop");

  // Keep the process alive
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\nShutting down...");
    process.exit(0);
  });
}

/**
 * Entry point
 */
function main(): void {
  console.log("Karakeep Digest v1.0.0");
  console.log(`Mode: ${config.runMode}`);
  console.log("");

  if (config.runMode === "daemon") {
    runDaemon();
  } else {
    runCli();
  }
}

main();
