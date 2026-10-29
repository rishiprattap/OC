import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { api } from '../services/api';
import { canRegister } from '../services/policy';
import { useAuth } from '../state/AuthContext';
import {
  Button,
  Card,
  Chip,
  Copy,
  Field,
  Heading,
  Kicker,
  Notice,
  Page,
  Photo,
  Skeleton,
  Title,
  styles,
  useAction,
} from '../components/ui';
import { PersonalFields, profileForm } from './Account';
import { colors as c } from '../theme';
import type { Event, Registration, RootParams } from '../types';

export function RegisterScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootParams, 'Register'>) {
  const auth = useAuth();
  const [event, setEvent] = useState<Event | null>(null);
  const [form, setForm] = useState<Record<string, string>>({
    ...profileForm(auth.user),
    category: '',
    performanceTitle: '',
    performanceDescription: '',
    promoCode: '',
  });
  const [terms, setTerms] = useState(false);
  const [fee, setFee] = useState<number | null>(null);
  const action = useAction();
  const loading = useAction();
  useEffect(() => {
    setForm((old) => ({ ...old, ...profileForm(auth.user) }));
  }, [auth.user]);
  const load = useCallback(
    () =>
      loading.run(async () => {
        const result = await api.event(route.params.slug);
        if (!result.event.isPublished) throw new Error('This event is not available.');
        setEvent(result.event);
      }),
    [route.params.slug],
  );
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  const set = (key: string, value: string) => {
    setForm((old) => ({ ...old, [key]: value }));
    if (key === 'promoCode' || key === 'email') setFee(null);
  };
  async function submit() {
    if (!event || !canRegister(event) || event.registrationProvider !== 'internal')
      throw new Error('Registration is no longer available in the app for this event.');
    if (!terms) throw new Error('Please agree to the event guidelines.');
    if (!form.category) throw new Error('Choose a performance category.');
    if (!form.performanceTitle || form.performanceTitle.trim().length < 2)
      throw new Error('Enter a performance title.');
    const result = await api.register({
      ...form,
      fullName: form.name,
      email: form.email?.trim().toLowerCase(),
      eventId: event.slug,
      age: Number(form.age),
      terms: true,
    });
    // Always re-read backend state on the next screen. Never infer a payment approval.
    navigation.replace('Payment', {
      id: result.registrationId,
      eventId: result.eventId,
      email: result.email || form.email || '',
    });
  }
  return (
    <Page>
      <Kicker>Your next performance</Kicker>
      <Title>Take the stage.</Title>
      <Notice error message={loading.error || action.error} />
      <Notice message={action.message} />
      {!event ? (
        <>
          <Skeleton />
          <Button secondary title="Retry loading event" onPress={load} />
        </>
      ) : (
        <>
          <Card>
            <Heading>{event.title}</Heading>
            <Copy>
              {event.date} · {event.time}
            </Copy>
            <Copy>{event.venue}</Copy>
          </Card>
          {!auth.user ? (
            <Card>
              <Copy>
                Sign in to reuse your details and keep your registration in My Tickets. You can also
                register as a guest and verify your email.
              </Copy>
              <Button secondary title="Sign in" onPress={() => navigation.navigate('Auth')} />
            </Card>
          ) : (
            <Notice message="Your saved profile details are filled in below." />
          )}
          <PersonalFields form={form} set={set} email={!auth.user} />
          {auth.user ? <Copy>{auth.user.email}</Copy> : null}
          <Heading>Your performance</Heading>
          <View style={styles.row}>
            {event.allowedCategories.map((category) => (
              <Chip
                key={category}
                label={category}
                selected={form.category === category}
                onPress={() => set('category', category)}
              />
            ))}
          </View>
          {!event.allowedCategories.length ? (
            <Field
              label="Performance category"
              value={form.category}
              onChangeText={(value) => set('category', value)}
            />
          ) : null}
          <Field
            label="Performance title"
            value={form.performanceTitle}
            onChangeText={(value) => set('performanceTitle', value)}
            maxLength={200}
          />
          <Field
            label="Tell us about your performance"
            multiline
            value={form.performanceDescription}
            onChangeText={(value) => set('performanceDescription', value)}
            maxLength={3000}
          />
          <Card>
            <Field
              label="Promo / referral code (optional)"
              value={form.promoCode}
              onChangeText={(value) => set('promoCode', value)}
              autoCapitalize="characters"
            />
            <Button
              secondary
              title="Apply code"
              disabled={!form.promoCode?.trim()}
              loading={action.busy}
              onPress={() =>
                action.run(async () => {
                  setFee(null);
                  const result = await api.promo({
                    code: form.promoCode,
                    eventSlug: event.slug,
                    email: form.email,
                  });
                  setFee(result.finalFee);
                  action.setMessage(result.message);
                })
              }
            />
            <Copy>{fee === null ? 'Event fee' : 'Fee after validated code'}</Copy>
            <Heading>₹{fee ?? (event.isPaid ? event.fee : 0)}</Heading>
            <Copy>
              The server confirms the final amount when you register. Availability and promo
              eligibility may change.
            </Copy>
          </Card>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: terms }}
            onPress={() => setTerms((value) => !value)}
            style={[styles.row, { alignItems: 'flex-start', paddingVertical: 12 }]}
          >
            <Text style={{ fontSize: 23, color: c.gold }}>{terms ? '☑' : '☐'}</Text>
            <Text style={[styles.text, { flex: 1 }]}>
              I agree to respect fellow performers, follow the event guidelines, and provide
              accurate registration and payment details.
            </Text>
          </Pressable>
          <Notice error message={action.error} />
          <Button
            title="Submit registration"
            disabled={!terms || !canRegister(event) || event.registrationProvider !== 'internal'}
            loading={action.busy}
            onPress={() => action.run(submit)}
          />
        </>
      )}
    </Page>
  );
}
export function PaymentScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootParams, 'Payment'>) {
  const { id, eventId, email } = route.params;
  const [reg, setReg] = useState<Registration | null>(null);
  const [event, setEvent] = useState<Event | null>(null);
  const [otp, setOtp] = useState('');
  const [utr, setUtr] = useState('');
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const action = useAction();
  const loading = useAction();
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function refresh() {
    const [ticket, detail] = await Promise.all([api.ticket(id), api.event(eventId)]);
    if (ticket.registration.eventId !== eventId)
      throw new Error('Registration does not belong to this event.');
    setReg(ticket.registration);
    setEvent(detail.event);
  }
  useFocusEffect(
    useCallback(() => {
      void loading.run(refresh);
    }, [id, eventId]),
  );
  async function pick(camera: boolean) {
    if (camera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted)
        throw new Error(
          'Camera permission is required to photograph a receipt. You can select a screenshot instead.',
        );
    }
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: false,
    };
    const result = camera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if ((asset.fileSize || 0) > 2 * 1024 * 1024)
        throw new Error('Choose an image smaller than 2 MB.');
      if (asset.mimeType && !['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType))
        throw new Error('Choose a JPEG, PNG, or WebP image.');
      setPhoto(asset);
    }
  }
  async function submitProof() {
    if (!photo) throw new Error('Select a payment screenshot.');
    if (utr.trim().length < 6)
      throw new Error('Enter a transaction reference with at least 6 characters.');
    const body = new FormData();
    body.append('registrationId', id);
    body.append('transactionId', utr.trim());
    body.append('screenshot', {
      uri: photo.uri,
      name: photo.fileName || 'receipt.jpg',
      type: photo.mimeType || 'image/jpeg',
    } as unknown as Blob);
    const result = await api.proof(body);
    setPhoto(null);
    setUtr('');
    await refresh();
    action.setMessage(result.message);
  }
  const verified = reg?.otpVerified || ['VERIFIED', 'APPROVED'].includes(reg?.status || '');
  const terminal = ['APPROVED', 'REJECTED', 'REVOKED', 'CANCELLED'].includes(reg?.status || '');
  const amount = reg?.finalFee ?? reg?.amount;
  return (
    <Page refresh={() => loading.run(refresh)} refreshing={loading.busy}>
      <Kicker>Registration · {id}</Kicker>
      <Title>
        {!verified ? 'Verify your email.' : terminal ? 'Registration status.' : 'One step closer.'}
      </Title>
      <Notice error message={loading.error || action.error} />
      <Notice message={action.message} />
      {!reg || !event ? (
        <>
          <Skeleton />
          <Button title="Retry" onPress={() => loading.run(refresh)} />
        </>
      ) : (
        <>
          <Card>
            <Heading>{reg.event.title}</Heading>
            <Copy>
              {reg.fullName} · {reg.email}
            </Copy>
            <Copy>{reg.statusLabel}</Copy>
            <Copy>Payment: {reg.paymentStatus}</Copy>
            <Heading>₹{amount}</Heading>
          </Card>
          {!verified ? (
            <>
              <Copy>
                Enter the code sent to {email || reg.email}. If it did not arrive, request another
                code below.
              </Copy>
              <Field
                label="6-digit email code"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
                autoComplete="one-time-code"
              />
              <Button
                title="Verify email"
                loading={action.busy}
                onPress={() =>
                  action.run(async () => {
                    const result = await api.otp('verify', {
                      registrationId: id,
                      email: reg.email,
                      otp,
                    });
                    setOtp('');
                    await refresh();
                    action.setMessage(result.message);
                  })
                }
              />
              <Button
                secondary
                title={
                  now < resendAt
                    ? `Resend in ${Math.ceil((resendAt - now) / 1000)}s`
                    : 'Resend code'
                }
                disabled={now < resendAt || action.busy}
                onPress={() =>
                  action.run(async () => {
                    const result = await api.otp('send', { registrationId: id, email: reg.email });
                    setResendAt(Date.now() + 60000);
                    action.setMessage(result.message);
                  })
                }
              />
            </>
          ) : !terminal && reg.paymentStatus !== 'SUBMITTED' ? (
            amount === 0 ? (
              <Button
                title="Confirm free registration"
                loading={action.busy}
                onPress={() =>
                  action.run(async () => {
                    const result = await api.free(id);
                    await refresh();
                    action.setMessage(result.message);
                  })
                }
              />
            ) : (
              <>
                <Card>
                  <Kicker>Pay with UPI</Kicker>
                  <Photo
                    path={event.upi.qrAssetPath}
                    height={270}
                    contain
                    label="UPI payment QR code"
                  />
                  <Heading>₹{amount}</Heading>
                  <Copy>{event.upi.payeeName}</Copy>
                  <Copy>{event.upi.upiId}</Copy>
                  <Button
                    secondary
                    title="Copy UPI ID"
                    onPress={() =>
                      action.run(async () => {
                        await Clipboard.setStringAsync(event.upi.upiId);
                        action.setMessage('UPI ID copied.');
                      })
                    }
                  />
                  <Copy>
                    Pay the exact registration amount shown above. A static QR may show the original
                    event fee; check the amount in your UPI app before paying.
                  </Copy>
                </Card>
                <Heading>Submit payment proof</Heading>
                <Field
                  label="UTR / transaction reference"
                  value={utr}
                  onChangeText={setUtr}
                  autoCapitalize="characters"
                  maxLength={100}
                />
                {photo ? (
                  <Photo path={photo.uri} height={210} contain label="Selected payment proof" />
                ) : null}
                <Button
                  secondary
                  title={photo ? 'Choose a different screenshot' : 'Choose payment screenshot'}
                  disabled={action.busy}
                  onPress={() => action.run(() => pick(false))}
                />
                <Button
                  secondary
                  title="Photograph receipt"
                  disabled={action.busy}
                  onPress={() => action.run(() => pick(true))}
                />
                <Copy>
                  JPEG, PNG, or WebP · up to 2 MB. Your payment stays pending until reviewed by the
                  organizers.
                </Copy>
                <Button
                  title="Submit payment proof"
                  loading={action.busy}
                  disabled={!photo || utr.trim().length < 6}
                  onPress={() => action.run(submitProof)}
                />
              </>
            )
          ) : (
            <Notice
              message={
                reg.paymentStatus === 'SUBMITTED'
                  ? 'Payment proof received. Approval is pending organizer verification. Pull down to check for updates.'
                  : reg.rejectedReason || reg.statusLabel
              }
            />
          )}
          <Button
            secondary
            title="View registration and ticket"
            onPress={() => navigation.replace('Ticket', { id })}
          />
        </>
      )}
    </Page>
  );
}
