import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

function tabIcon(name: IoniconsName) {
  return ({ color, size }: { color: string; size: number }) => (
    <Ionicons name={name} size={size} color={color} />
  )
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: { backgroundColor: '#1e1e2e', borderTopColor: '#313244' },
        tabBarActiveTintColor: '#6366f1',
        tabBarInactiveTintColor: '#6c7086',
        headerStyle: { backgroundColor: '#1e1e2e' },
        headerTintColor: '#cdd6f4',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index"      options={{ title: 'Home',       tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="finance"    options={{ title: 'Finance',    tabBarIcon: tabIcon('wallet') }} />
      <Tabs.Screen name="notes"      options={{ title: 'Notes',      tabBarIcon: tabIcon('document-text') }} />
      <Tabs.Screen name="controller" options={{ title: 'Controller', tabBarIcon: tabIcon('game-controller') }} />
    </Tabs>
  )
}
