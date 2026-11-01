/** Gioi han bo gom ket noi cua pg; script/seed bo trong thi dung mac dinh cua pg (10, cho mai). */
export interface PoolLimits {
  max?: number;
  connectionTimeoutMillis?: number;
}

/** PrismaPg serializes DateTime without an offset; every session must use UTC. */
export function prismaConnection(connectionString: string, pool: PoolLimits = {}) {
  const url = new URL(connectionString);
  const options = url.searchParams.get('options') || '';
  url.searchParams.set('options', `${options} -c timezone=UTC`.trim());
  return { connectionString: url.toString(), ...pool };
}
