import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { dateTime } from '../lib/format';
import { Screen, Card, Title, TextBody, Button, Notice, Chip } from '../ui';

type Service = {
  id: string; name: string; starts_at: string; location: string | null;
  is_sunday_service: boolean; state: 'upcoming' | 'in-progress';
};
type Schedule = { rows: Service[]; total: number; page: number; page_size: number };

function publicSchedule(value: unknown): Schedule {
  const data = value as Schedule;
  if (!data || !Array.isArray(data.rows) || !Number.isInteger(data.total)
    || !Number.isInteger(data.page) || !Number.isInteger(data.page_size) || data.page_size < 1) {
    throw new Error('Invalid schedule');
  }
  // Explicit public projection: extra private fields never reach this screen.
  return { total: data.total, page: data.page, page_size: data.page_size,
    rows: data.rows.map(row => {
      if (!row || typeof row.id !== 'string' || typeof row.name !== 'string'
        || !Number.isFinite(Date.parse(row.starts_at))
        || !['upcoming', 'in-progress'].includes(row.state)
        || (row.location !== null && typeof row.location !== 'string')) throw new Error('Invalid service');
      return { id: row.id, name: row.name, starts_at: row.starts_at, location: row.location,
        state: row.state, is_sunday_service: row.is_sunday_service === true };
    }) };
}

export default function GuestScreen() {
  const navigation = useNavigation<any>();
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  useEffect(() => {
    let alive = true;
    const id = ++sequence.current;
    setLoading(true); setError('');
    void (async () => {
      try {
        const result = await supabase.rpc('lc_guest_services', { p_page: page });
        if (result.error) throw result.error;
        const next = publicSchedule(result.data);
        if (alive && sequence.current === id) setData(next);
      } catch {
        if (alive && sequence.current === id) setError('The public schedule is unavailable. Please try again.');
      } finally { if (alive && sequence.current === id) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [page, revision]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') setRevision(value => value + 1);
    });
    return () => subscription.remove();
  }, []);
  const current = data?.page === page ? data : null;
  const pages = Math.max(1, Math.ceil((current?.total ?? 0) / (current?.page_size ?? 12)));
  return <Screen>
    <Card style={styles.intro}>
      <Text style={styles.eyebrow}>LIFECITY CHURCH OF CHRIST</Text>
      <Title>Service Schedule</Title>
      <TextBody>Current and upcoming services. All times are in Manila.</TextBody>
      <Button title="Back to Sign In" variant="secondary" onPress={() => navigation.goBack()} />
    </Card>
    <View style={styles.heading}><Text style={styles.section}>Coming Up</Text><Button title="Refresh" variant="secondary" loading={loading} onPress={() => setRevision(value => value + 1)} /></View>
    {error ? <Notice message={error} tone="error" /> : null}
    {loading && !current ? <ActivityIndicator color="#147d73" accessibilityLabel="Loading public services" /> : null}
    {!loading && !error && current?.rows.length === 0 ? <Card><Title>No Public Services Listed</Title><TextBody>Check again later or ask the church team for the schedule.</TextBody></Card> : null}
    {current?.rows.map(service => <Card key={service.id} style={styles.service}>
      <View style={styles.top}>
        <View style={styles.calendar}>
          <Text style={styles.month}>{new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short' }).format(new Date(service.starts_at)).toUpperCase()}</Text>
          <Text style={styles.day}>{new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', day: 'numeric' }).format(new Date(service.starts_at))}</Text>
        </View>
        <View style={styles.tags}><Chip>{service.state === 'in-progress' ? 'In Progress' : 'Upcoming'}</Chip>{service.is_sunday_service ? <Chip>Sunday Service</Chip> : null}</View>
      </View>
      <Text style={styles.serviceName}>{service.name}</Text>
      <TextBody>{dateTime(service.starts_at)}</TextBody>
      <TextBody>{service.location || 'Venue to Be Confirmed'}</TextBody>
    </Card>)}
    {current && current.total > current.page_size ? <Card>
      <TextBody>{current.total} Services · Page {current.page} of {pages}</TextBody>
      <View style={styles.heading}>
        <Button title="Previous" variant="secondary" disabled={loading || page <= 1} onPress={() => setPage(value => value - 1)} />
        <Button title="Next" variant="secondary" disabled={loading || page >= pages} onPress={() => setPage(value => value + 1)} />
      </View>
    </Card> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  intro: { backgroundColor: '#eaf7f3', gap: 12 },
  eyebrow: { color: '#147d73', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  section: { fontSize: 21, color: '#173f3b', fontWeight: '700' },
  service: { gap: 9 }, top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  calendar: { width: 57, minHeight: 66, borderRadius: 14, backgroundColor: '#e3f4ef', alignItems: 'center', paddingVertical: 7 },
  month: { color: '#147d73', fontSize: 11, fontWeight: '700' },
  day: { color: '#147d73', fontSize: 27, fontWeight: '800' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1, justifyContent: 'flex-end' },
  serviceName: { fontSize: 18, lineHeight: 25, color: '#173f3b', fontWeight: '700' },
});
