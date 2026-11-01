/** PrismaPg serializes DateTime without an offset; every session must use UTC. */
export function prismaConnection(connectionString: string) {
  const url = new URL(connectionString);
  const options = url.searchParams.get('options') || '';
  url.searchParams.set('options', `${options} -c timezone=UTC`.trim());
  return { connectionString: url.toString() };
}
