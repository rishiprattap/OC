import CookieManager from '@react-native-cookies/cookies';
import * as SecureStore from 'expo-secure-store';
import { assertPublicRoute, registrationEventId, validateBaseUrl } from './policy';
import type {
  Event,
  User,
  Registration,
  RegistrationResult,
  GalleryImage,
  Certificate,
} from '../types';

export const API_URL = validateBaseUrl(
  process.env.EXPO_PUBLIC_API_URL || 'https://offstagecreators.in',
  __DEV__,
);
const SESSION_KEY = 'oc.session.v1';
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
export function assetUrl(path?: string) {
  if (!path) return undefined;
  if (/^data:image\/(png|jpeg|webp);base64,/.test(path)) return path;
  const url = new URL(path, API_URL);
  if (url.protocol !== 'https:' && !(__DEV__ && url.origin === API_URL)) return undefined;
  return url.toString();
}
export async function restoreSession() {
  const saved = await SecureStore.getItemAsync(SESSION_KEY);
  if (!saved) {
    await CookieManager.clearAll();
    return;
  }
  try {
    const { value, expires, origin } = JSON.parse(saved);
    if (origin !== API_URL || Date.parse(expires) <= Date.now()) {
      await clearSession();
      return;
    }
    await CookieManager.set(API_URL, {
      name: 'oc.sid',
      value,
      path: '/',
      secure: API_URL.startsWith('https:'),
      httpOnly: true,
      expires,
    });
  } catch {
    await clearSession();
  }
}
export async function persistSession() {
  const cookie = (await CookieManager.get(API_URL))['oc.sid'];
  if (!cookie?.value)
    throw new Error('The server did not establish a session. Please try signing in again.');
  await SecureStore.setItemAsync(
    SESSION_KEY,
    JSON.stringify({
      value: cookie.value,
      origin: API_URL,
      expires: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    }),
  );
  await CookieManager.flush();
}
export async function clearSession() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
  await CookieManager.clearAll();
  await CookieManager.flush();
}
export async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  assertPublicRoute(path, method);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const multipart = body instanceof FormData;
    const response = await fetch(API_URL + path, {
      method,
      credentials: 'include',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body && !multipart ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
    });
    if (!(response.headers.get('content-type') || '').includes('application/json'))
      throw new ApiError(
        'The Offstage Creators service is temporarily unavailable. Please try again later.',
        response.status,
      );
    const data = await response.json();
    if (!response.ok || data.success === false)
      throw new ApiError(
        typeof data.error === 'string'
          ? data.error
          : response.status >= 500 || response.status === 402
            ? 'The Offstage Creators service is temporarily unavailable. Please try again later.'
            : 'Unable to complete this request. Please try again.',
        response.status,
        data,
      );
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new Error(
      'Could not connect. Check your internet connection and try again. If you submitted a registration or payment, refresh your tickets before retrying.',
    );
  } finally {
    clearTimeout(timer);
  }
}
const id = encodeURIComponent;
export const api = {
  events: () => request<{ events: Event[] }>('/api/events'),
  event: (slug: string) => request<{ event: Event }>('/api/events/' + id(slug)),
  gallery: (slug: string) =>
    request<{ images: GalleryImage[] }>('/api/gallery?eventId=' + id(slug)),
  me: () =>
    request<{
      authenticated: boolean;
      user: User | null;
      isBlocked?: boolean;
      blockReason?: string;
    }>('/api/auth/me'),
  auth: (
    action:
      | 'login'
      | 'register'
      | 'verify-email'
      | 'resend-verification'
      | 'forgot-password'
      | 'reset-password',
    body: Record<string, unknown>,
  ) =>
    request<{ user?: User; requiresVerification?: boolean; message: string }>(
      '/api/auth/' + action,
      'POST',
      body,
    ),
  logout: () => request('/api/auth/logout', 'POST'),
  profile: (body: Record<string, unknown>) =>
    request<{ user: User }>('/api/user/profile', 'PUT', body),
  registrations: () => request<{ registrations: Registration[] }>('/api/user/registrations'),
  ticket: async (registrationId: string) => {
    const result = await request<{ registration: Registration }>('/api/registrations/' + id(registrationId));
    result.registration.eventId = registrationEventId(result.registration);
    return result;
  },
  register: (body: Record<string, unknown>) =>
    request<RegistrationResult>('/api/registrations', 'POST', body),
  promo: (body: Record<string, unknown>) =>
    request<{ finalFee: number; discountAmount: number; code: string; message: string }>(
      '/api/registrations/validate-promo',
      'POST',
      body,
    ),
  otp: (action: 'send' | 'verify', body: Record<string, unknown>) =>
    request<{ message: string; verificationToken?: string }>('/api/otp/' + action, 'POST', body),
  proof: (body: FormData) =>
    request<{ message: string }>('/api/payments/submit-proof', 'POST', body),
  free: (registrationId: string) =>
    request<{ message: string }>('/api/payments/confirm-free', 'POST', { registrationId }),
  certificate: (registrationId: string, eventId: string) =>
    request<Certificate>('/api/certificate/verify', 'POST', { registrationId, eventId }),
};
