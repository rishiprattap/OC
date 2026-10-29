export interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  age: number;
  city: string;
  instagram: string | null;
  is_verified: number;
}
export interface Event {
  id: number;
  slug: string;
  title: string;
  name: string;
  subtitle: string;
  description: string;
  shortDescription: string;
  status: string;
  isPublished: boolean;
  date: string;
  time: string;
  startTime: string;
  endTime: string;
  timezone: string;
  venue: string;
  venueAddress: string;
  city: string;
  mapsUrl: string;
  eventType: string;
  fee: number;
  currency: string;
  isPaid: boolean;
  isActive: boolean;
  isCompleted: boolean;
  posterUrl: string;
  bannerUrl: string;
  logoUrl: string;
  registrationOpen: boolean;
  registrationProvider: 'internal' | 'external' | 'disabled';
  registrationButtonText: string;
  externalRegistrationUrl: string;
  externalPlatformName: string;
  externalPlatformNotes: string;
  allowedCategories: string[];
  confirmationMessage: string;
  upi: { upiId: string; payeeName: string; qrAssetPath: string; amount: number };
  certificateEnabled: boolean;
  socialLinks: Record<string, string>;
}
export interface Registration {
  registrationId: string;
  eventId: string;
  fullName: string;
  email: string;
  phone?: string;
  category: string;
  performanceTitle: string;
  status: string;
  regStatus?: string;
  statusLabel: string;
  paymentStatus: string;
  finalFee?: number;
  amount?: number;
  originalFee?: number;
  discountAmount?: number;
  otpVerified?: boolean;
  isValidPass?: boolean;
  isRevoked?: boolean;
  certificateEligible: boolean;
  qrCode?: string | null;
  transactionId?: string;
  rejectedReason?: string;
  event: { id?: string; title: string; name?: string; date: string; time: string; venue: string; slug?: string };
}
export interface RegistrationResult {
  registrationId: string;
  email: string;
  eventId: string;
  skipOtp?: boolean;
  verificationToken?: string;
  amount: number;
  finalFee: number;
  message: string;
  otpEmailFailed?: boolean;
}
export interface GalleryImage {
  id: number;
  imageUrl: string;
  caption: string;
  eventId: string;
}
export interface Certificate {
  registrationId: string;
  eventId?: string;
  verifiedName: string;
  event: string;
  certificateTitle: string;
  category: string;
  date: string;
  verificationUrl: string;
}
export type RootParams = {
  Main: undefined;
  Event: { slug: string };
  Auth: undefined;
  Register: { slug: string };
  Ticket: { id: string };
  Payment: { id: string; eventId: string; email: string };
  Certificate: { id: string; eventId: string };
};
