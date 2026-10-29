import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../lib/supabase';
import { dateTime, errorMessage } from '../lib/format';
import { Button, Card, Chip, Notice, Row, Screen, Select, TextBody, Title, colors } from '../ui';

type Event = { id: string; name: string; starts_at: string; location: string | null; is_sunday_service: boolean };
type Snapshot = { total_members: number; active_members: number; total_events: number; total_check_ins: number;
  latest_event: Event | null; latest_event_check_ins: number; latest_sunday_service: Event | null;
  latest_sunday_check_ins: number; upcoming_event: Event | null; as_of: string;
  recent_check_ins: { id: string; checked_in_at: string; members: { first_name: string; last_name: string } | null; events: { name: string } | null }[] };
export default function DashboardScreen() {
  const focused = useIsFocused(), navigation = useNavigation<any>();
  const [period, setPeriod] = useState('all'), [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++sequence.current; setLoading(true);
    try {
      const result = await supabase.rpc('lc_dashboard_snapshot', { p_period: period, p_scanner_event_id: null });
      if (result.error) throw result.error;
      if (!result.data || result.data.period !== period || !Array.isArray(result.data.recent_check_ins)
        || !['total_members', 'active_members', 'total_events', 'total_check_ins'].every(k => typeof result.data[k] === 'number')) throw Error('The dashboard response could not be verified.');
      if (request === sequence.current) { setData(result.data); setError(''); }
    } catch (failure) { if (request === sequence.current) setError(errorMessage(failure)); }
    finally { if (request === sequence.current) setLoading(false); }
  }, [period]);
  useEffect(() => { if (focused) void load(); return () => { sequence.current++; }; }, [focused, load]);
  return <Screen refreshControl={<RefreshControl refreshing={loading && Boolean(data)} onRefresh={() => void load()} tintColor={colors.primary} />}>
    <LinearGradient colors={['#e0f3ea', '#f2effa']} style={s.hero}><Text style={s.eyebrow}>LIFECITY ATTENDANCE</Text><Title style={{ fontSize: 30, lineHeight: 38 }}>Dashboard</Title><TextBody>Attendance at a glance.</TextBody></LinearGradient>
    <Select label="Period" value={period} options={[{ value: 'all', label: 'All Time' }, { value: 'month', label: 'This Month' }, { value: 'year', label: 'This Year' }]} onChange={setPeriod} />
    <Notice message={error} tone="error" />{error && <Button title="Retry" variant="secondary" onPress={() => void load()} />}
    {loading && !data && <ActivityIndicator color={colors.primary} size="large" />}
    {data && <><View style={s.grid}>{[
      { label: 'Members', value: data.total_members, sub: `${data.active_members.toLocaleString()} Active`, bg: '#e6f5ef', fg: colors.primary, icon: 'people-outline' as const },
      { label: 'Services', value: data.total_events, sub: 'Created', bg: '#f0ebfa', fg: colors.purple, icon: 'calendar-outline' as const },
      { label: 'Check-Ins', value: data.total_check_ins, sub: 'In This Period', bg: '#eaf1fa', fg: '#4c76a1', icon: 'scan-outline' as const },
      { label: 'Latest Sunday', value: data.latest_sunday_check_ins, sub: data.latest_sunday_service ? 'Check-Ins' : 'No Service Yet', bg: '#fff3dc', fg: colors.gold, icon: 'sunny-outline' as const },
    ].map(stat => <View key={stat.label} style={[s.stat, { backgroundColor: stat.bg }]}><Row><Ionicons name={stat.icon} size={22} color={stat.fg} /><Text style={[s.statLabel, { color: stat.fg }]}>{stat.label}</Text></Row><Text style={s.total}>{stat.value.toLocaleString()}</Text><Text style={s.small}>{stat.sub}</Text></View>)}</View>
    <Card><Text style={s.eyebrow}>NEXT SERVICE</Text>{data.upcoming_event ? <><Title style={{ fontSize: 21 }}>{data.upcoming_event.name}</Title><TextBody>{dateTime(data.upcoming_event.starts_at)}</TextBody><TextBody>{data.upcoming_event.location || 'Venue Not Set'}</TextBody><Button title="Open Scanner" onPress={() => navigation.navigate('Scanner', { serviceId: data.upcoming_event!.id })} /></> : <TextBody>No upcoming service.</TextBody>}</Card>
    {data.latest_event && <Card><Text style={s.eyebrow}>LATEST SERVICE</Text><Title style={{ fontSize: 20 }}>{data.latest_event.name}</Title><Row><Chip>{data.latest_event_check_ins.toLocaleString()} Check-Ins</Chip><TextBody>{dateTime(data.latest_event.starts_at)}</TextBody></Row><Button title="View Records" variant="secondary" onPress={() => navigation.navigate('Records')} /></Card>}
    <Card><Title style={{ fontSize: 20 }}>Recent Check-Ins</Title>{data.recent_check_ins.length ? data.recent_check_ins.slice(0, 8).map(entry => <View key={entry.id} style={s.recent}><Ionicons name="checkmark-circle" color={colors.primary} size={22} /><View style={{ flex: 1 }}><Text style={s.statLabel}>{entry.members ? `${entry.members.first_name} ${entry.members.last_name}` : 'Member'}</Text><TextBody style={s.small}>{entry.events?.name || 'Service'} · {dateTime(entry.checked_in_at)}</TextBody></View></View>) : <TextBody>No check-ins in this period.</TextBody>}</Card>
    <TextBody style={{ fontSize: 12 }}>Updated {dateTime(data.as_of)} · Manila Time</TextBody></>}
  </Screen>;
}
const s = StyleSheet.create({ hero: { padding: 24, borderRadius: 24, gap: 8, borderWidth: 1, borderColor: '#c6ded7' }, eyebrow: { fontSize: 11, fontWeight: '700', color: colors.primary, letterSpacing: 1 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, stat: { width: '48%', flexGrow: 1, padding: 18, borderRadius: 20, gap: 10 }, statLabel: { fontSize: 14, fontWeight: '700', color: colors.ink }, total: { fontSize: 32, fontWeight: '800', color: colors.ink }, small: { fontSize: 12, lineHeight: 18, color: colors.muted }, recent: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, alignItems: 'center' } });
