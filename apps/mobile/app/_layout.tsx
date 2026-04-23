import { useEffect, useState } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { router, useSegments } from 'expo-router'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const segments = useSegments()

  useEffect(() => {
    // Load persisted session
    supabase.auth.getSession().then(({ data }) => setSession(data.session))

    // Keep in sync
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session === undefined) return // still loading

    const inLoginScreen = segments[0] === 'login'
    if (!session && !inLoginScreen) {
      router.replace('/login')
    } else if (session && inLoginScreen) {
      router.replace('/(tabs)')
    }
  }, [session, segments])

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#181825' } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" />
      </Stack>
    </>
  )
}
