const STORAGE_KEY = 'cinema.userId';

function generateUserId(): string {
  return `user-${Math.random().toString(36).slice(2, 8)}`;
}

// No auth in this system (see README assumptions) — userId is a self-declared identifier,
// generated once and persisted so a reload doesn't silently switch "who you are".
export function getOrCreateUserId(): string {
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const id = generateUserId();
  window.localStorage.setItem(STORAGE_KEY, id);
  return id;
}

export function persistUserId(id: string): void {
  window.localStorage.setItem(STORAGE_KEY, id);
}
