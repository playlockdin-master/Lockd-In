// Single source of truth lives in @shared/schema — re-exported here for convenience.
import { validatePlayerNameShared } from '@shared/schema';

/** Returns an error string if invalid, null if valid */
export function validatePlayerName(raw: string): string | null {
  return validatePlayerNameShared(raw);
}
