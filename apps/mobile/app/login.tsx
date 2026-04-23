import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.replace('/(tabs)')
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={s.card}>
        <Text style={s.title}>Notes App</Text>
        <Text style={s.subtitle}>Sign in to continue</Text>

        <TextInput
          style={s.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="#6c7086"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={s.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor="#6c7086"
          secureTextEntry
        />

        {error ? <Text style={s.error}>{error}</Text> : null}

        <TouchableOpacity style={[s.btn, loading && s.btnDisabled]} onPress={handleLogin} disabled={loading}>
          <Text style={s.btnText}>{loading ? 'Signing in…' : 'Sign in'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#181825', justifyContent: 'center', padding: 24 },
  card:       { backgroundColor: '#1e1e2e', borderRadius: 16, padding: 28, borderWidth: 1, borderColor: '#313244' },
  title:      { fontSize: 28, fontWeight: 'bold', color: '#6366f1', marginBottom: 4 },
  subtitle:   { fontSize: 14, color: '#6c7086', marginBottom: 24 },
  input:      { backgroundColor: '#313244', borderRadius: 10, padding: 14, color: '#cdd6f4', marginBottom: 12, borderWidth: 1, borderColor: '#45475a', fontSize: 15 },
  error:      { color: '#f38ba8', fontSize: 13, marginBottom: 10 },
  btn:        { backgroundColor: '#6366f1', borderRadius: 10, padding: 14, alignItems: 'center' },
  btnDisabled:{ opacity: 0.5 },
  btnText:    { color: '#fff', fontWeight: '600', fontSize: 16 },
})
