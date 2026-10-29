import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { colors as c } from '../theme';
import { assetUrl } from '../services/api';

export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: c.background },
  content: { padding: 22, paddingBottom: 40, gap: 18 },
  title: {
    color: c.text,
    fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia',
    fontSize: 34,
    lineHeight: 40,
  },
  heading: { color: c.text, fontSize: 22, fontWeight: '600' },
  text: { color: c.muted, fontSize: 15, lineHeight: 23 },
  kicker: {
    color: c.gold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  field: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    padding: 15,
    color: c.text,
    fontSize: 16,
    minHeight: 52,
  },
});
export function Page({
  children,
  refresh,
  refreshing = false,
}: {
  children: React.ReactNode;
  refresh?: () => void;
  refreshing?: boolean;
}) {
  return (
    <SafeAreaView edges={['left', 'right']} style={styles.page}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            refresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refresh}
                tintColor={c.gold}
                colors={[c.gold]}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Title({ children }: { children: React.ReactNode }) {
  return (
    <Text accessibilityRole="header" style={styles.title}>
      {children}
    </Text>
  );
}
export function Heading({ children }: { children: React.ReactNode }) {
  return (
    <Text accessibilityRole="header" style={styles.heading}>
      {children}
    </Text>
  );
}
export function Copy({ children, color }: { children: React.ReactNode; color?: string }) {
  return <Text style={[styles.text, color ? { color } : undefined]}>{children}</Text>;
}
export function Kicker({ children }: { children: React.ReactNode }) {
  return <Text style={styles.kicker}>{children}</Text>;
}
export function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}
export function Button({
  title,
  onPress,
  secondary,
  disabled,
  loading,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 50,
        paddingHorizontal: 18,
        paddingVertical: 14,
        borderRadius: 13,
        backgroundColor: secondary ? c.raised : c.gold,
        borderWidth: 1,
        borderColor: secondary ? c.border : c.gold,
        alignItems: 'center',
        opacity: disabled || loading ? 0.45 : pressed ? 0.75 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator color={c.background} />
      ) : (
        <Text
          style={{
            color: secondary ? c.text : c.background,
            fontWeight: '700',
            fontSize: 14,
            textAlign: 'center',
          }}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={{ color: c.muted, fontSize: 13 }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.muted}
        autoCorrect={false}
        {...props}
        style={[
          styles.field,
          props.multiline && { minHeight: 100, textAlignVertical: 'top' },
          props.style,
        ]}
      />
    </View>
  );
}
export function Notice({ message, error = false }: { message?: string; error?: boolean }) {
  if (!message) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        padding: 15,
        backgroundColor: c.surface,
        borderLeftWidth: 3,
        borderLeftColor: error ? c.danger : c.gold,
        borderRadius: 8,
      }}
    >
      <Copy color={error ? c.danger : c.text}>{message}</Copy>
    </View>
  );
}
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        paddingHorizontal: 13,
        paddingVertical: 10,
        borderRadius: 30,
        backgroundColor: selected ? c.gold : c.raised,
        borderWidth: 1,
        borderColor: selected ? c.gold : c.border,
      }}
    >
      <Text style={{ color: selected ? c.background : c.muted, fontSize: 12, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}
export function Photo({
  path,
  height = 220,
  contain = false,
  label = 'Event image',
}: {
  path?: string;
  height?: number;
  contain?: boolean;
  label?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [path]);
  return (
    <Image
      source={
        failed || !path
          ? require('../../assets/logo.png')
          : {
              uri:
                path.startsWith('file://') || path.startsWith('content://') ? path : assetUrl(path),
            }
      }
      accessibilityLabel={label}
      onError={() => setFailed(true)}
      contentFit={contain ? 'contain' : 'cover'}
      transition={180}
      cachePolicy="memory"
      style={{ height, width: '100%', borderRadius: 16, backgroundColor: c.surface }}
    />
  );
}
export function Skeleton() {
  const opacity = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.8, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <View accessibilityLabel="Loading content" style={{ gap: 16 }}>
      <Animated.View
        style={{ height: 210, borderRadius: 20, backgroundColor: c.raised, opacity }}
      />
      <Animated.View style={{ height: 60, borderRadius: 15, backgroundColor: c.raised, opacity }} />
    </View>
  );
}
export function Empty({ title, message }: { title: string; message: string }) {
  return (
    <Card>
      <Kicker>Offstage Creators</Kicker>
      <Heading>{title}</Heading>
      <Copy>{message}</Copy>
    </Card>
  );
}
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const locked = useRef(false);
  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message || 'Something went wrong. Please try again.');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return { busy, error, message, setError, setMessage, run };
}
