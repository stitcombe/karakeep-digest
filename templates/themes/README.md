# Email themes

Each folder here is a theme for the digest email. Pick one with `EMAIL_THEME` (default: `base`).

| Theme  | Look                                                                                        |
| ------ | ------------------------------------------------------------------------------------------- |
| `base` | The original Karakeep Digest styling                                                        |
| `nest` | The Loonlet Labs [Nest DS](https://github.com/loonlet-labs/nest-ds) brand, with dark mode    |

## Adding a theme

1. Create `templates/themes/<name>/digest.html`. The folder name is the theme name: lowercase letters, numbers
   and hyphens.
2. Optionally add Handlebars partials as `templates/themes/<name>/partials/<partial>.html` and use them with
   `{{> partial}}`. Partials belong to their theme, so two themes can each have an `item` partial.
3. Set `EMAIL_THEME=<name>` and run `pnpm dev`.

The app checks `EMAIL_THEME` at startup and exits with the list of installed themes if the folder is missing.
A theme only changes the HTML email. The plain-text version is shared by every theme.

### Email-safe markup

Write it like an email, not a web page: `<style>` in the head with literal colours (no CSS variables), tables
for anything side by side, and no flexbox or grid. Dark mode goes in a `@media (prefers-color-scheme: dark)`
block. Apple Mail and iOS Mail honour it; Gmail and Outlook show the light version. Web fonts load only in Apple
clients, so give every font a system fallback.

## Template context

Every theme gets the same data.

| Field               | Type                         | Notes                                                    |
| ------------------- | ---------------------------- | -------------------------------------------------------- |
| `recentlySaved`     | `Bookmark[]`                 | Hot Off the Press                                        |
| `buriedTreasure`    | `Bookmark[]`                 | Unread, 30+ days old                                     |
| `thisMonthLastYear` | `Bookmark[]`                 | Throwback                                                |
| `tagRoundup`        | object or `null`             | `tag`, `bookmarks`, `synthesis.overview`, `synthesis.keyInsights`, `synthesis.standout` |
| `randomPick`        | `Bookmark` or `null`         |                                                          |
| `fromTheArchives`   | `Bookmark` or `null`         |                                                          |
| `totalUnread`       | number                       | Unread bookmarks in Karakeep                             |
| `pickCount`         | number                       | Bookmarks across every section of this digest            |
| `totalReadMinutes`  | number                       | Sum of `readTime` across those bookmarks                 |
| `formattedDate`     | string                       | e.g. `October 4, 2026`                                   |
| `weekNumber`        | number                       | ISO week of the year                                     |
| `karakeepUrl`       | string                       | Base URL of your Karakeep instance                       |

Each `Bookmark` has `id`, `title`, `url`, `source` (domain), `aiSummary`, `daysAgo` and `readTime` (minutes;
`0` when unknown, so wrap it in `{{#if readTime}}`).

## Helpers

| Helper                    | Output                                         |
| ------------------------- | ---------------------------------------------- |
| `{{karakeepLink id}}`     | Link that opens the bookmark in Karakeep       |
| `{{plural daysAgo "day"}}`| `1 day`, `4 days`                              |
