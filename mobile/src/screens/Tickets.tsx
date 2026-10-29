import React, { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { api, ApiError } from '../services/api';
import { useAuth } from '../state/AuthContext';
import { assertCertificateIdentity, canShowTicket } from '../services/policy';
import { certificateFile, qrFile, saveFile, shareFile } from '../services/files';
import {
  Button,
  Card,
  Chip,
  Copy,
  Empty,
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
import type { Certificate, Registration, RootParams } from '../types';

export function TicketsScreen() {
  const auth = useAuth();
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [lookupId, setLookupId] = useState('');
  const action = useAction();
  const load = useCallback(
    () =>
      action.run(async () => {
        if (!auth.user) {
          setRegistrations([]);
          return;
        }
        try {
          setRegistrations((await api.registrations()).registrations);
        } catch (error) {
          setRegistrations([]);
          if (error instanceof ApiError && error.status === 401) await auth.refresh();
          throw error;
        }
      }),
    [auth.user?.id],
  );
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  if (!auth.user)
    return (
      <Page>
        <Kicker>Your moments, all together</Kicker>
        <Title>My tickets.</Title>
        <Empty
          title="Your stage pass awaits"
          message="Sign in to see your website and app registrations, tickets, and certificates."
        />
        <Button title="Sign in" onPress={() => nav.navigate('Auth')} />
        <Card>
          <Heading>Registered as a guest?</Heading>
          <Copy>
            Use the registration ID from your confirmation email to continue verification or
            payment.
          </Copy>
          <Field
            label="Registration ID"
            value={lookupId}
            onChangeText={setLookupId}
            autoCapitalize="characters"
          />
          <Button
            secondary
            title="Find my registration"
            loading={action.busy}
            disabled={!lookupId.trim()}
            onPress={() =>
              action.run(async () => {
                const id = lookupId.trim().toUpperCase();
                await api.ticket(id);
                nav.navigate('Ticket', { id });
              })
            }
          />
          <Notice error message={action.error} />
        </Card>
      </Page>
    );
  return (
    <FlatList
      style={styles.page}
      contentContainerStyle={styles.content}
      data={registrations}
      keyExtractor={(r) => r.registrationId}
      refreshing={action.busy}
      onRefresh={load}
      ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
      ListHeaderComponent={
        <View style={{ gap: 16, marginBottom: 20 }}>
          <Kicker>Your moments, all together</Kicker>
          <Title>My tickets.</Title>
          <Copy>Synced with your Offstage Creators account.</Copy>
          <Notice error message={action.error} />
        </View>
      }
      renderItem={({ item }) => (
        <Card>
          <Kicker>{item.registrationId}</Kicker>
          <Heading>{item.event.title}</Heading>
          <Copy>
            {item.event.date} · {item.event.time}
          </Copy>
          <Chip label={item.statusLabel} />
          <Copy>Payment: {item.paymentStatus}</Copy>
          <Button
            secondary
            title="View registration"
            onPress={() => nav.navigate('Ticket', { id: item.registrationId })}
          />
        </Card>
      )}
      ListEmptyComponent={
        action.busy ? (
          <Skeleton />
        ) : (
          <Empty
            title="Your story starts here"
            message="Registrations tied to your verified email will appear here. Explore an event and take the stage."
          />
        )
      }
    />
  );
}
export function TicketScreen({ route, navigation }: NativeStackScreenProps<RootParams, 'Ticket'>) {
  const [reg, setReg] = useState<Registration | null>(null);
  const action = useAction();
  const loading = useAction();
  const load = useCallback(
    () => loading.run(async () => setReg((await api.ticket(route.params.id)).registration)),
    [route.params.id],
  );
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  async function exportTicket(save: boolean) {
    if (!reg || !canShowTicket(reg) || !reg.qrCode)
      throw new Error('An approved ticket is not available yet.');
    const fresh = (await api.ticket(reg.registrationId)).registration;
    if (!canShowTicket(fresh) || !fresh.qrCode) {
      setReg(fresh);
      throw new Error('This ticket is no longer approved.');
    }
    const uri = await qrFile(fresh.qrCode, fresh.registrationId);
    if (save) {
      const saved = await saveFile(uri, `${fresh.registrationId}-ticket.png`, 'image/png');
      action.setMessage(
        saved ? 'Ticket QR saved. Keep your registration ID with it.' : 'Save cancelled.',
      );
    } else await shareFile(uri, 'image/png');
  }
  return (
    <Page refresh={load} refreshing={loading.busy}>
      <Kicker>Your stage pass</Kicker>
      <Title>Make it a moment.</Title>
      <Notice error message={loading.error || action.error} />
      <Notice message={action.message} />
      {!reg ? (
        <>
          <Skeleton />
          <Button title="Retry" onPress={load} />
        </>
      ) : (
        <>
          <Card>
            <Kicker>{reg.registrationId}</Kicker>
            <Heading>{reg.event.title}</Heading>
            <Copy>
              {reg.event.date} · {reg.event.time}
            </Copy>
            <Copy>{reg.event.venue}</Copy>
            <Heading>{reg.fullName}</Heading>
            <Copy>
              {reg.category} · {reg.performanceTitle}
            </Copy>
            <Chip label={reg.statusLabel} />
            <Copy>Payment: {reg.paymentStatus}</Copy>
            {canShowTicket(reg) && reg.qrCode ? (
              <>
                <Photo path={reg.qrCode} height={240} contain label="Approved ticket QR code" />
                <Copy>Present this QR and registration ID at the event.</Copy>
              </>
            ) : (
              <Notice message="An entry ticket is available only after the backend approves your registration." />
            )}
          </Card>
          {canShowTicket(reg) ? (
            <>
              <Button
                title="Share ticket QR"
                loading={action.busy}
                onPress={() => action.run(() => exportTicket(false))}
              />
              <Button
                secondary
                title="Save ticket QR to device"
                disabled={action.busy}
                onPress={() => action.run(() => exportTicket(true))}
              />
            </>
          ) : !['REJECTED', 'REVOKED', 'CANCELLED'].includes(reg.status) ? (
            <Button
              title="Continue registration / payment"
              onPress={() =>
                navigation.navigate('Payment', {
                  id: reg.registrationId,
                  eventId: reg.eventId,
                  email: reg.email,
                })
              }
            />
          ) : (
            <Notice message={reg.rejectedReason || reg.statusLabel} />
          )}
          <Button
            secondary
            title="Check participation certificate"
            onPress={() =>
              navigation.navigate('Certificate', { id: reg.registrationId, eventId: reg.eventId })
            }
          />
        </>
      )}
    </Page>
  );
}
export function CertificateScreen({ route }: NativeStackScreenProps<RootParams, 'Certificate'>) {
  const { id, eventId } = route.params;
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const action = useAction();
  const loading = useAction();
  async function verify() {
    setCertificate(null);
    const result = await api.certificate(id, eventId);
    assertCertificateIdentity(result, id, eventId);
    setCertificate(result);
  }
  useFocusEffect(
    useCallback(() => {
      void loading.run(verify);
    }, [id, eventId]),
  );
  async function exportCertificate(save: boolean) {
    const result = await api.certificate(id, eventId);
    assertCertificateIdentity(result, id, eventId);
    const uri = await certificateFile(id, eventId);
    if (save) {
      const saved = await saveFile(uri, `Offstage-Creators-${id}.svg`, 'image/svg+xml');
      action.setMessage(saved ? 'Certificate saved to your selected folder.' : 'Save cancelled.');
    } else await shareFile(uri, 'image/svg+xml');
  }
  return (
    <Page>
      <Kicker>Celebrate your voice</Kicker>
      <Title>Your certificate.</Title>
      <Copy>Registration {id}</Copy>
      <Notice error message={loading.error || action.error} />
      <Notice message={action.message} />
      {loading.busy ? (
        <Skeleton />
      ) : certificate ? (
        <>
          <Card>
            <Kicker>{certificate.certificateTitle || 'Certificate of participation'}</Kicker>
            <Title>{certificate.verifiedName}</Title>
            <Heading>{certificate.event}</Heading>
            <Copy>
              {certificate.category} · {certificate.date}
            </Copy>
            <Copy>Verified against this participant’s event registration.</Copy>
          </Card>
          <Button
            title="Download certificate"
            loading={action.busy}
            onPress={() => action.run(() => exportCertificate(true))}
          />
          <Button
            secondary
            title="Share certificate"
            disabled={action.busy}
            onPress={() => action.run(() => exportCertificate(false))}
          />
          <Copy>
            The original certificate is provided by the backend as a scalable SVG file. Open it in a
            compatible browser or image viewer.
          </Copy>
        </>
      ) : (
        <Empty
          title="Not available yet"
          message="Certificates become available after the organizers confirm eligibility and publish them. Your event and registration must match."
        />
      )}
      <Button
        secondary
        title="Check again"
        disabled={loading.busy}
        onPress={() => loading.run(verify)}
      />
    </Page>
  );
}
