export function connectionTicket(value: string): string | null {
  try {
    const url = new URL(value);
    const ticket = url.searchParams.get('ticket');
    if (
      url.protocol !== 'koshirme:' ||
      url.hostname !== 'connect' ||
      url.port ||
      url.username ||
      url.password ||
      (url.pathname && url.pathname !== '/') ||
      url.hash ||
      [...url.searchParams.keys()].join(',') !== 'ticket' ||
      !ticket ||
      !/^[A-Za-z0-9_-]{43}$/.test(ticket)
    )
      return null;
    return ticket;
  } catch {
    return null;
  }
}
