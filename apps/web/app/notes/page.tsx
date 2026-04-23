'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Heading from '@tiptap/extension-heading'
import type { Note } from '@notes-app/shared'
import { supabase } from '@/lib/supabase'

// ── Password gate ─────────────────────────────────────────────────────────────

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const PASS = process.env.NEXT_PUBLIC_NOTES_PASSWORD || 'notes123'

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password === PASS) {
      sessionStorage.setItem('notes_unlocked', '1')
      onUnlock()
    } else {
      setError(true)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="bg-[#1e1e2e] border border-gray-700 rounded-xl p-8 w-full max-w-sm">
        <h2 className="text-xl font-bold text-white mb-2">Notes are locked</h2>
        <p className="text-gray-400 text-sm mb-6">Enter your password to continue.</p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(false) }}
            className="w-full bg-[#313244] border border-gray-600 rounded px-3 py-2 text-white mb-2"
            placeholder="Password"
            autoFocus
          />
          {error && <p className="text-red-400 text-sm mb-2">Incorrect password</p>}
          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg mt-2 transition-colors"
          >
            Unlock
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null

  const btn = (label: string, onClick: () => void, active = false) => (
    <button
      key={label}
      onMouseDown={e => { e.preventDefault(); onClick() }}
      className={`px-2 py-1 rounded text-sm font-mono transition-colors ${
        active ? 'bg-indigo-600 text-white' : 'hover:bg-gray-700 text-gray-300'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="flex flex-wrap gap-1 p-2 border-b border-gray-700 bg-[#1e1e2e]">
      {btn('H1', () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive('heading', { level: 1 }))}
      {btn('H2', () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }))}
      {btn('H3', () => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive('heading', { level: 3 }))}
      {btn('H4', () => editor.chain().focus().toggleHeading({ level: 4 }).run(), editor.isActive('heading', { level: 4 }))}
      <div className="w-px bg-gray-600 mx-1" />
      {btn('B', () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'))}
      {btn('I', () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'))}
      {btn('Code', () => editor.chain().focus().toggleCode().run(), editor.isActive('code'))}
      <div className="w-px bg-gray-600 mx-1" />
      {btn('List', () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'))}
      {btn('Ordered', () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'))}
      {btn('Quote', () => editor.chain().focus().toggleBlockquote().run(), editor.isActive('blockquote'))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NotesPage() {
  const [unlocked, setUnlocked] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [notes, setNotes] = useState<Note[]>([])
  const [active, setActive] = useState<Note | null>(null)
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const activeRef = useRef<Note | null>(null)

  useEffect(() => { activeRef.current = active }, [active])

  useEffect(() => {
    setMounted(true)
    if (sessionStorage.getItem('notes_unlocked') === '1') setUnlocked(true)
  }, [])

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, Heading.configure({ levels: [1, 2, 3, 4] })],
    content: '',
    editorProps: {
      attributes: { class: 'ProseMirror p-6 min-h-[400px] focus:outline-none' },
    },
    onUpdate({ editor }) {
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        const note = activeRef.current
        if (!note) return
        setSaving(true)
        supabase
          .from('notes')
          .update({ content: editor.getJSON(), updated_at: new Date().toISOString() })
          .eq('id', note.id)
          .then(() => setSaving(false))
      }, 1500)
    },
  })

  function toTiptap(content: any) {
    if (!content) return ''
    if (typeof content.text === 'string') {
      return {
        type: 'doc',
        content: content.text
          ? [{ type: 'paragraph', content: [{ type: 'text', text: content.text }] }]
          : [],
      }
    }
    return content
  }

  async function fetchNotes() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
    setNotes((data || []) as Note[])
  }

  useEffect(() => { if (unlocked) fetchNotes() }, [unlocked])

  useEffect(() => {
    if (editor && active) {
      editor.commands.setContent(toTiptap(active.content))
    }
  }, [active?.id])

  async function createNote() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('notes')
      .insert({ title: 'Untitled', content: {}, user_id: user.id, is_protected: false })
      .select()
      .single()
    if (data) { setNotes(prev => [data as Note, ...prev]); setActive(data as Note) }
  }

  async function updateTitle(title: string) {
    if (!active) return
    const updated = { ...active, title }
    setActive(updated)
    setNotes(prev => prev.map(n => n.id === active.id ? updated : n))
    await supabase.from('notes').update({ title }).eq('id', active.id)
  }

  async function deleteNote(id: string) {
    await supabase.from('notes').delete().eq('id', id)
    setNotes(prev => prev.filter(n => n.id !== id))
    if (active?.id === id) setActive(null)
  }

  if (!mounted) return null
  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />

  return (
    <div className="flex h-[calc(100vh-5rem)] -m-6">
      {/* Sidebar */}
      <aside className="w-64 bg-[#1e1e2e] border-r border-gray-700 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="font-semibold text-white">Notes</h2>
          <button
            onClick={createNote}
            className="text-indigo-400 hover:text-indigo-300 text-xl leading-none"
          >
            +
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {notes.map(note => (
            <button
              key={note.id}
              onClick={() => setActive(note)}
              className={`group w-full text-left px-4 py-3 border-b border-gray-700/50 hover:bg-[#313244] transition-colors ${
                active?.id === note.id ? 'bg-[#313244] border-l-2 border-l-indigo-500' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-1">
                <p className="text-sm font-medium text-white truncate flex-1">
                  {note.title || 'Untitled'}
                </p>
                <span
                  onClick={e => { e.stopPropagation(); deleteNote(note.id) }}
                  className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 text-xs transition-opacity"
                >
                  x
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {new Date(note.updated_at).toLocaleDateString()}
              </p>
            </button>
          ))}
        </div>
      </aside>

      {/* Editor */}
      <div className="flex-1 flex flex-col min-w-0">
        {active ? (
          <>
            <div className="flex items-center gap-4 px-6 py-3 bg-[#1e1e2e] border-b border-gray-700">
              <input
                value={active.title}
                onChange={e => updateTitle(e.target.value)}
                className="flex-1 bg-transparent text-xl font-bold text-white focus:outline-none"
                placeholder="Note title"
              />
              <span className="text-xs text-gray-500 shrink-0">
                {saving ? 'Saving...' : 'Saved'}
              </span>
            </div>
            <Toolbar editor={editor} />
            <div className="flex-1 overflow-y-auto bg-[#181825]">
              <EditorContent editor={editor} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Select a note or create a new one
          </div>
        )}
      </div>
    </div>
  )
}
