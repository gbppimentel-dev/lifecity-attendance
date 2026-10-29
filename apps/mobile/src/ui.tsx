import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AccessibilityInfo, Animated, AppState, Easing, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewProps, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export const colors = { primary: '#147d73', teal: '#147d73', ink: '#183f3b', text: '#183f3b', muted: '#66827c', background: '#f3f8f6', surface: '#ffffff', border: '#d5e7e2', soft: '#e4f4ee', purple: '#7964ad', lavender: '#f1edfa', gold: '#9d6a1c', danger: '#b74459', rose: '#fceef0' };
export const ui = StyleSheet.create({
  screen: { padding: 18, gap: 16, paddingBottom: 32, width: '100%', maxWidth: 760, alignSelf: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  title: { fontSize: 24, lineHeight: 30, color: colors.ink, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22, color: colors.muted },
  label: { fontSize: 13, lineHeight: 18, color: colors.ink, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff', color: colors.ink, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, minHeight: 48, fontSize: 16, lineHeight: 22 },
  button: { minHeight: 48, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, overflow: 'hidden' },
});
type Box = React.PropsWithChildren<{ style?: StyleProp<ViewStyle> }>;
export function Screen({ children, style, topInset = false, contentContainerStyle, ...props }: ScrollViewProps & { topInset?: boolean }) {
  return <SafeAreaView edges={topInset ? ['top', 'bottom', 'left', 'right'] : ['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.background }}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView {...props} keyboardShouldPersistTaps="handled" contentContainerStyle={[ui.screen, contentContainerStyle, style]}>{children}</ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
export function Card({ children, style }: Box) { return <View style={[ui.card, style]}>{children}</View>; }
export function Row({ children, style }: Box) { return <View style={[ui.row, style]}>{children}</View>; }
export function Title({ children, style }: React.PropsWithChildren<{ style?: StyleProp<import('react-native').TextStyle> }>) { return <Text accessibilityRole="header" style={[ui.title, style]}>{children}</Text>; }
export function TextBody({ children, style }: React.PropsWithChildren<{ style?: StyleProp<import('react-native').TextStyle> }>) { return <Text style={[ui.body, style]}>{children}</Text>; }
export function Button({ title, onPress, disabled, loading, variant = 'primary', style }: { title: string; onPress: () => void; disabled?: boolean; loading?: boolean; variant?: 'primary' | 'secondary' | 'danger'; style?: StyleProp<ViewStyle> }) {
  const bg = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.rose : '#f6faf8';
  const fg = variant === 'primary' ? '#fff' : variant === 'danger' ? colors.danger : colors.primary;
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: disabled || loading, busy: loading }} disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [ui.button, { backgroundColor: bg, borderWidth: variant === 'primary' ? 0 : 1, borderColor: variant === 'danger' ? '#edc7cf' : colors.border, opacity: disabled || loading ? .5 : pressed ? .78 : 1, transform: [{ scale: pressed ? .98 : 1 }] }, style]}>{loading && <ActivityIndicator color={fg} size="small" />}<Text style={{ color: fg, fontSize: 15, fontWeight: '700', textAlign: 'center' }}>{title}</Text></Pressable>;
}
export function Field({ label, style, ...props }: TextInputProps & { label: string }) {
  return <View style={{ gap: 7 }}><Text style={ui.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor="#81968f" autoCorrect={false} {...props} style={[ui.input, props.multiline && { minHeight: 110, textAlignVertical: 'top' }, style]} /></View>;
}
export function Notice({ message, tone = 'info' }: { message?: string; tone?: 'error' | 'success' | 'info' }) {
  if (!message) return null;
  const fg = tone === 'error' ? colors.danger : tone === 'success' ? colors.primary : colors.purple;
  return <View accessibilityLiveRegion="polite" style={{ backgroundColor: tone === 'error' ? colors.rose : tone === 'success' ? colors.soft : colors.lavender, borderRadius: 14, padding: 14, flexDirection: 'row', gap: 9, alignItems: 'flex-start' }}><Ionicons name={tone === 'error' ? 'alert-circle-outline' : tone === 'success' ? 'checkmark-circle-outline' : 'information-circle-outline'} size={20} color={fg} /><Text style={{ color: fg, fontSize: 14, lineHeight: 21, flex: 1 }}>{message}</Text></View>;
}
export function Chip({ children, tone = 'teal' }: React.PropsWithChildren<{ tone?: string }>) {
  const purple = ['purple', 'pending', 'upcoming'].includes(tone);
  return <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: purple ? colors.lavender : colors.soft, alignSelf: 'flex-start' }}><Text style={{ fontSize: 12, color: purple ? colors.purple : colors.primary, fontWeight: '600' }}>{children}</Text></View>;
}
export function Empty({ title = 'Nothing to show', message, children }: React.PropsWithChildren<{ title?: string; message?: string }>) {
  return <Card style={{ paddingVertical: 30, alignItems: 'center' }}><Ionicons name="file-tray-outline" color={colors.primary} size={30} /><Text style={[ui.label, { fontSize: 17 }]}>{title}</Text>{message && <TextBody style={{ textAlign: 'center' }}>{message}</TextBody>}{children}</Card>;
}
export function Select<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: { label: string; value: T }[]; onChange: (value: T) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState('');
  const selected = options.find(o => o.value === value);
  return <View style={{ gap: 7 }}><Text style={ui.label}>{label}</Text><Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${selected?.label ?? 'Choose'}`} accessibilityState={{ expanded: open, disabled }} disabled={disabled} onPress={() => { setSearch(''); setOpen(true); }} style={({ pressed }) => [ui.input, { flexDirection: 'row', gap: 8, alignItems: 'center', opacity: disabled ? .5 : pressed ? .7 : 1 }]}><Text style={{ color: colors.ink, fontSize: 15, flex: 1 }}>{selected?.label ?? 'Choose'}</Text><Ionicons name="chevron-down" size={18} color={colors.primary} /></Pressable><Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)} presentationStyle="pageSheet"><SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><View style={{ padding: 20, gap: 16, flex: 1 }}><Row><Title style={{ flex: 1 }}>{label}</Title><Button title="Done" variant="secondary" onPress={() => setOpen(false)} /></Row>{options.length > 8 && <Field label="Search" value={search} onChangeText={setSearch} placeholder="Find an option" />}<FlatList keyboardShouldPersistTaps="handled" data={options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))} keyExtractor={o => o.value} contentContainerStyle={{ gap: 8, paddingBottom: 20 }} ListEmptyComponent={<TextBody>No matches.</TextBody>} renderItem={({ item }) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: item.value === value }} onPress={() => { onChange(item.value); setOpen(false); }} style={({ pressed }) => [ui.card, { flexDirection: 'row', alignItems: 'center', borderColor: item.value === value ? colors.primary : colors.border, backgroundColor: item.value === value ? colors.soft : '#fff', opacity: pressed ? .7 : 1 }]}><Text style={{ flex: 1, fontSize: 16, color: colors.ink }}>{item.label}</Text>{item.value === value && <Ionicons name="checkmark-circle" color={colors.primary} size={24} />}</Pressable>} /></View></SafeAreaView></Modal></View>;
}
export function HoldButton({ title, onConfirm, disabled }: { title: string; onConfirm: () => void | Promise<void>; disabled?: boolean }) {
  const progress = useRef(new Animated.Value(0)).current, timer = useRef<ReturnType<typeof setTimeout> | null>(null), fired = useRef(false);
  const [busy, setBusy] = useState(false);
  function cancel() { if (timer.current) clearTimeout(timer.current); timer.current = null; progress.stopAnimation(); progress.setValue(0); }
  const eligibility = useRef({ disabled, busy, onConfirm });
  eligibility.current = { disabled, busy, onConfirm };
  useEffect(() => { const activity = AppState.addEventListener('change', state => { if (state !== 'active') cancel(); }); return () => { activity.remove(); cancel(); }; }, []);
  useEffect(() => { if (disabled) cancel(); }, [disabled]);
  const confirm = async () => { const latest = eligibility.current; if (AppState.currentState !== 'active' || latest.disabled || latest.busy || fired.current) return; fired.current = true; setBusy(true); try { await latest.onConfirm(); } finally { setBusy(false); cancel(); } };
  return <Pressable accessibilityRole="button" accessibilityLabel={title + '. Hold for one second to confirm.'} accessibilityHint="Or use the Confirm accessibility action." accessibilityState={{ disabled: disabled || busy }} accessibilityActions={[{ name: 'activate', label: 'Confirm removal' }]} onAccessibilityAction={e => { if (e.nativeEvent.actionName === 'activate') { fired.current = false; void confirm(); } }} disabled={disabled || busy} onPressIn={() => { fired.current = false; Animated.timing(progress, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: false }).start(); timer.current = setTimeout(() => void confirm(), 1100); }} onPressOut={cancel} style={[ui.button, { backgroundColor: colors.rose, borderWidth: 1, borderColor: '#edc7cf', opacity: disabled || busy ? .5 : 1 }]}><Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }), backgroundColor: '#eeb6c2' }} /><Ionicons name="trash-outline" size={17} color={colors.danger} /><Text style={{ color: colors.danger, fontSize: 15, fontWeight: '700' }}>{busy ? 'Removing…' : title}</Text></Pressable>;
}

type Toast = { id: number; message: string; undo?: () => Promise<void>; busy?: boolean };
type ToastContextType = { show: (message: string, options?: { undo?: () => Promise<void> }) => void };
const ToastContext = createContext<ToastContextType>({ show: () => undefined });
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }: React.PropsWithChildren) {
  const [toast, setToast] = useState<Toast | null>(null), insets = useSafeAreaInsets();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const serial = useRef(0), lock = useRef(false);
  useEffect(() => { const activity = AppState.addEventListener('change', state => setForeground(state === 'active')); return () => activity.remove(); }, []);
  const show = useCallback((message: string, options?: { undo?: () => Promise<void> }) => {
    setToast({ id: ++serial.current, message, undo: options?.undo });
    AccessibilityInfo.announceForAccessibility(message);
  }, []);
  useEffect(() => { if (!toast || toast.busy || !foreground) return; const timer = setTimeout(() => { if (AppState.currentState === 'active') setToast(t => t?.id === toast.id ? null : t); }, toast.undo ? 12000 : 5500); return () => clearTimeout(timer); }, [toast, foreground]);
  async function undo() {
    if (!toast?.undo || lock.current) return;
    const active = toast; lock.current = true; setToast(t => t?.id === active.id ? { ...t, busy: true } : t);
    try { await active.undo!(); setToast(t => t?.id === active.id ? null : t); }
    catch { setToast(t => t?.id === active.id ? { ...active, busy: false, message: 'Undo failed. Please retry or refresh the list.' } : t); }
    finally { lock.current = false; }
  }
  return <ToastContext.Provider value={useMemo(() => ({ show }), [show])}>{children}{toast && <View accessibilityLiveRegion="polite" style={{ position: 'absolute', bottom: insets.bottom + 76, left: 16, right: 16, maxWidth: 700, alignSelf: 'center', backgroundColor: colors.ink, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 8, elevation: 12 }}><Text style={{ color: '#fff', fontSize: 14, lineHeight: 20, flex: 1 }}>{toast.message}</Text>{toast.undo && <Pressable accessibilityRole="button" accessibilityLabel="Undo" disabled={toast.busy} onPress={() => void undo()} style={{ minHeight: 44, padding: 10, justifyContent: 'center' }}><Text style={{ color: '#9ee3ce', fontWeight: '700' }}>{toast.busy ? 'Restoring…' : 'Undo'}</Text></Pressable>}<Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification" disabled={toast.busy} onPress={() => setToast(null)} style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={20} color="#fff" /></Pressable></View>}</ToastContext.Provider>;
}
