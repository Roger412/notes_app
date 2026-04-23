import { useState, useEffect, useRef } from 'react'
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator } from 'react-native'
import { supabase } from '@/lib/supabase'
import type { Note } from '@/lib/types'

// Note: rich-text editing (TipTap) is web-only. Mobile uses plain text storage
// compatible with the same `content` JSON field — upgrade later with a WebView editor.

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const PASS = process.env.EXPO_PUBLIC_NOTES_PASSWORD || 'notes123'

  return (
    <View style={s.lockWrap}>
      <Text style={s.lockTitle}>Notes are locked</Text>
      <TextInput
        style={s.input}
        value={password}
        onChangeText={v => { setPassword(v); setError(false) }}
        placeholder="Password"
        placeholderTextColor="#6c7086"
        secureTextEntry
      />
      {error && <Text style={s.errorTxt}>Incorrect password</Text>}
      <TouchableOpacity
        style={s.unlockBtn}
        onPress={() => { if (password === PASS) onUnlock(); else setError(true) }}
      >
        <Text style={s.unlockTxt}>Unlock</Text>
      </TouchableOpacity>
    </View>
  )
}

function NoteEditor({ note, onBack }: { note: Note; onBack: (updated: Note) => void }) {
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(() => {
    const c = note.content as any
    if (!c) return ''
    if (typeof c.text === 'string') return c.text
    // TipTap JSON — convert block nodes to plain text with formatting hints
    function extractText(node: any): string {
      if (!node) return ''
      if (node.type === 'text') return node.text || ''
      const inner = (node.content || []).map(extractText).join('')
      switch (node.type) {
        case 'heading': return '#'.repeat(node.attrs?.level || 1) + ' ' + inner + '\n'
        case 'paragraph': return inner + '\n'
        case 'bulletList': return inner
        case 'orderedList': return inner
        case 'listItem': return '• ' + inner
        case 'blockquote': return '> ' + inner + '\n'
        case 'codeBlock': return inner + '\n'
        case 'hardBreak': return '\n'
        default: return inner
      }
    }
    return extractText(c).trimEnd()
  })
  const [saving, setSaving] = useState(false)
  const titleTimer = useRef<ReturnType<typeof setTimeout>>()
  const bodyTimer = useRef<ReturnType<typeof setTimeout>>()
  const latestTitle = useRef(note.title)
  const latestBody = useRef((note.content as any)?.text || '')

  useEffect(() => {
    return () => {
      clearTimeout(titleTimer.current)
      clearTimeout(bodyTimer.current)
      supabase.from('notes')
        .update({ title: latestTitle.current, content: { text: latestBody.current }, updated_at: new Date().toISOString() })
        .eq('id', note.id)
    }
  }, [])

  function scheduleTitle(t: string) {
    setTitle(t)
    latestTitle.current = t
    clearTimeout(titleTimer.current)
    titleTimer.current = setTimeout(() => {
      supabase.from('notes').update({ title: t, updated_at: new Date().toISOString() }).eq('id', note.id)
    }, 800)
  }

  function scheduleBody(text: string) {
    setBody(text)
    latestBody.current = text
    clearTimeout(bodyTimer.current)
    bodyTimer.current = setTimeout(() => {
      supabase.from('notes')
        .update({ content: { text }, updated_at: new Date().toISOString() })
        .eq('id', note.id)
    }, 800)
  }

  async function saveNow() {
    clearTimeout(titleTimer.current)
    clearTimeout(bodyTimer.current)
    setSaving(true)
    await supabase.from('notes').update({
      title: latestTitle.current,
      content: { text: latestBody.current },
      updated_at: new Date().toISOString(),
    }).eq('id', note.id)
    setSaving(false)
  }

  return (
    <View style={s.editorWrap}>
      <View style={s.editorHeader}>
        <TouchableOpacity onPress={() => onBack({ ...note, title, content: { text: body } as any })}>
          <Text style={s.backBtn}>Back</Text>
        </TouchableOpacity>
        <TextInput
          style={s.titleInput}
          value={title}
          onChangeText={scheduleTitle}
          placeholder="Title"
          placeholderTextColor="#6c7086"
        />
        <TouchableOpacity onPress={saveNow} disabled={saving}>
          {saving
            ? <ActivityIndicator size="small" color="#6366f1" />
            : <Text style={s.saveBtn}>Save</Text>
          }
        </TouchableOpacity>
      </View>
      <TextInput
        style={s.bodyInput}
        value={body}
        onChangeText={scheduleBody}
        multiline
        placeholder="Start writing..."
        placeholderTextColor="#6c7086"
        textAlignVertical="top"
      />
    </View>
  )
}

export default function NotesScreen() {
  const [unlocked, setUnlocked] = useState(false)
  const [notes, setNotes] = useState<Note[]>([])
  const [active, setActive] = useState<Note | null>(null)

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

  async function createNote() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('notes')
      .insert({ title: 'Untitled', content: { text: '' }, user_id: user.id, is_protected: false })
      .select()
      .single()
    if (data) { setNotes(prev => [data as Note, ...prev]); setActive(data as Note) }
  }

  if (!unlocked) return <LockScreen onUnlock={() => setUnlocked(true)} />

  if (active) {
    return (
      <NoteEditor
        note={active}
        onBack={updated => {
          setNotes(prev => prev.map(n => n.id === updated.id ? updated : n))
          setActive(null)
        }}
      />
    )
  }

  return (
    <View style={s.container}>
      <FlatList
        data={notes}
        keyExtractor={item => item.id}
        ListEmptyComponent={<Text style={s.empty}>No notes yet. Tap + to create one.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.noteRow} onPress={() => setActive(item)}>
            <Text style={s.noteTitle}>{item.title || 'Untitled'}</Text>
            <Text style={s.noteDate}>{new Date(item.updated_at).toLocaleDateString()}</Text>
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity style={s.fab} onPress={createNote}>
        <Text style={s.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#181825' },
  lockWrap:     { flex: 1, backgroundColor: '#181825', justifyContent: 'center', padding: 32 },
  lockTitle:    { color: '#cdd6f4', fontSize: 22, fontWeight: 'bold', marginBottom: 24 },
  input:        { backgroundColor: '#1e1e2e', borderRadius: 10, padding: 14, color: '#cdd6f4', marginBottom: 10, borderWidth: 1, borderColor: '#313244' },
  errorTxt:     { color: '#f38ba8', marginBottom: 10, fontSize: 13 },
  unlockBtn:    { backgroundColor: '#6366f1', padding: 14, borderRadius: 10, alignItems: 'center' },
  unlockTxt:    { color: '#fff', fontWeight: '600', fontSize: 16 },
  noteRow:      { padding: 16, borderBottomWidth: 1, borderBottomColor: '#313244' },
  noteTitle:    { color: '#cdd6f4', fontSize: 15, fontWeight: '500' },
  noteDate:     { color: '#6c7086', fontSize: 12, marginTop: 2 },
  empty:        { color: '#6c7086', textAlign: 'center', marginTop: 60, paddingHorizontal: 20 },
  fab:          { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center' },
  fabText:      { color: '#fff', fontSize: 28, lineHeight: 32 },
  editorWrap:   { flex: 1, backgroundColor: '#181825' },
  editorHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#313244', gap: 12 },
  backBtn:      { color: '#6366f1', fontSize: 16 },
  saveBtn:      { color: '#6366f1', fontSize: 16, fontWeight: '600' },
  titleInput:   { flex: 1, color: '#cdd6f4', fontSize: 18, fontWeight: 'bold' },
  bodyInput:    { flex: 1, padding: 16, color: '#cdd6f4', fontSize: 15, lineHeight: 24 },
})
