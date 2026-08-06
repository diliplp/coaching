// Backend counterpart of frontend/src/config/branding.ts — same shape, read from
// process.env at runtime (no build step involved on this side). Defaults are
// Brainwave's current real values so an unconfigured deploy behaves identically
// to today. New clients override via their own .env — see backend/.env.example.
export const BRANDING = {
  instituteName: process.env.INSTITUTE_NAME ?? "Brainwave Science Academy",
  shortName: process.env.INSTITUTE_SHORT_NAME ?? "BSA",
  tagline: process.env.INSTITUTE_TAGLINE ?? "Excellence in Education • Performance Analysis Portal",
};
