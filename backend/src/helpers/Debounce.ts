const timeouts = new Map<number, NodeJS.Timeout>();

const findAndClearTimeout = (ticketId: number) => {
  const existingTimeout = timeouts.get(ticketId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
    timeouts.delete(ticketId);
  }
};

export const clearAllDebounces = () => {
  for (const [ticketId, timeout] of timeouts) {
    clearTimeout(timeout);
  }
  timeouts.clear();
};

export const debounce = (
  func: { (): Promise<void>; (...args: never[]): void },
  wait: number,
  ticketId: number
) => {
  return function executedFunction(...args: never[]): void {
    findAndClearTimeout(ticketId);

    const timeout = setTimeout(() => {
      timeouts.delete(ticketId);
      func(...args);
    }, wait);

    timeouts.set(ticketId, timeout);
  };
};
