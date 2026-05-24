// Identidade visual compartilhada entre os projetos da jornada gamedev.
// Mantenha em sincronia com os outros projetos — alterar aqui exige alterar nos demais.
// Paleta derivada de guilherme-pereira.dev.

export const COLORS = {
  bg: "#0a0a0a",
  bgSoft: "#141414",
  fg: "#f5f1ea",
  accent: "#ff4500",
  accentGlow: "rgba(255, 69, 0, 0.35)",
  secondary: "#00d4ff",
  amber: "#fbbf24",
  success: "#7ad17a",
  danger: "#ef4444",
  muted: "#8a857c",
  border: "#1f1f1f",
} as const;

export const COLOR_HEX = {
  bg: 0x0a0a0a,
  bgSoft: 0x141414,
  fg: 0xf5f1ea,
  accent: 0xff4500,
  secondary: 0x00d4ff,
  amber: 0xfbbf24,
  success: 0x7ad17a,
  danger: 0xef4444,
  muted: 0x8a857c,
  border: 0x1f1f1f,
} as const;

export const FONTS = {
  display: '"Bricolage Grotesque", system-ui, sans-serif',
  mono: '"Geist Mono", "JetBrains Mono", monospace',
} as const;

export const FONT_NAMES = {
  display: "Bricolage Grotesque",
  mono: "Geist Mono",
} as const;

export const FONT_SIZES = {
  hero: "96px",
  title: "72px",
  heading: "32px",
  body: "18px",
  ui: "14px",
  small: "12px",
} as const;
