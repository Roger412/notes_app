'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ButtonPressEvent } from '@notes-app/shared'

export default function ControllerPage() {
  const [roomId, setRoomId] = useState('default')
  const [connected, setConnected] = useState(false)
  const [ros2Enabled, setRos2Enabled] = useState(false)
  const [ros2Url, setRos2Url] = useState('ws://localhost:9090')
  const [ros2Topic, setRos2Topic] = useState('/controller/buttons')
  const [log, setLog] = useState<string[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const rosRef = useRef<any>(null)
  const topicRef = useRef<any>(null)

  function addLog(msg: string) {
    setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 60))
  }

  function joinRoom() {
    const channel = supabase.channel(`controller:${roomId}`)
    channel
      .on('broadcast', { event: 'button' }, ({ payload }: { payload: ButtonPressEvent }) => {
        addLog(`button:${payload.button} ${payload.pressed ? 'pressed' : 'released'}`)
        topicRef.current?.publish({ data: JSON.stringify(payload) })
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

  async function connectRos2() {
    try {
      const ROSLIB = (await import('roslib')).default
      const ros = new ROSLIB.Ros({ url: ros2Url })
      rosRef.current = ros
      ros.on('connection', () => {
        addLog(`ROS2 connected: ${ros2Url}`)
        // Create and advertise topic fresh on every (re)connection so rosbridge
        // always knows about it, even after a drop/reconnect cycle.
        const topic = new ROSLIB.Topic({
          ros,
          name: ros2Topic,
          messageType: 'std_msgs/String',
        })
        topic.advertise()
        topicRef.current = topic
      })
      ros.on('error', (e: Error) => addLog(`ROS2 error: ${e.message ?? 'unknown'}`))
      ros.on('close', () => {
        addLog('ROS2 disconnected')
        topicRef.current = null
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
    }
  }, [ros2Enabled, ros2Url, ros2Topic])

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
            Join the same room ID on your phone to start receiving button events.
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
            className="w-full bg-[#313244] border border-gray-600 rounded px-3 py-2 text-white disabled:opacity-40"
            placeholder="/controller/buttons"
          />
          <p className="text-xs text-gray-500 mt-3">
            Requires <code className="text-indigo-400">rosbridge_suite</code> running on the ROS2 machine.
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
