import { useState, useRef, useEffect } from 'react'
import { View, Text, TouchableOpacity, Pressable, TextInput, StyleSheet, ScrollView } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { Audio } from 'expo-av'
import * as FileSystem from 'expo-file-system'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ButtonPressEvent, ControllerButton, AudioChunkEvent } from '@/lib/types'

const D_SIZE = 60
const CHUNK_MS = 3000

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 64000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.LOW,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 64000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 64000,
  },
}

export default function ControllerScreen() {
  const [roomId, setRoomId] = useState('default')
  const [connected, setConnected] = useState(false)
  const [recording, setRecording] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const recordingRef = useRef<Audio.Recording | null>(null)
  const rotateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordingActiveRef = useRef(false)
  const segmentStartRef = useRef<number>(0)
  const micPermissionRef = useRef<boolean | null>(null)
  const pendingStopRef = useRef<Promise<void> | null>(null)
  const pressedRef = useRef(false)

  function addLog(msg: string) {
    setLog(prev => [`${new Date().toLocaleTimeString()}: ${msg}`, ...prev].slice(0, 40))
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
    if (recordingActiveRef.current) stopRecording().catch(() => {})
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

  async function ensureMicPermission(): Promise<boolean> {
    if (micPermissionRef.current === true) return true
    const { status } = await Audio.requestPermissionsAsync()
    const granted = status === 'granted'
    micPermissionRef.current = granted
    if (!granted) addLog('mic permission denied')
    return granted
  }

  async function startSegment() {
    const recording = new Audio.Recording()
    await recording.prepareToRecordAsync(RECORDING_OPTIONS)
    await recording.startAsync()
    recordingRef.current = recording
    segmentStartRef.current = Date.now()
  }

  async function rotateSegment() {
    const oldRecording = recordingRef.current
    recordingRef.current = null
    const segmentDurationMs = Date.now() - segmentStartRef.current

    // Stop the old recording FIRST — expo-av only allows one active Recording.
    let uri: string | null = null
    if (oldRecording) {
      try {
        await oldRecording.stopAndUnloadAsync()
        uri = oldRecording.getURI()
      } catch (e: any) {
        if (!isNoDataError(e)) addLog(`segment stop error: ${e?.message ?? e}`)
      }
    }

    // Then start a new one if we're still in press-to-talk mode.
    if (recordingActiveRef.current) {
      try {
        await startSegment()
      } catch (e: any) {
        addLog(`mic restart error: ${e?.message ?? e}`)
        recordingActiveRef.current = false
        setRecording(false)
      }
    }

    // Send the old segment in the background — the new one is already capturing.
    if (uri) {
      sendAudioFile(uri, segmentDurationMs).catch((e) =>
        addLog(`segment send error: ${e?.message ?? e}`)
      )
    }
  }

  async function sendAudioFile(uri: string, durationMs: number) {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      })
      if (channelRef.current) {
        const event: AudioChunkEvent = {
          data: base64,
          format: 'm4a',
          timestamp: Date.now(),
          durationMs,
        }
        channelRef.current.send({ type: 'broadcast', event: 'audio', payload: event })
        addLog(`audio ${(base64.length / 1024).toFixed(1)}KB (${durationMs}ms)`)
      }
    } finally {
      FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {})
    }
  }

  async function startRecording() {
    if (!connected) {
      addLog('join a room first')
      return
    }
    if (recordingActiveRef.current) return
    const granted = await ensureMicPermission()
    if (!granted) return

    // expo-av is single-instance: wait for any prior stop+unload to finish
    // before preparing a new MediaRecorder, otherwise prepareToRecordAsync
    // throws "Only one Recording object can be prepared at a given time".
    if (pendingStopRef.current) {
      try { await pendingStopRef.current } catch {}
    }
    // The user may have lifted their finger while we were waiting.
    if (!pressedRef.current) return
    if (recordingActiveRef.current) return

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      })
      if (!pressedRef.current) return
      recordingActiveRef.current = true
      setRecording(true)
      await startSegment()
      addLog('mic on')
      rotateTimerRef.current = setInterval(() => {
        rotateSegment().catch(() => {})
      }, CHUNK_MS)
    } catch (e: any) {
      addLog(`mic start error: ${e?.message ?? e}`)
      recordingActiveRef.current = false
      setRecording(false)
    }
  }

  async function stopRecording() {
    if (!recordingActiveRef.current) return
    recordingActiveRef.current = false
    setRecording(false)
    if (rotateTimerRef.current) {
      clearInterval(rotateTimerRef.current)
      rotateTimerRef.current = null
    }
    const recording = recordingRef.current
    recordingRef.current = null
    const segmentDurationMs = Date.now() - segmentStartRef.current
    addLog('mic off')

    if (!recording) return

    // Stop+unload is what blocks the next startRecording. Upload can happen
    // afterwards in the background without delaying the user's next press.
    const stopAndGetUri = (async (): Promise<string | null> => {
      try {
        await recording.stopAndUnloadAsync()
        return recording.getURI()
      } catch (e: any) {
        if (!isNoDataError(e)) addLog(`mic stop error: ${e?.message ?? e}`)
        return null
      }
    })()

    const unloadDone = stopAndGetUri.then(() => undefined)
    pendingStopRef.current = unloadDone
    unloadDone.finally(() => {
      if (pendingStopRef.current === unloadDone) pendingStopRef.current = null
    })

    stopAndGetUri.then(uri => {
      if (!uri) return
      if (segmentDurationMs >= 200) {
        sendAudioFile(uri, segmentDurationMs).catch(e =>
          addLog(`segment send error: ${e?.message ?? e}`)
        )
      } else {
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {})
      }
    })
  }

  function isNoDataError(e: any): boolean {
    const msg = String(e?.message ?? e ?? '')
    return msg.includes('no valid audio data')
  }

  useEffect(() => {
    return () => {
      if (rotateTimerRef.current) clearInterval(rotateTimerRef.current)
      recordingActiveRef.current = false
      recordingRef.current?.stopAndUnloadAsync().catch(() => {})
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [])

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

      {/* Mic button — hold to talk */}
      <Pressable
        style={[s.micBtn, recording && s.micBtnActive]}
        onPressIn={() => {
          pressedRef.current = true
          startRecording().catch(() => {})
        }}
        onPressOut={() => {
          pressedRef.current = false
          stopRecording().catch(() => {})
        }}
      >
        <MaterialIcons name={recording ? 'mic' : 'mic-none'} size={28} color="#fff" />
        <Text style={s.micTxt}>{recording ? 'Recording…' : 'Hold to talk'}</Text>
      </Pressable>

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
  micBtn:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#45475a', paddingVertical: 14, borderRadius: 12, marginBottom: 14 },
  micBtnActive:       { backgroundColor: '#f38ba8' },
  micTxt:             { color: '#fff', fontSize: 14, fontWeight: '600' },
  sysRow:             { flexDirection: 'row', justifyContent: 'center', gap: 20, marginBottom: 12 },
  sysBtn:             { backgroundColor: '#313244', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  sysTxt:             { color: '#cdd6f4', fontSize: 12 },
  shoulderRow:        { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  shoulder:           { flex: 1, marginHorizontal: 4, backgroundColor: '#313244', padding: 12, borderRadius: 10, alignItems: 'center' },
  logBox:             { backgroundColor: '#1e1e2e', borderRadius: 12, padding: 12, minHeight: 120 },
  logEmpty:           { color: '#6c7086', fontSize: 12 },
  logLine:            { color: '#6c7086', fontSize: 11, fontFamily: 'monospace', marginBottom: 2 },
})
