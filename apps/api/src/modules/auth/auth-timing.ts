export type AuthDurationUnit = 's' | 'm' | 'h' | 'd';
export type AuthDuration = `${number}${AuthDurationUnit}`;

const durationPattern = /^(?<amount>[1-9]\d*)(?<unit>[smhd])$/u;

const unitMilliseconds: Record<AuthDurationUnit, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Converts the restricted duration grammar used by Auth configuration to milliseconds. */
export function durationToMilliseconds(duration: string): number {
  const match = durationPattern.exec(duration);
  if (!match?.groups) throw new Error(`Auth duration khong hop le: ${duration}`);

  const amount = Number(match.groups.amount);
  const unit = match.groups.unit as AuthDurationUnit;
  return amount * unitMilliseconds[unit];
}
