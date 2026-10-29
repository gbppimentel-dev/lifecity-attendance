import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, type ViewInstance } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Chip, Notice, TextBody, colors } from '../ui';
import { useSession } from '../lib/session';

type Profile = { first_name: string; last_name: string; member_number: string; qr_token: string | null; status: string; churches?: string[]; ministries?: string[] };
export function MemberQR({ profile }: { profile: Profile }) {
  const shot = useRef<ViewInstance>(null), active = useRef(true), revision = useRef(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [idWidth, setIdWidth] = useState(260);
  const { session } = useSession();
  useEffect(() => { active.current = true; revision.current++; return () => { active.current = false; revision.current++; }; }, [profile.qr_token, profile.member_number, session?.user.id]);
  async function share() {
    if (busy || !profile.qr_token || !shot.current) return;
    const request = revision.current;
    setBusy(true); setError('');
    try {
      if (!await Sharing.isAvailableAsync()) throw Error('File sharing is unavailable on this device.');
      if (!active.current || request !== revision.current || !shot.current) return;
      const uri = await captureRef(shot, { format: 'png', quality: 1, result: 'tmpfile', width: 1000 });
      if (!active.current || request !== revision.current) return;
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share Member ID' });
    } catch (failure) { if (active.current && request === revision.current) setError((failure as Error).message || 'Could not share this ID. Please retry.'); }
    finally { if (active.current) setBusy(false); }
  }
  if (!profile.qr_token) return <Notice message="A QR code is not available for this member." />;
  return <Card><View ref={shot} onLayout={event => setIdWidth(event.nativeEvent.layout.width)} collapsable={false} style={s.id}><View style={s.heading}><Ionicons name="people" size={25} color="#fff" /><View style={{ flex: 1 }}><Text style={s.brand}>LIFECITY ATTENDANCE</Text><Text style={s.header}>Member ID</Text></View></View><Text style={s.name}>{profile.first_name} {profile.last_name}</Text><TextBody>{profile.member_number}</TextBody><View style={s.qr}><QRCode value={'att:' + profile.qr_token} size={Math.min(240, Math.max(96, idWidth - 88))} ecl="M" quietZone={16} /></View>{!!profile.churches?.length && <Text style={s.church}>{profile.churches.join(' · ')}</Text>}<Text style={s.private}>Private QR · Keep this ID safe</Text></View>{profile.status !== 'active' && <Notice message="This member is inactive. Check-in is unavailable." />}<Notice message={error} tone="error" /><Button title="Share Member ID" onPress={() => void share()} loading={busy} /><TextBody style={{ fontSize: 13, textAlign: 'center' }}>Show this QR code to the check-in camera.</TextBody></Card>;
}
const s = StyleSheet.create({
  id: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 18, alignItems: 'center', gap: 9 },
  heading: { backgroundColor: colors.primary, width: '100%', padding: 15, borderRadius: 14, flexDirection: 'row', gap: 12, alignItems: 'center' },
  brand: { fontSize: 10, letterSpacing: 1, color: '#c8ebe3', fontWeight: '700' },
  header: { color: '#fff', fontSize: 20, fontWeight: '700' },
  name: { fontSize: 22, lineHeight: 29, fontWeight: '700', textAlign: 'center', color: colors.ink, marginTop: 10 },
  qr: { backgroundColor: '#fff', padding: 8, marginVertical: 8 },
  church: { fontSize: 14, lineHeight: 20, color: colors.primary, textAlign: 'center' },
  private: { color: colors.muted, fontSize: 12, marginTop: 7 },
});
