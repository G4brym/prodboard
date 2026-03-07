export const TAILWIND_SCRIPT = `<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>`;

export const THEME = `
<style type="text/tailwindcss">
@theme {
  --color-border: oklch(0.3 0 0);
  --color-input: oklch(0.3 0 0);
  --color-ring: oklch(0.55 0 0);
  --color-background: oklch(0.13 0 0);
  --color-foreground: oklch(0.93 0 0);
  --color-card: oklch(0.16 0 0);
  --color-card-foreground: oklch(0.93 0 0);
  --color-muted: oklch(0.21 0 0);
  --color-muted-foreground: oklch(0.55 0 0);
  --color-accent: oklch(0.21 0 0);
  --color-accent-foreground: oklch(0.93 0 0);
  --color-destructive: oklch(0.55 0.2 25);
  --color-primary: oklch(0.93 0 0);
  --color-primary-foreground: oklch(0.13 0 0);
  --color-secondary: oklch(0.21 0 0);
  --color-secondary-foreground: oklch(0.93 0 0);
  --radius-lg: 0.5rem;
  --radius-md: calc(var(--radius-lg) - 2px);
  --radius-sm: calc(var(--radius-lg) - 4px);
}
</style>
`;

export const STYLES = `
body {
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
`;
