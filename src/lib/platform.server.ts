import { headers } from 'next/headers';
import { isNativeUA } from './platform';

/**
 * Server-side native detection for React Server Components.
 * Reads the incoming request's User-Agent via `next/headers`.
 */
export async function isNativeRequest(): Promise<boolean> {
  const ua = (await headers()).get('user-agent');
  return isNativeUA(ua);
}
