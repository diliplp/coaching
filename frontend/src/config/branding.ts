// Single source of truth for institute-specific identity (name, logo, theme color).
// Defaults below are Brainwave's current real values, so an unconfigured build
// (no VITE_* overrides set) looks identical to today. New clients override via
// their own .env — see frontend/.env.example.
export const BRANDING = {
  instituteName: import.meta.env.VITE_INSTITUTE_NAME ?? "Brainwave Science Academy",
  shortName: import.meta.env.VITE_INSTITUTE_SHORT_NAME ?? "BSA",
  logoUrl: import.meta.env.VITE_LOGO_URL ?? "/logo.jpeg",
  tagline: import.meta.env.VITE_INSTITUTE_TAGLINE ?? "Excellence in Education • Performance Analysis Portal",
  admissionLabel: import.meta.env.VITE_ADMISSION_LABEL ?? "BSA Classes 11-12",
  primaryColor: import.meta.env.VITE_PRIMARY_COLOR ?? "#0f766e",
  primaryColorDark: import.meta.env.VITE_PRIMARY_COLOR_DARK ?? "#0d5e57",
  primaryColorLight: import.meta.env.VITE_PRIMARY_COLOR_LIGHT ?? "#ccfbf1",
} as const;
