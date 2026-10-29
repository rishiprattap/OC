import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { api, ApiError } from '../services/api';
import { useAuth } from '../state/AuthContext';
import {
  Button,
  Card,
  Copy,
  Field,
  Heading,
  Kicker,
  Notice,
  Page,
  Title,
  useAction,
} from '../components/ui';
import { notificationCapability } from '../services/notifications';
import { openExternal } from '../services/files';
import type { RootParams, User } from '../types';

export function PersonalFields({
  form,
  set,
  email = true,
}: {
  form: Record<string, string>;
  set: (key: string, value: string) => void;
  email?: boolean;
}) {
  return (
    <>
      <Field
        label="Full name"
        value={form.name}
        onChangeText={(value) => set('name', value)}
        autoComplete="name"
      />
      {email ? (
        <Field
          label="Email address"
          value={form.email}
          onChangeText={(value) => set('email', value)}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
      ) : null}
      <Field
        label="Phone / WhatsApp"
        value={form.phone}
        onChangeText={(value) => set('phone', value)}
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <Field
        label="Age"
        value={form.age}
        onChangeText={(value) => set('age', value)}
        keyboardType="number-pad"
        maxLength={3}
      />
      <Field label="City" value={form.city} onChangeText={(value) => set('city', value)} />
      <Field
        label="Instagram handle (optional)"
        value={form.instagram}
        onChangeText={(value) => set('instagram', value)}
        autoCapitalize="none"
      />
    </>
  );
}
export function profileForm(user: User | null): Record<string, string> {
  return {
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    age: user?.age ? String(user.age) : '',
    city: user?.city || '',
    instagram: user?.instagram || '',
  };
}
export function AuthScreen({ navigation }: NativeStackScreenProps<RootParams, 'Auth'>) {
  const auth = useAuth();
  const [mode, setMode] = useState<
    'login' | 'register' | 'verify-email' | 'forgot-password' | 'reset-password'
  >('login');
  const [form, setForm] = useState<Record<string, string>>({
    ...profileForm(null),
    password: '',
    otp: '',
    token: '',
  });
  const action = useAction();
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const set = (key: string, value: string) => setForm((old) => ({ ...old, [key]: value }));
  function switchMode(next: typeof mode) {
    setMode(next);
    action.setError('');
    action.setMessage('');
    set('password', '');
  }
  const labels = {
    login: 'Welcome back.',
    register: 'Find your people.',
    'verify-email': 'Check your inbox.',
    'forgot-password': 'Let’s get you back.',
    'reset-password': 'A fresh start.',
  };
  async function submit() {
    const email = form.email?.trim().toLowerCase();
    if (!email) throw new Error('Enter your email address.');
    let payload: Record<string, unknown> = { email, password: form.password };
    if (mode === 'register') payload = { ...form, email, age: Number(form.age) };
    if (mode === 'verify-email') payload = { email, otp: form.otp?.trim() };
    if (mode === 'forgot-password') payload = { email };
    if (mode === 'reset-password') {
      let token = form.token?.trim() || '';
      if (token.startsWith('https://')) {
        const link = new URL(token);
        if (link.hostname !== 'offstagecreators.in')
          throw new Error('Use the reset link from Offstage Creators.');
        token = link.searchParams.get('token') || '';
        const resetEmail = link.searchParams.get('email');
        if (resetEmail && resetEmail.toLowerCase() !== email)
          throw new Error('The reset link belongs to a different email address.');
      }
      payload = { email, token, newPassword: form.password };
    }
    try {
      const result = await api.auth(mode, payload);
      if (result.user) {
        await auth.accept(result.user);
        set('password', '');
        navigation.goBack();
        return;
      }
      if (result.requiresVerification) {
        setMode('verify-email');
        setResendAt(Date.now() + 60000);
        set('password', '');
      }
      if (mode === 'reset-password') {
        setMode('login');
        set('password', '');
        set('token', '');
      }
      action.setMessage(result.message);
    } catch (error) {
      if (error instanceof ApiError && error.data.requiresVerification) {
        setMode('verify-email');
        setResendAt(Date.now() + 60000);
        set('password', '');
      }
      throw error;
    }
  }
  return (
    <Page>
      <Kicker>Your voice belongs here</Kicker>
      <Title>{labels[mode]}</Title>
      <Copy>Use the same account as offstagecreators.in.</Copy>
      {mode === 'register' ? (
        <PersonalFields form={form} set={set} />
      ) : (
        <Field
          label="Email address"
          value={form.email}
          onChangeText={(value) => set('email', value)}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
      )}
      {['login', 'register', 'reset-password'].includes(mode) ? (
        <Field
          label={mode === 'reset-password' ? 'New password' : 'Password'}
          value={form.password}
          onChangeText={(value) => set('password', value)}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />
      ) : null}
      {mode === 'verify-email' ? (
        <Field
          label="6-digit email code"
          value={form.otp}
          onChangeText={(value) => set('otp', value)}
          keyboardType="number-pad"
          maxLength={6}
          autoComplete="one-time-code"
        />
      ) : null}
      {mode === 'reset-password' ? (
        <Field
          label="Reset link or token from your email"
          value={form.token}
          onChangeText={(value) => set('token', value)}
          autoCapitalize="none"
        />
      ) : null}
      <Notice error message={action.error} />
      <Notice message={action.message} />
      <Button
        title={
          {
            login: 'Sign in',
            register: 'Create account',
            'verify-email': 'Verify email',
            'forgot-password': 'Send recovery email',
            'reset-password': 'Reset password',
          }[mode]
        }
        loading={action.busy}
        onPress={() => action.run(submit)}
      />
      {mode === 'verify-email' ? (
        <Button
          secondary
          title={
            now < resendAt
              ? `Resend code in ${Math.ceil((resendAt - now) / 1000)}s`
              : 'Resend verification code'
          }
          disabled={now < resendAt || action.busy}
          onPress={() =>
            action.run(async () => {
              const result = await api.auth('resend-verification', { email: form.email });
              setResendAt(Date.now() + 60000);
              action.setMessage(result.message);
            })
          }
        />
      ) : null}
      {mode === 'login' ? (
        <>
          <Button secondary title="Create an account" onPress={() => switchMode('register')} />
          <Button
            secondary
            title="Forgot password?"
            onPress={() => switchMode('forgot-password')}
          />
        </>
      ) : (
        <Button secondary title="Back to sign in" onPress={() => switchMode('login')} />
      )}
      {mode === 'forgot-password' ? (
        <>
          <Copy>
            Your recovery email opens the existing website. You can complete the reset there, or
            paste its link into the app.
          </Copy>
          <Button
            secondary
            title="I have a reset link"
            onPress={() => switchMode('reset-password')}
          />
        </>
      ) : null}
    </Page>
  );
}
export function ProfileScreen() {
  const auth = useAuth();
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const action = useAction();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(profileForm(auth.user));
  useEffect(() => {
    setForm(profileForm(auth.user));
    setEditing(false);
  }, [auth.user]);
  return (
    <Page>
      <Kicker>Your corner of the stage</Kicker>
      <Title>
        {auth.user ? `Hello, ${auth.user.name.split(' ')[0]}.` : 'Make yourself at home.'}
      </Title>
      <Notice error message={auth.error || action.error} />
      <Notice message={action.message} />
      {!auth.user ? (
        <Card>
          <Heading>One account. Every stage.</Heading>
          <Copy>Sign in to manage your profile, registrations, tickets, and certificates.</Copy>
          <Button title="Sign in / Create account" onPress={() => nav.navigate('Auth')} />
        </Card>
      ) : (
        <>
          <Card>
            <Kicker>Your profile</Kicker>
            <Copy>{auth.user.email}</Copy>
            {editing ? (
              <>
                <PersonalFields
                  form={form}
                  set={(key, value) => setForm((old) => ({ ...old, [key]: value }))}
                  email={false}
                />
                <Copy>Your account email is verified and cannot be changed here.</Copy>
                <Button
                  title="Save profile"
                  loading={action.busy}
                  onPress={() =>
                    action.run(async () => {
                      const result = await api.profile({ ...form, age: Number(form.age) });
                      auth.update(result.user);
                      action.setMessage(
                        'Profile saved. These details will fill your next registration.',
                      );
                    })
                  }
                />
                <Button
                  secondary
                  title="Cancel"
                  onPress={() => {
                    setForm(profileForm(auth.user));
                    setEditing(false);
                  }}
                />
              </>
            ) : (
              <>
                <Copy color={cText}>{auth.user.name}</Copy>
                <Copy>
                  {auth.user.phone} · {auth.user.age} years
                </Copy>
                <Copy>{auth.user.city}</Copy>
                {auth.user.instagram ? <Copy>@{auth.user.instagram.replace(/^@/, '')}</Copy> : null}
                <Button secondary title="Edit profile" onPress={() => setEditing(true)} />
              </>
            )}
          </Card>
          <Button
            secondary
            title="Sign out securely"
            loading={action.busy}
            onPress={() => action.run(auth.logout)}
          />
        </>
      )}
      <Card>
        <Heading>Notifications</Heading>
        <Copy>{notificationCapability.reason}</Copy>
      </Card>
      <Button
        secondary
        title="Contact support"
        onPress={() => action.run(() => openExternal('mailto:support@offstagecreators.in'))}
      />
      <Copy>Offstage Creators · Version 1.0.0</Copy>
    </Page>
  );
}
const cText = '#F7F2E8';
