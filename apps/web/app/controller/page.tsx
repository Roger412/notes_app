'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ButtonPressEvent, AudioChunkEvent } from '@notes-app/shared'

const TARGET_SAMPLE_RATE = 16000

export default function ControllerPage() {
  const [roomId, setRoomId] = useState('default')
  const [connected, setConnected] = useState(false)
  const [ros2Enabled, setRos2Enabled] = useState(false)
  const [ros2Url, setRos2Url] = useState('ws://localhost:9090')
  const [ros2Topic, setRos2Topic] = useState('/controller/buttons')
  const [audioTopic, setAudioTopic] = useState('/voice_audio')
  const [log, setLog] = useState<string[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const rosRef = useRef<any>(null)
  const topicRef = useRef<any>(null)
  const audioTopicRef = useRef<any>(null)

  function addLog(msg: string) {
    setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 80))
  }

  function joinRoom() {
    const channel = supabase.channel(`controller:${roomId}`)
    channel
      .on('broadcast', { event: 'button' }, ({ payload }: { payload: ButtonPressEvent }) => {
        addLog(`button:${payload.button} ${payload.pressed ? 'pressed' : 'released'}`)
        topicRef.current?.publish({ data: JSON.stringify(payload) })
      })
      .on('broadcast', { event: 'audio' }, ({ payload }: { payload: AudioChunkEvent }) => {
        handleAudioChunk(payload).catch((e) => addLog(`audio error: ${e?.message ?? e}`))
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnected(true)
          addLog(`joined room "${roomId}"`)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          addLog(`channel error: ${status}`)
        }
      })
    channelRef.current = channel
  }

  function leaveRoom() {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
    setConnected(false)
    addLog('left room')
  }

  async function handleAudioChunk(payload: AudioChunkEvent) {
    if (!audioTopicRef.current) {
      addLog(`audio ${(payload.data.length / 1024).toFixed(1)}KB (ROS2 off)`)
      return
    }
    const m4aBytes = base64ToBytes(payload.data)
    const wavBytes = await m4aToWav(m4aBytes, TARGET_SAMPLE_RATE)
    audioTopicRef.current.publish({ data: Array.from(wavBytes) })
    addLog(`audio → ROS2: ${wavBytes.length} bytes (wav, ${TARGET_SAMPLE_RATE}Hz)`)
  }

  async function connectRos2() {
    try {
      const ROSLIB = (await import('roslib')).default
      const ros = new ROSLIB.Ros({ url: ros2Url })
      rosRef.current = ros
      ros.on('connection', () => {
        addLog(`ROS2 connected: ${ros2Url}`)
        const buttonTopic = new ROSLIB.Topic({
          ros,
          name: ros2Topic,
          messageType: 'std_msgs/String',
        })
        buttonTopic.advertise()
        topicRef.current = buttonTopic

        const audio = new ROSLIB.Topic({
          ros,
          name: audioTopic,
          messageType: 'std_msgs/UInt8MultiArray',
        })
        audio.advertise()
        audioTopicRef.current = audio
        addLog(`advertising ${ros2Topic} and ${audioTopic}`)
      })
      ros.on('error', (e: Error) => addLog(`ROS2 error: ${e.message ?? 'unknown'}`))
      ros.on('close', () => {
        addLog('ROS2 disconnected')
        topicRef.current = null
        audioTopicRef.current = null
      })
    } catch (e) {
      addLog('Failed to load roslib')
    }
  }

  useEffect(() => {
    if (ros2Enabled) {
      connectRos2()
    } else {
      rosRef.current?.close()
      rosRef.current = null
      topicRef.current = null
      audioTopicRef.current = null
    }
  }, [ros2Enabled, ros2Url, ros2Topic, audioTopic])

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-6">Controller</h1>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Room panel */}
        <div className="bg-[#1e1e2e] rounded-xl p-6 border border-gray-700">
          <h2 className="font-semibold text-white mb-4">Supabase Room</h2>
          <div className="flex gap-2 mb-4">
            <input
              value={roomId}
              onChange={e => setRoomId(e.target.value)}
              disabled={connected}
              className="flex-1 bg-[#313244] border border-gray-600 rounded px-3 py-2 text-white disabled:opacity-50"
              placeholder="Room ID"
            />
            <button
              onClick={connected ? leaveRoom : joinRoom}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                connected
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
            >
              {connected ? 'Leave' : 'Join'}
            </button>
          </div>
          <div className={`flex items-center gap-2 text-sm ${connected ? 'text-green-400' : 'text-gray-500'}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-gray-500'}`} />
            {connected ? `Listening in "${roomId}"` : 'Not connected'}
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Join the same room ID on your phone to start receiving button and audio events.
          </p>
        </div>

        {/* ROS2 panel */}
        <div className="bg-[#1e1e2e] rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">ROS2 Bridge</h2>
            <button
              onClick={() => setRos2Enabled(!ros2Enabled)}
              className={`relative w-10 h-5 rounded-full transition-colors ${ros2Enabled ? 'bg-indigo-600' : 'bg-gray-600'}`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  ros2Enabled ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
          <input
            value={ros2Url}
            onChange={e => setRos2Url(e.target.value)}
            disabled={!ros2Enabled}
            className="w-full bg-[#313244] border border-gray-600 rounded px-3 py-2 text-white mb-2 disabled:opacity-40"
            placeholder="ws://localhost:9090"
          />
          <input
            value={ros2Topic}
            onChange={e => setRos2Topic(e.target.value)}
            disabled={!ros2Enabled}
            className="w-full bg-[#313244] border border-gray-600 rounded px-3 py-2 text-white mb-2 disabled:opacity-40"
            placeholder="/controller/buttons"
          />
          <input
            value={audioTopic}
            onChange={e => setAudioTopic(e.target.value)}
            disabled={!ros2Enabled}
            className="w-full bg-[#313244] border border-gray-600 rounded px-3 py-2 text-white disabled:opacity-40"
            placeholder="/voice_audio"
          />
          <p className="text-xs text-gray-500 mt-3">
            Buttons → <code className="text-indigo-400">std_msgs/String</code>, audio (WAV 16 kHz mono) → <code className="text-indigo-400">std_msgs/UInt8MultiArray</code>. Requires <code className="text-indigo-400">rosbridge_suite</code>.
          </p>
        </div>
      </div>

      {/* Event log */}
      <div className="bg-[#1e1e2e] rounded-xl p-4 border border-gray-700">
        <h2 className="font-semibold text-white mb-2 text-sm">Event Log</h2>
        <div className="bg-[#181825] rounded-lg p-3 h-52 overflow-y-auto font-mono text-xs text-gray-400 space-y-0.5">
          {log.length === 0
            ? <span className="text-gray-600">Waiting for events…</span>
            : log.map((l, i) => <div key={i}>{l}</div>)
          }
        </div>
      </div>
    </div>
  )
}

// --- helpers ---

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function m4aToWav(m4a: Uint8Array, targetSampleRate: number): Promise<Uint8Array> {
  const Ctx: typeof AudioContext = (window.AudioContext || (window as any).webkitAudioContext)
  const decodeCtx = new Ctx()
  const decoded = await decodeCtx.decodeAudioData(
    m4a.buffer.slice(m4a.byteOffset, m4a.byteOffset + m4a.byteLength)
  )
  decodeCtx.close()

  const monoSrc = downmixToMono(decoded)
  const resampled = await resample(monoSrc, decoded.sampleRate, targetSampleRate)
  return encodeWav(resampled, targetSampleRate)
}

function downmixToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0)
  const length = buffer.length
  const out = new Float32Array(length)
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const channel = buffer.getChannelData(ch)
    for (let i = 0; i < length; i++) out[i] += channel[i]
  }
  for (let i = 0; i < length; i++) out[i] /= buffer.numberOfChannels
  return out
}

async function resample(samples: Float32Array, sourceRate: number, targetRate: number): Promise<Float32Array> {
  if (sourceRate === targetRate) return samples
  const targetLength = Math.max(1, Math.round(samples.length * targetRate / sourceRate))
  const OfflineCtx: typeof OfflineAudioContext =
    (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)
  const offline = new OfflineCtx(1, targetLength, targetRate)
  const buffer = offline.createBuffer(1, samples.length, sourceRate)
  buffer.copyToChannel(samples, 0)
  const source = offline.createBufferSource()
  source.buffer = buffer
  source.connect(offline.destination)
  source.start()
  const rendered = await offline.startRendering()
  return rendered.getChannelData(0)
}

function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * numChannels * bitsPerSample / 8
  const blockAlign = numChannels * bitsPerSample / 8
  const dataSize = samples.length * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataSize, true)
  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return new Uint8Array(buffer)
}

function writeAscii(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
}
