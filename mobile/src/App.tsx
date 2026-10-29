import React from 'react';
import { Text, View } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthProvider, useAuth } from './state/AuthContext';
import { colors as c } from './theme';
import { Button, Page, Skeleton, Title } from './components/ui';
import { HomeScreen, EventsScreen, EventScreen, GalleryScreen } from './screens/Explore';
import { AuthScreen, ProfileScreen } from './screens/Account';
import { RegisterScreen, PaymentScreen } from './screens/Registration';
import { TicketsScreen, TicketScreen, CertificateScreen } from './screens/Tickets';
import type { RootParams } from './types';

const Stack = createNativeStackNavigator<RootParams>();
const Tabs = createBottomTabNavigator();
function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
        headerTitle: 'OFFSTAGE CREATORS',
        headerTitleStyle: { fontSize: 12, fontWeight: '600', letterSpacing: 3, color: c.gold },
        headerStyle: { backgroundColor: c.background },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
        tabBarActiveTintColor: c.gold,
        tabBarInactiveTintColor: c.muted,
        tabBarLabelStyle: { fontSize: 10 },
        tabBarIcon: ({ color, size }) => (
          <Ionicons
            name={
              (
                {
                  Home: 'sparkles-outline',
                  Events: 'calendar-outline',
                  'My Tickets': 'ticket-outline',
                  Gallery: 'images-outline',
                  Profile: 'person-outline',
                } as const
              )[route.name as 'Home'] || 'ellipse-outline'
            }
            size={size}
            color={color}
          />
        ),
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Events" component={EventsScreen} />
      <Tabs.Screen name="My Tickets" component={TicketsScreen} />
      <Tabs.Screen name="Gallery" component={GalleryScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}
function Navigation() {
  const auth = useAuth();
  if (auth.loading)
    return (
      <Page>
        <View style={{ paddingTop: 80, gap: 30 }}>
          <Title>Offstage Creators</Title>
          <Skeleton />
        </View>
      </Page>
    );
  return (
    <NavigationContainer
      theme={{
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          primary: c.gold,
          background: c.background,
          card: c.surface,
          text: c.text,
          border: c.border,
        },
      }}
    >
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: c.background },
          headerTintColor: c.gold,
          headerTitleStyle: { fontSize: 16 },
          contentStyle: { backgroundColor: c.background },
          animation: 'fade_from_bottom',
        }}
      >
        <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen name="Event" component={EventScreen} options={{ title: 'Event details' }} />
        <Stack.Screen name="Auth" component={AuthScreen} options={{ title: 'Your account' }} />
        <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Register' }} />
        <Stack.Screen
          name="Payment"
          component={PaymentScreen}
          options={{ title: 'Registration & payment' }}
        />
        <Stack.Screen
          name="Ticket"
          component={TicketScreen}
          options={{ title: 'Your registration' }}
        />
        <Stack.Screen
          name="Certificate"
          component={CertificateScreen}
          options={{ title: 'Certificate' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <Page>
          <Title>Let’s try that again.</Title>
          <Text style={{ color: c.text }}>
            Something interrupted the app. Your registrations remain on the server.
          </Text>
          <Button title="Reload app view" onPress={() => this.setState({ failed: false })} />
        </Page>
      );
    return this.props.children;
  }
}
export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <ErrorBoundary>
        <AuthProvider>
          <Navigation />
        </AuthProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
