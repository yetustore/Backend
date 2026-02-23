export const parseDurationToMs = (value, fallbackMs) => {
  if (!value || typeof value !== 'string') return fallbackMs;
  const match = value.trim().match(/^(\d+)([smhd])$/i);
  if (!match) return fallbackMs;
  const num = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return num * (multipliers[unit] || 1);
};
