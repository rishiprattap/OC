import React, { useCallback, useRef, useState } from 'react';
import { View, Pressable, FlatList, Modal, Text, useWindowDimensions } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { api, assetUrl } from '../services/api';
import { galleryFile, openExternal, shareFile } from '../services/files';
import { canRegister, eventGroup } from '../services/policy';
import {
  Button,
  Card,
  Chip,
  Copy,
  Empty,
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
import { colors as c } from '../theme';
import type { Event, GalleryImage, RootParams } from '../types';

type Nav = NativeStackNavigationProp<RootParams>;
function useEvents() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.events();
      setEvents(result.events.filter((e) => e.isPublished));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  return { events, loading, error, load };
}
function EventCard({ event }: { event: Event }) {
  const nav = useNavigation<Nav>();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${event.title}`}
      onPress={() => nav.navigate('Event', { slug: event.slug })}
      style={styles.card}
    >
      <Photo path={event.posterUrl} height={260} contain label={event.title + ' poster'} />
      <View style={styles.row}>
        <Kicker>{event.eventType || 'Open mic'}</Kicker>
        <Chip label={eventGroup(event)} />
      </View>
      <Heading>{event.title || event.name}</Heading>
      <Copy>
        {event.date} · {event.time}
      </Copy>
      <Copy>{event.venue}</Copy>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text style={{ color: c.gold, fontWeight: '700' }}>
          {event.isPaid ? `₹${event.fee}` : 'Free entry'}
        </Text>
        <Text style={{ color: c.text }}>Explore event ↗</Text>
      </View>
    </Pressable>
  );
}
export function HomeScreen() {
  const { events, loading, error, load } = useEvents();
  const nav = useNavigation<Nav>();
  const action = useAction();
  const featured =
    events.find((e) => e.isActive && !e.isCompleted) ||
    events.find((e) => !e.isCompleted) ||
    events[0];
  return (
    <Page refresh={load} refreshing={loading}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Image
          source={require('../../assets/logo.png')}
          style={{ width: 52, height: 52 }}
          contentFit="contain"
        />
        <Kicker>OFFSTAGE CREATORS</Kicker>
        <Text style={{ color: c.gold, fontSize: 24 }}>✦</Text>
      </View>
      <LinearGradient
        colors={['#393021', '#1B1B18', '#10100F']}
        style={{ padding: 25, borderRadius: 24, gap: 20, borderWidth: 1, borderColor: c.border }}
      >
        <Kicker>A space for your voice</Kicker>
        <Title>
          Different Voices,{`\n`}
          <Text style={{ color: c.gold }}>Same Stage.</Text>
        </Title>
        <Copy>Poetry. Stories. Music. You.{`\n`}Find your people. Take your moment.</Copy>
        <Button
          title={featured && canRegister(featured) ? 'Register Now  ↗' : 'Discover events  ↗'}
          onPress={() => (featured ? nav.navigate('Event', { slug: featured.slug }) : load())}
        />
      </LinearGradient>
      <Notice message={error || action.error} error />
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Heading>On the stage</Heading>
        <Kicker>01 / EVENTS</Kicker>
      </View>
      {loading && !events.length ? (
        <Skeleton />
      ) : featured ? (
        <EventCard event={featured} />
      ) : (
        <Empty
          title="The next stage awaits"
          message="New events will appear here when announced."
        />
      )}
      {events
        .filter((e) => e.slug !== featured?.slug && !e.isCompleted)
        .slice(0, 3)
        .map((event) => (
          <EventCard key={event.slug} event={event} />
        ))}
      <Card>
        <Kicker>More than a microphone</Kicker>
        <Heading>A room that listens.</Heading>
        <Copy>
          Offstage Creators began with a simple belief: the world is full of unspoken thoughts,
          unshared writings, and talents waiting for a patient room that listens.
        </Copy>
        <Copy>
          We connect independent creators and passionate audiences through online open mics, poetry
          nights, and storytelling showcases across India.
        </Copy>
        <Button
          secondary
          title="Find us on Instagram  ↗"
          onPress={() =>
            action.run(() => openExternal('https://www.instagram.com/offstagecreators/'))
          }
        />
      </Card>
      <Copy>Made for the voices waiting to be heard.</Copy>
    </Page>
  );
}
export function EventsScreen() {
  const { events, loading, error, load } = useEvents();
  const [filter, setFilter] = useState('All');
  const filtered = events.filter((e) => filter === 'All' || eventGroup(e) === filter);
  return (
    <FlatList
      style={styles.page}
      contentContainerStyle={styles.content}
      data={filtered}
      keyExtractor={(e) => e.slug}
      refreshing={loading}
      onRefresh={load}
      ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
      ListHeaderComponent={
        <View style={{ gap: 18, marginBottom: 20 }}>
          <Kicker>Find your next moment</Kicker>
          <Title>The stage is yours.</Title>
          <Copy>Discover intimate rooms and unforgettable voices.</Copy>
          <View style={styles.row}>
            {['All', 'Upcoming', 'Ongoing', 'Past'].map((label) => (
              <Chip
                key={label}
                label={label}
                selected={filter === label}
                onPress={() => setFilter(label)}
              />
            ))}
          </View>
          <Notice message={error} error />
        </View>
      }
      renderItem={({ item }) => <EventCard event={item} />}
      ListEmptyComponent={
        loading ? (
          <Skeleton />
        ) : (
          <Empty
            title="No events here yet"
            message="Pull down to refresh or explore another category."
          />
        )
      }
    />
  );
}
export function EventScreen({ route, navigation }: NativeStackScreenProps<RootParams, 'Event'>) {
  const [event, setEvent] = useState<Event | null>(null);
  const action = useAction();
  const load = useCallback(
    () =>
      action.run(async () => {
        const data = await api.event(route.params.slug);
        if (!data.event.isPublished) throw new Error('This event is not publicly available.');
        setEvent(data.event);
      }),
    [route.params.slug],
  );
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  return (
    <Page refresh={load} refreshing={action.busy}>
      <Notice message={action.error} error />
      {!event ? (
        action.busy ? (
          <Skeleton />
        ) : (
          <Button title="Retry" onPress={load} />
        )
      ) : (
        <>
          <Photo path={event.posterUrl} height={380} contain label={event.title + ' poster'} />
          <View style={styles.row}>
            <Chip label={eventGroup(event)} />
            <Kicker>{event.eventType}</Kicker>
          </View>
          <Title>{event.title}</Title>
          <Copy color={c.gold}>{event.subtitle}</Copy>
          <Card>
            <Copy color={c.text}>
              {event.date} · {event.time}
            </Copy>
            <Copy>{event.timezone}</Copy>
            <Copy>
              {event.venue}
              {event.venueAddress ? '\n' + event.venueAddress : ''}
            </Copy>
            <Heading>{event.isPaid ? `₹${event.fee}` : 'Free entry'}</Heading>
            {event.mapsUrl ? (
              <Button
                title="Directions  ↗"
                secondary
                onPress={() => action.run(() => openExternal(event.mapsUrl))}
              />
            ) : null}
          </Card>
          <Heading>About this event</Heading>
          <Copy>{event.description || event.shortDescription}</Copy>
          <View style={styles.row}>
            {event.allowedCategories.map((category) => (
              <Chip key={category} label={category} />
            ))}
          </View>
          {event.externalPlatformNotes ? <Notice message={event.externalPlatformNotes} /> : null}
          <Button
            title={
              canRegister(event)
                ? event.registrationProvider === 'external'
                  ? `Register on ${event.externalPlatformName || 'partner website'} ↗`
                  : 'Register Now'
                : 'Registration unavailable'
            }
            disabled={!canRegister(event)}
            onPress={() =>
              event.registrationProvider === 'external'
                ? action.run(() => openExternal(event.externalRegistrationUrl))
                : navigation.navigate('Register', { slug: event.slug })
            }
          />
          {Object.entries(event.socialLinks || {})
            .filter(([key, url]) => ['instagram', 'youtube', 'whatsapp'].includes(key) && !!url)
            .map(([key, url]) => (
              <Button
                key={key}
                secondary
                title={`${key.charAt(0).toUpperCase() + key.slice(1)} ↗`}
                onPress={() => action.run(() => openExternal(url))}
              />
            ))}
        </>
      )}
    </Page>
  );
}
export function GalleryScreen() {
  const { events, error: eventError } = useEvents();
  const [selected, setSelected] = useState('');
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [viewer, setViewer] = useState<GalleryImage | null>(null);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryError, setGalleryError] = useState('');
  const generation = useRef(0);
  const sharing = useAction();
  const { width } = useWindowDimensions();
  const slug = selected || events[0]?.slug || '';
  const load = useCallback(async () => {
    if (!slug) return;
    const current = ++generation.current;
    setImages([]);
    setGalleryLoading(true);
    setGalleryError('');
    try {
      const result = await api.gallery(slug);
      if (current === generation.current)
        setImages(result.images.filter((image) => image.eventId === slug));
    } catch (error) {
      if (current === generation.current) setGalleryError((error as Error).message);
    } finally {
      if (current === generation.current) setGalleryLoading(false);
    }
  }, [slug]);
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        generation.current++;
      };
    }, [load]),
  );
  return (
    <>
      <FlatList
        style={styles.page}
        contentContainerStyle={styles.content}
        data={images}
        numColumns={2}
        columnWrapperStyle={{ gap: 12 }}
        keyExtractor={(image) => String(image.id)}
        refreshing={galleryLoading}
        onRefresh={load}
        ListHeaderComponent={
          <View style={{ gap: 18, marginBottom: 20 }}>
            <Kicker>Little moments. Lasting memories.</Kicker>
            <Title>Offstage, together.</Title>
            <Copy>Explore the rooms, the people, and everything in between.</Copy>
            <View style={styles.row}>
              {events.map((event) => (
                <Chip
                  key={event.slug}
                  label={event.title}
                  selected={event.slug === slug}
                  onPress={() => setSelected(event.slug)}
                />
              ))}
            </View>
            <Notice message={eventError || galleryError} error />
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.caption || 'Open event photo'}
            onPress={() => {
              sharing.setError('');
              setViewer(item);
            }}
            style={{ width: (width - 56) / 2, marginBottom: 12 }}
          >
            <Photo path={item.imageUrl} height={190} label={item.caption || 'Event photo'} />
            <Text numberOfLines={2} style={[styles.text, { marginTop: 8 }]}>
              {item.caption}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          galleryLoading ? (
            <Skeleton />
          ) : (
            <Empty
              title="Memories are on their way"
              message="Photos will appear when the organizers publish this event's gallery."
            />
          )
        }
      />
      <Modal visible={!!viewer} onRequestClose={() => setViewer(null)} animationType="fade">
        <SafeAreaView style={[styles.page, { padding: 20, gap: 16 }]}>
          <Button secondary title="Close photo" onPress={() => setViewer(null)} />
          <Image
            source={{ uri: assetUrl(viewer?.imageUrl) }}
            contentFit="contain"
            style={{ flex: 1 }}
          />
          <Copy>{viewer?.caption}</Copy>
          <Notice error message={sharing.error} />
          <Button
            title="Share photo"
            loading={sharing.busy}
            onPress={() =>
              sharing.run(async () => {
                if (viewer)
                  await shareFile(await galleryFile(viewer.imageUrl, viewer.id), 'image/jpeg');
              })
            }
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}
