import { useState, useRef } from 'react'
import { View, Text, TouchableOpacity, Pressable, TextInput, StyleSheet, ScrollView } from 'react-native'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ButtonPressEvent, ControllerButton } from '@/lib/types'

const D_SIZE = 60

export default function ControllerScreen() {
  const [roomId, setRoomId] = useState('default')
  const [connected, setConnected] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)

  function addLog(msg: string) {
    setLog(prev => [`${new Date().toLocaleTimeString()}: ${msg}`, ...prev].slice(0, 30))
  }

  function join() {
    const channel = supabase.channel(`controller:${roomId}`)
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setConnected(true)
        addLog(`connected to "${roomId}"`)
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        addLog(`channel error: ${status}`)
      }
    })
    channelRef.current = channel
  }

  function leave() {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
    setConnected(false)
    addLog('left room')
  }

  function send(button: ControllerButton, pressed: boolean) {
    if (!connected || !channelRef.current) return
    const event: ButtonPressEvent = { button, pressed, timestamp: Date.now() }
    channelRef.current.send({ type: 'broadcast', event: 'button', payload: event })
    if (pressed) addLog(`> ${button}`)
  }

  const Btn = ({ button, label, style }: { button: ControllerButton; label: string; style?: object }) => (
    <Pressable
      style={[s.dpadBtn, style]}
      onPressIn={() => send(button, true)}
      onPressOut={() => send(button, false)}
    >
      <Text style={s.dpadTxt}>{label}</Text>
    </Pressable>
  )

  const ActionBtn = ({ button, label, bg }: { button: ControllerButton; label: string; bg: string }) => (
    <Pressable
      style={[s.actionBtn, { backgroundColor: bg }]}
      onPressIn={() => send(button, true)}
      onPressOut={() => send(button, false)}
    >
      <Text style={s.actionTxt}>{label}</Text>
    </Pressable>
  )

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* Room */}
      <Text style={s.label}>Room ID</Text>
      <View style={s.roomRow}>
        <TextInput
          style={[s.input, s.roomInput, connected && { opacity: 0.5 }]}
          value={roomId}
          onChangeText={setRoomId}
          editable={!connected}
          placeholder="Room ID"
          placeholderTextColor="#6c7086"
        />
        <TouchableOpacity
          style={[s.connectBtn, connected && s.disconnectBtn]}
          onPress={connected ? leave : join}
        >
          <Text style={s.connectTxt}>{connected ? 'Leave' : 'Join'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={[s.statusTxt, connected && s.statusConnectedTxt]}>
        {connected ? `Connected to "${roomId}"` : 'Not connected'}
      </Text>

      {/* D-pad + action buttons */}
      <View style={s.controlsRow}>
        <View style={s.dpad}>
          <Btn button="up"    label="^" style={s.dpadUp}    />
          <Btn button="left"  label="<" style={s.dpadLeft}  />
          <View style={s.dpadCenter} />
          <Btn button="right" label=">" style={s.dpadRight} />
          <Btn button="down"  label="v" style={s.dpadDown}  />
        </View>
        <View style={s.faceWrap}>
          <ActionBtn button="y" label="Y" bg="#f9e2af" />
          <View style={s.faceMiddle}>
            <ActionBtn button="x" label="X" bg="#89b4fa" />
            <ActionBtn button="a" label="A" bg="#a6e3a1" />
          </View>
          <ActionBtn button="b" label="B" bg="#f38ba8" />
        </View>
      </View>

      {/* System buttons */}
      <View style={s.sysRow}>
        <Pressable style={s.sysBtn} onPressIn={() => send('select', true)} onPressOut={() => send('select', false)}>
          <Text style={s.sysTxt}>Select</Text>
        </Pressable>
        <Pressable style={s.sysBtn} onPressIn={() => send('start', true)} onPressOut={() => send('start', false)}>
          <Text style={s.sysTxt}>Start</Text>
        </Pressable>
      </View>

      {/* Shoulder buttons */}
      <View style={s.shoulderRow}>
        <Pressable style={s.shoulder} onPressIn={() => send('l1', true)} onPressOut={() => send('l1', false)}>
          <Text style={s.sysTxt}>L1</Text>
        </Pressable>
        <Pressable style={s.shoulder} onPressIn={() => send('r1', true)} onPressOut={() => send('r1', false)}>
          <Text style={s.sysTxt}>R1</Text>
        </Pressable>
      </View>

      {/* Log */}
      <View style={s.logBox}>
        {log.length === 0
          ? <Text style={s.logEmpty}>Events will appear here</Text>
          : log.map((l, i) => <Text key={i} style={s.logLine}>{l}</Text>)
        }
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#181825' },
  content:            { padding: 20, paddingBottom: 40 },
  label:              { color: '#6c7086', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  input:              { backgroundColor: '#1e1e2e', borderRadius: 10, padding: 12, color: '#cdd6f4', borderWidth: 1, borderColor: '#313244', marginBottom: 10 },
  roomRow:            { flexDirection: 'row', gap: 10, marginBottom: 4 },
  roomInput:          { flex: 1, marginBottom: 0 },
  connectBtn:         { backgroundColor: '#6366f1', paddingHorizontal: 20, borderRadius: 10, justifyContent: 'center' },
  disconnectBtn:      { backgroundColor: '#f38ba8' },
  connectTxt:         { color: '#fff', fontWeight: '600' },
  statusTxt:          { color: '#6c7086', fontSize: 12, marginBottom: 24 },
  statusConnectedTxt: { color: '#a6e3a1' },
  controlsRow:        { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: 24 },
  dpad:               { width: D_SIZE * 3, height: D_SIZE * 3, position: 'relative' },
  dpadBtn:            { position: 'absolute', width: D_SIZE, height: D_SIZE, backgroundColor: '#313244', justifyContent: 'center', alignItems: 'center', borderRadius: 10 },
  dpadTxt:            { color: '#cdd6f4', fontSize: 18, fontWeight: 'bold' },
  dpadUp:             { top: 0, left: D_SIZE },
  dpadLeft:           { top: D_SIZE, left: 0 },
  dpadCenter:         { position: 'absolute', top: D_SIZE, left: D_SIZE, width: D_SIZE, height: D_SIZE, backgroundColor: '#181825' },
  dpadRight:          { top: D_SIZE, left: D_SIZE * 2 },
  dpadDown:           { top: D_SIZE * 2, left: D_SIZE },
  faceWrap:           { alignItems: 'center', gap: 8 },
  faceMiddle:         { flexDirection: 'row', gap: 8 },
  actionBtn:          { width: D_SIZE, height: D_SIZE, borderRadius: D_SIZE / 2, justifyContent: 'center', alignItems: 'center' },
  actionTxt:          { color: '#1e1e2e', fontSize: 16, fontWeight: 'bold' },
  sysRow:             { flexDirection: 'row', justifyContent: 'center', gap: 20, marginBottom: 12 },
  sysBtn:             { backgroundColor: '#313244', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  sysTxt:             { color: '#cdd6f4', fontSize: 12 },
  shoulderRow:        { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  shoulder:           { flex: 1, marginHorizontal: 4, backgroundColor: '#313244', padding: 12, borderRadius: 10, alignItems: 'center' },
  logBox:             { backgroundColor: '#1e1e2e', borderRadius: 12, padding: 12, minHeight: 120 },
  logEmpty:           { color: '#6c7086', fontSize: 12 },
  logLine:            { color: '#6c7086', fontSize: 11, fontFamily: 'monospace', marginBottom: 2 },
})
