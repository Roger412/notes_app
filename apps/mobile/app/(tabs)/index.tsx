import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'

const sections = [
  { route: '/finance',    label: 'Finance',    desc: 'Track income & expenses' },
  { route: '/notes',      label: 'Notes',      desc: 'Write and organize notes' },
  { route: '/controller', label: 'Controller', desc: 'WebSocket device bridge'  },
] as const

export default function HomeScreen() {
  return (
    <View style={s.container}>
      <Text style={s.title}>Notes App</Text>
      <Text style={s.subtitle}>Your personal hub</Text>
      {sections.map(sec => (
        <TouchableOpacity key={sec.route} style={s.card} onPress={() => router.push(sec.route)}>
          <Text style={s.cardTitle}>{sec.label}</Text>
          <Text style={s.cardDesc}>{sec.desc}</Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#181825', padding: 20, paddingTop: 60 },
  title:      { fontSize: 36, fontWeight: 'bold', color: '#6366f1', marginBottom: 4 },
  subtitle:   { fontSize: 14, color: '#6c7086', marginBottom: 32 },
  card:       { backgroundColor: '#1e1e2e', borderRadius: 16, padding: 20, marginBottom: 12, borderWidth: 1, borderColor: '#313244' },
  cardTitle:  { fontSize: 18, fontWeight: '600', color: '#cdd6f4', marginBottom: 4 },
  cardDesc:   { fontSize: 13, color: '#6c7086' },
})
