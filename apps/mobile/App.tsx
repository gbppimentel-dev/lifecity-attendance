import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, Image, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider, useSession } from './src/lib/session';
import { configured } from './src/lib/supabase';
import { isStaff } from './src/lib/account';
import { Screen, Card, Title, TextBody, Button, Notice, Row, ToastProvider, colors } from './src/ui';
import DashboardScreen from './src/screens/DashboardScreen';
import MembersScreen from './src/screens/MembersScreen';
import ServicesScreen from './src/screens/ServicesScreen';
import ScannerScreen from './src/screens/ScannerScreen';
import RecordsScreen from './src/screens/RecordsScreen';
import GuestScreen from './src/screens/GuestScreen';
import OwnerScreen from './src/screens/OwnerScreen';
import { MemberHomeScreen, MemberProfileScreen, MemberHistoryScreen, MemberFeedbackScreen, LinkMemberScreen } from './src/screens/MemberScreens';

const Stack = createNativeStackNavigator(), Tabs = createBottomTabNavigator();
const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: colors.primary, background: colors.background, card: '#fff', text: colors.ink, border: colors.border } };
const animationContext = React.createContext({ animations: true, setAnimations: (_enabled: boolean) => {} });

function Brand() { return <Row><Image source={require('./assets/icon.png')} style={{ width: 30, height: 30, borderRadius: 9 }} /><Text style={{ fontSize: 17, fontWeight: '700', color: colors.ink }}>LifeCity</Text></Row>; }
function SignInScreen() {
  const { signIn, signingIn, error } = useSession(), navigation = useNavigation<any>();
  return <Screen topInset><LinearGradient colors={['#dff2e9', '#f2edfa']} style={s.welcome}><Image source={require('./assets/icon.png')} style={{ width: 80, height: 80, borderRadius: 24 }} /><Text style={s.eyebrow}>LIFECITY ATTENDANCE</Text><Title style={{ fontSize: 32, lineHeight: 40 }}>Welcome to LifeCity</Title><TextBody>Services, your member QR code, and attendance in one app.</TextBody></LinearGradient><Card><Title style={{ fontSize: 21 }}>Sign In</Title><TextBody>Use the Google account connected to LifeCity.</TextBody><Notice tone="error" message={error} /><Button title="Continue with Google" onPress={() => void signIn()} loading={signingIn} /><Button title="Browse Upcoming Services" onPress={() => navigation.navigate('Guest')} variant="secondary" /></Card><TextBody style={{ fontSize: 12, textAlign: 'center' }}>Your account determines which features you can access.</TextBody></Screen>;
}
function MoreScreen() {
  const { account, signOut, error } = useSession(), navigation = useNavigation<any>();
  const { animations, setAnimations } = React.useContext(animationContext);
  const [signingOut, setSigningOut] = useState(false);
  function logout() {
    Alert.alert('Sign Out?', 'Sign out of LifeCity on this device?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign Out', style: 'destructive', onPress: () => { setSigningOut(true); void signOut().catch(() => setSigningOut(false)); } }]);
  }
  return <Screen><Card><Text style={s.eyebrow}>{account?.role.toUpperCase()}</Text><Title>{account?.display_name || 'Your Account'}</Title><TextBody>{account?.email}</TextBody></Card>{isStaff(account) && <Card><Title style={{ fontSize: 21 }}>Workspace</Title><Button title="Attendance Records" variant="secondary" onPress={() => navigation.navigate('Records')} />{account?.role === 'owner' && <Button title="Owner Workspace" variant="secondary" onPress={() => navigation.navigate('OwnerWorkspace')} />}</Card>}{account?.member_id && isStaff(account) && <Card><Title style={{ fontSize: 21 }}>My Member Space</Title><Button title="Open Member Space" variant="secondary" onPress={() => navigation.navigate('MemberHome')} /></Card>}<Card><Title style={{ fontSize: 21 }}>App</Title><Row><View style={{ flex: 1 }}><Text style={s.heading}>Navigation Animations</Text><TextBody style={{ fontSize: 13 }}>Follows reduced motion on this device.</TextBody></View><Switch accessibilityLabel="Navigation Animations" value={animations} onValueChange={setAnimations} trackColor={{ false: '#c4d6d1', true: '#81c7b9' }} thumbColor={animations ? colors.primary : '#fff'} /></Row><Button title="Send App Feedback" variant="secondary" onPress={() => navigation.navigate('MemberFeedback')} /></Card><Notice message={error} tone="error" /><Button title="Sign Out" variant="danger" loading={signingOut} onPress={logout} /><TextBody style={{ fontSize: 12 }}>Native Android · Version 0.1.0</TextBody></Screen>;
}
const icons: Record<string, React.ComponentProps<typeof Ionicons>['name']> = { Dashboard: 'grid-outline', Members: 'people-outline', Services: 'calendar-outline', Scanner: 'scan-outline', More: 'ellipsis-horizontal', Home: 'home-outline', Profile: 'person-outline', Attendance: 'time-outline', Feedback: 'chatbubble-outline' };
function MainTabs() {
  const { account } = useSession(), staff = isStaff(account);
  return <Tabs.Navigator screenOptions={({ route }) => ({ headerTitle: Brand, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.muted, tabBarLabelStyle: { fontSize: 11, fontWeight: '600' }, tabBarStyle: { borderTopColor: colors.border }, tabBarIcon: ({ color, size }) => <Ionicons name={icons[route.name] || 'ellipse-outline'} size={size} color={color} />, freezeOnBlur: true, lazy: true })}>
    {staff ? <><Tabs.Screen name="Dashboard" component={DashboardScreen} /><Tabs.Screen name="Members" component={MembersScreen} /><Tabs.Screen name="Services" component={ServicesScreen} /><Tabs.Screen name="Scanner" component={ScannerScreen} /></> : <><Tabs.Screen name="Home" component={MemberHomeScreen} /><Tabs.Screen name="Attendance" component={MemberHistoryScreen} /><Tabs.Screen name="Profile" component={MemberProfileScreen} /></>}
    <Tabs.Screen name="More" component={MoreScreen} />
  </Tabs.Navigator>;
}
function Navigator() {
  const { session, account, loading, error, refreshAccount, signOut } = useSession();
  const { animations } = React.useContext(animationContext);
  if (!configured) return <Screen topInset><Card><Title>App Configuration Needed</Title><TextBody>Set the public Supabase URL and publishable key before building LifeCity.</TextBody></Card></Screen>;
  if (loading) return <Screen topInset style={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={colors.primary} size="large" /><TextBody>Checking Account Access…</TextBody></Screen>;
  if (session && (!account || account.status !== 'active')) return <Screen topInset><Card><Title>{account?.status === 'suspended' ? 'Access Suspended' : 'Account Access Unavailable'}</Title><Notice message={error || 'Please contact the Owner or refresh your account access.'} tone="error" /><Button title="Refresh Access" onPress={() => void refreshAccount()} /><Button title="Sign Out" variant="secondary" onPress={() => void signOut().catch(() => undefined)} /></Card></Screen>;
  const key = session ? `${session.user.id}:${account?.role}:${account?.member_id ?? 'unlinked'}` : 'signed-out';
  return <ToastProvider key={key}><NavigationContainer theme={theme}><Stack.Navigator screenOptions={{ animation: animations ? 'slide_from_right' : 'none', headerTintColor: colors.primary, headerStyle: { backgroundColor: colors.background }, contentStyle: { backgroundColor: colors.background }, headerBackTitle: 'Back' }}>
    {!session ? <><Stack.Screen name="SignIn" component={SignInScreen} options={{ headerShown: false }} /><Stack.Screen name="Guest" component={GuestScreen} options={{ title: 'Upcoming Services' }} /></> : account?.role === 'user' && !account.member_id ? <><Stack.Screen name="LinkMember" component={LinkMemberScreen} options={{ title: 'Connect Member Profile' }} /><Stack.Screen name="More" component={MoreScreen} options={{ title: 'Account' }} /><Stack.Screen name="MemberFeedback" component={MemberFeedbackScreen} options={{ title: 'App Feedback' }} /></> : <>
      <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="MemberHome" component={MemberHomeScreen} options={{ title: 'Member Space' }} />
      <Stack.Screen name="MemberProfile" component={MemberProfileScreen} options={{ title: 'My Profile' }} />
      <Stack.Screen name="MemberHistory" component={MemberHistoryScreen} options={{ title: 'My Attendance' }} />
      <Stack.Screen name="MemberFeedback" component={MemberFeedbackScreen} options={{ title: 'App Feedback' }} />
      {isStaff(account) && <Stack.Screen name="Records" component={RecordsScreen} options={{ title: 'Attendance Records' }} />}
      {account?.role === 'owner' && <Stack.Screen name="OwnerWorkspace" component={OwnerScreen} options={{ title: 'Owner Workspace' }} />}
    </>}
  </Stack.Navigator></NavigationContainer></ToastProvider>;
}
export default function App() {
  const [animations, setAnimations] = useState(true), [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => { void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion); const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion); return () => subscription.remove(); }, []);
  return <SafeAreaProvider><StatusBar style="dark" /><animationContext.Provider value={{ animations: animations && !reducedMotion, setAnimations }}><SessionProvider><Navigator /></SessionProvider></animationContext.Provider></SafeAreaProvider>;
}
const s = StyleSheet.create({ welcome: { marginTop: 36, padding: 25, gap: 16, borderRadius: 26, borderWidth: 1, borderColor: colors.border }, eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '700', letterSpacing: 1 }, heading: { color: colors.ink, fontSize: 15, fontWeight: '700' } });
