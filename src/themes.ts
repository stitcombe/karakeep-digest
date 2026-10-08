import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";

const __dirname = dirname(fileURLToPath(import.meta.url));
const THEMES_DIR = join(__dirname, "..", "templates", "themes");
const TEMPLATE_FILE = "digest.html";
const PARTIALS_DIR = "partials";

export const DEFAULT_THEME = "base";

/**
 * List installed themes: every folder in templates/themes that has a digest.html
 */
export function listThemes(): string[] {
  if (!existsSync(THEMES_DIR)) return [];
  return readdirSync(THEMES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(THEMES_DIR, name, TEMPLATE_FILE)))
    .sort();
}

/**
 * Throw if the named theme is not installed
 */
export function assertThemeExists(name: string): void {
  const themes = listThemes();
  if (!themes.includes(name)) {
    throw new Error(
      `Unknown email theme "${name}". Available themes: ${themes.join(", ") || "(none found)"}`
    );
  }
}

/**
 * Register each partials/<name>.html as a partial called <name>
 */
function registerPartials(hbs: typeof Handlebars, themeDir: string): void {
  const partialsDir = join(themeDir, PARTIALS_DIR);
  if (!existsSync(partialsDir)) return;

  for (const file of readdirSync(partialsDir)) {
    if (extname(file) !== ".html") continue;
    const source = readFileSync(join(partialsDir, file), "utf-8");
    hbs.registerPartial(basename(file, ".html"), source);
  }
}

/**
 * Compile a theme's digest.html with the shared helpers and the theme's own partials.
 * Each theme gets its own Handlebars environment, so partial names never collide.
 */
export function loadTheme(name: string, karakeepUrl: string): HandlebarsTemplateDelegate {
  assertThemeExists(name);
  const themeDir = join(THEMES_DIR, name);
  const hbs = Handlebars.create();

  // Karakeep deep link for a bookmark
  hbs.registerHelper("karakeepLink", (bookmarkId: string) => `${karakeepUrl}/reader/${bookmarkId}`);
  // "1 day" / "4 days"
  hbs.registerHelper("plural", (count: number, unit: string) =>
    count === 1 ? `${count} ${unit}` : `${count} ${unit}s`
  );

  registerPartials(hbs, themeDir);

  const source = readFileSync(join(themeDir, TEMPLATE_FILE), "utf-8");
  return hbs.compile(source);
}
