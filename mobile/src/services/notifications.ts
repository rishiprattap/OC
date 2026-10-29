/** No device token is requested or transmitted until a real authenticated service is configured. */
export type NotificationTopic =
  | 'event-announcement'
  | 'registration-update'
  | 'payment-approved'
  | 'event-reminder'
  | 'certificate-available';
export interface PushBackend {
  registerDevice(input: { expoPushToken: string; platform: 'android' }): Promise<void>;
  unregisterDevice(): Promise<void>;
}
export const notificationCapability = {
  enabled: false,
  reason:
    'Push notifications are not available yet. Check My Tickets for updates and your email for organizer messages.',
} as const;
// Future integration must authenticate device ownership with the existing user session,
// remove tokens on logout, verify delivery receipts, and deep-link only to owned registrations.
