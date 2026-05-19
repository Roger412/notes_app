# Notes App — Complete Workflow & Architecture Reference

A cross-platform notes, finance, and game-controller app built on Supabase, with optional ROS2 integration for robotics teleoperation.

---

## Running the Web App

```bash
# From the repo root, install workspace dependencies (only needed once)
pnpm install

# Start the Next.js dev server
cd apps/web
pnpm dev
```

Then open <http://localhost:3000> in your browser and sign in with your Supabase account (the same one you use on the phone). The dev server hot-reloads on file changes.

**Pages:**
- `/notes` — rich-text notes editor
- `/finance` — income / expense tracker
- `/controller` — receives phone button + audio events, optionally forwards to ROS2

**Optional — ROS2 forwarding on the Controller page:**
1. On the ROS2 machine, run `ros2 launch rosbridge_server rosbridge_websocket_launch.xml`.
2. In the web Controller page, flip the **ROS2 Bridge** toggle. Defaults: `ws://localhost:9090`, button topic `/controller/buttons`, audio topic `/voice_audio`.
3. On the phone Controller tab, type the same Room ID and **Join** to send button presses or hold-to-talk audio.

**Other commands:**
```bash
pnpm build         # production build
pnpm start         # serve the production build
pnpm lint          # next lint
```

---

## 1. High-Level System Architecture

Two user-facing clients share one cloud backend (Supabase). A local Node.js server exists but is currently unused by the clients. A separate ROS2 bridge is only needed for robotics integration.

```
  ┌──────────────────────┐          ┌──────────────────────┐
  │   MOBILE APP         │          │      WEB APP         │
  │   Expo / React Native│          │      Next.js         │
  │   Android / iOS      │          │   Browser (any OS)   │
  │                      │          │                      │
  │  • Notes (plain text)│          │  • Notes (rich text) │
  │  • Controller (send) │          │  • Controller (recv) │
  │  • Finance tracker   │          │  • Finance tracker   │
  │  • Auth screen       │          │  • Auth screen       │
  └──────────┬───────────┘          └──────────┬───────────┘
             │                                 │
             │  HTTPS + WSS (encrypted)        │  HTTPS + WSS (encrypted)
             │                                 │
             └──────────────┬──────────────────┘
                            │
                            ▼
         ┌──────────────────────────────────────────────┐
         │               SUPABASE  (cloud)              │
         │                                              │
         │  ┌─────────────┐  ┌────────────────────────┐ │
         │  │   AUTH      │  │   PostgreSQL DATABASE  │ │
         │  │ JWT tokens  │  │                        │ │
         │  │ Email login │  │  profiles              │ │
         │  │ Sessions    │  │  notes                 │ │
         │  └─────────────┘  │  note_folders          │ │
         │                   │  transactions          │ │
         │  ┌─────────────┐  │  budgets               │ │
         │  │  REALTIME   │  └────────────────────────┘ │
         │  │  Broadcast  │                             │
         │  │  channels   │                             │
         │  └──────┬──────┘                             │
         └─────────│────────────────────────────────────┘
                   │
                   │  button broadcast events
                   │  (only used by controller feature)
                   ▼
         ┌──────────────────────┐
         │  roslib.js           │   ← runs inside the web browser
         │  (WebSocket client)  │
         └──────────┬───────────┘
                    │
                    │  ws://localhost:9090
                    ▼
         ┌──────────────────────┐
         │  rosbridge_suite     │   ← runs on the ROS2 machine
         │  WebSocket server    │
         │  port 9090           │
         └──────────┬───────────┘
                    │
                    │  ROS2 DDS (Data Distribution Service)
                    ▼
         ┌────────────────────────┐
         │  ROS2 nodes            │
         │  topic:                │
         │  /controller/buttons   │
         │  type: std_msgs/String │
         └────────────────────────┘
```

**Backend (Node.js / Express + socket.io)** — currently unused. Exists at `backend/src/index.ts` with REST routes for notes/finance and a socket.io controller relay, but both clients call Supabase directly, so it is bypassed.

**EAS (Expo Application Services)** — build & update pipeline:
- `eas build` → EAS cloud → APK → Phone
- `eas update` → EAS CDN → JS bundle → Phone

---

## 2. Feature Flows

### 2a. Authentication

Both web and mobile use Supabase Auth with email + password. No custom auth code exists — the Supabase client SDK handles everything.

```
User enters email + password
        │
        ▼
supabase.auth.signInWithPassword({ email, password })
        │
        │  POST https://<project>.supabase.co/auth/v1/token
        ▼
Supabase Auth service
        │
        │  returns { access_token (JWT), refresh_token, user }
        ▼
Client stores session
  • Web:    in memory / localStorage (handled by Supabase SDK)
  • Mobile: in AsyncStorage via SecureStore (configured in lib/supabase.ts)
```

All subsequent database calls include the JWT in the `Authorization` header. Supabase's Row Level Security uses `auth.uid()` from the JWT to scope all queries — a user can only ever read or write their own rows.

On signup, a Postgres trigger (`handle_new_user`) automatically creates a row in `public.profiles` so user metadata is always initialized.

### 2b. Notes — Create & Edit

Notes are stored as JSONB in PostgreSQL. The content format differs between clients (see conversion section below).

**Web flow:**
```
User types in TipTap editor
        │  onUpdate fires after each keystroke; 1500ms debounce
        ▼
supabase.from('notes').update({ content: editor.getJSON(), updated_at })
        │  PATCH /rest/v1/notes?id=eq.<uuid> with Bearer <JWT>
        ▼
PostgreSQL  →  notes_updated_at trigger auto-updates updated_at column
        ▼
Saved. Browser shows "Saved" indicator.
```

**Mobile flow:**
```
User types in TextInput
        │  800ms debounce per field (separate timers for title and body)
        ▼
supabase.from('notes').update({ content: { text: body }, updated_at })
        │  PATCH /rest/v1/notes
        ▼
PostgreSQL
```

On unmount (Back button), any pending timer is cancelled and a synchronous save fires immediately to avoid data loss.

**Content format compatibility:**
- Web saves TipTap JSON: `{ type:'doc', content:[{ type:'paragraph', ... }] }`
- Mobile saves plain text: `{ text: 'hello world' }`

When web reads a mobile note, `toTiptap({ text: 'hello' })` wraps the text in a paragraph node. When mobile reads a web note, `extractText(tiptapJson)` recursively extracts text using `#` for headings, `•` for bullets, `>` for quotes.

### 2c. Controller — Phone → Web → ROS2

Full end-to-end path for a single button press:

```
Phone screen (user presses UP button)
        │  onPressIn fires
        ▼
send('up', true)  in controller.tsx
        ▼
channelRef.current.send({
  type: 'broadcast',
  event: 'button',
  payload: { button:'up', pressed:true, timestamp:1714000000000 }
})
        │  WSS to wss://<project>.supabase.co/realtime/v1/websocket
        ▼
Supabase Realtime service
        │  broadcasts payload to all other subscribers of
        │  channel name "controller:default" (or whatever roomId)
        ▼
Web browser  (subscribed to same channel)
        │  .on('broadcast', { event:'button' }, handler) fires
        ▼
addLog('button:up pressed')             ← shown in event log on screen
topicRef.current?.publish({             ← if rosbridge is connected
  data: JSON.stringify(payload)
})
        │  WebSocket frame to ws://localhost:9090
        │  roslib protocol: { op:'publish', topic:'/controller/buttons',
        │                     msg:{ data:'{"button":"up",...}' } }
        ▼
rosbridge_suite  (running on laptop via ros2 launch)
        │  translates WebSocket JSON  →  ROS2 DDS message
        ▼
ROS2 topic /controller/buttons  (std_msgs/String)
        ▼
Your ROS2 subscriber node receives:
  data: '{"button":"up","pressed":true,"timestamp":1714000000000}'
```

**Key point:** Supabase Realtime is cloud-to-cloud, so phone and web can be on completely different networks. roslib connects browser→localhost only, so rosbridge must run on the same machine as the browser (or on the local network if the URL is changed).

### 2d. OTA Updates (Over-The-Air)

The app is split into two layers:
- **Native layer** — compiled C++/Java/Kotlin (the APK). Changes require rebuild.
- **JavaScript layer** — the React Native bundle. Can be updated without reinstall.

```
Developer runs: eas update --branch preview --message "..."
        ▼
Metro bundler compiles JS + assets  →  uploaded to EAS CDN
        │
(next time user opens the app)
        ▼
App checks:  GET https://u.expo.dev/<projectId>/manifest
        │  compares runtimeVersion ("1.0.0" from appVersion policy)
        │  checks if a newer update exists on the "preview" branch
        ▼
Downloads new JS bundle in background
        ▼
On next app restart: new bundle loads automatically
```

Native rebuilds (new APK) are only needed when:
- Changing `app.json` (permissions, icons, splash, native modules)
- Adding/removing a package that has native code
- Changing the app version number (which bumps runtimeVersion)

### 2e. Finance Tracker

Separate feature. Both web and mobile call Supabase directly.

```
supabase.from('transactions').insert(...)   ← log income/expense
supabase.from('budgets').upsert(...)        ← set monthly category limit
supabase.from('transactions').select(...)   ← read and aggregate for summary
```

All protected by RLS: `auth.uid() = user_id`. Amount has a check constraint (`> 0`). Type is constrained to `'income'|'expense'`.

---

## 3. Database Schema

```
auth.users  (managed by Supabase Auth — not directly accessible)
     │
     │  uuid FK (on delete cascade)
     ├──▶  public.profiles       (id, display_name, created_at)
     ├──▶  public.note_folders   (id, user_id, name, created_at)
     ├──▶  public.notes          (id, user_id, folder_id, title,
     │                            content JSONB, is_protected, timestamps)
     ├──▶  public.transactions   (id, user_id, amount, type, category,
     │                            description, date, created_at)
     └──▶  public.budgets        (id, user_id, category, limit_amount,
                                  month YYYY-MM)
```

**Row Level Security** policy on every table: `auth.uid() = user_id` — a logged-in user can only ever touch their own rows. An unauthenticated request (no JWT) is rejected entirely.

**Triggers:**
- `on_auth_user_created` — auto-inserts into `profiles` on signup
- `notes_updated_at` — auto-updates `updated_at` on every note change

---

## 4. Monorepo Structure

```
notes_app/
├── apps/
│   ├── mobile/          Expo React Native app
│   │   ├── app/         File-based routes (expo-router)
│   │   │   └── (tabs)/  Tab screens: notes, controller, finance
│   │   ├── lib/         supabase client, types (inlined for EAS compat)
│   │   └── app.json     Expo config (native permissions, EAS project ID)
│   │
│   └── web/             Next.js app
│       ├── app/         App router pages
│       │   ├── notes/       TipTap notes editor
│       │   ├── controller/  Supabase Realtime + roslib bridge
│       │   └── finance/     Budget tracker
│       └── lib/         supabase client
│
├── backend/             Node.js Express server (mostly unused)
│   └── src/
│       ├── index.ts     HTTP + socket.io server
│       ├── routes/      notes.ts, finance.ts (unused by clients)
│       └── socket/      controller relay (unused — replaced by Supabase)
│
├── packages/
│   └── shared/          TypeScript types shared between web and backend
│       └── src/types/   Note, Transaction, Budget, ButtonPressEvent, etc.
│
└── supabase/
    └── schema.sql       Full DB schema (run once in Supabase SQL editor)
```

---

## 5. Tools — What Each Is and Why It Was Chosen

### Expo / React Native
- **What:** Framework for building native Android and iOS apps using JavaScript and React. Expo adds a managed layer on top with pre-configured native modules and a build cloud.
- **Why:** Write once in TypeScript, run on both Android and iOS. No need for separate native codebases or Android Studio/Xcode locally. Expo's managed workflow means native builds happen in EAS cloud.

### EAS (Expo Application Services)
- **What:** Cloud service that compiles native APK/IPA binaries and hosts over-the-air JS bundle updates (EAS Build + EAS Update).
- **Why:** Building Android apps requires the Android SDK, Gradle, and specific Java versions — complex local setup. EAS handles this in the cloud. EAS Update lets JS fixes reach the installed app without reinstall.

### Next.js
- **What:** React framework with file-based routing, server-side rendering, static generation, API routes, and automatic code splitting.
- **Why:** The de facto standard for production React web apps. Server components reduce client-side bundle size. Easy Vercel deployment. Handles TipTap's SSR quirks better than plain Vite/CRA.

### Supabase
- **What:** Open-source Firebase alternative. Provides PostgreSQL database with REST + realtime APIs, Auth (JWT, OAuth), Row Level Security, Edge Functions, and Realtime (WebSocket broadcast/presence).
- **Why:** Replaces three services in one (database + auth + realtime). RLS enforces data isolation at the database level — no risk of a bug in application code leaking another user's data. The Realtime broadcast feature solved the Android socket.io connectivity problem since it uses WSS (encrypted) to Supabase servers rather than cleartext HTTP to a local IP.

### TipTap
- **What:** Headless rich-text editor for web built on ProseMirror. Supports headings, bold, italic, lists, code blocks, blockquotes. Saves content as a JSON document tree.
- **Why:** ProseMirror is the gold standard for collaborative editors. TipTap wraps it with a clean React API. Headless means full control over styling (important for the dark theme).

### pnpm + Turborepo
- **What:** pnpm is a fast package manager with workspace support that uses hard links to avoid duplicating `node_modules` across packages. Turborepo orchestrates build tasks across the monorepo with caching.
- **Why:** A monorepo lets mobile, web, backend, and shared types live in one repo with shared dependencies and a single git history. pnpm's workspace protocol resolves inter-package imports locally.

### rosbridge_suite
- **What:** ROS package that runs a WebSocket server (default port 9090). It translates between JSON-over-WebSocket and native ROS2 messages, allowing any WebSocket client to publish/subscribe to ROS2 topics.
- **Why:** Web browsers cannot speak ROS2's native transport (DDS/RTPS) — it requires UDP multicast and native libraries. rosbridge provides a standard HTTP-friendly bridge. It is the official ROS solution for web-ROS communication.

### roslib.js
- **What:** JavaScript client library for rosbridge. Handles the WebSocket connection lifecycle, serializes/deserializes the rosbridge JSON protocol, and exposes Topic/Service/Param abstractions.
- **Why:** It is the standard companion library to rosbridge_suite and is maintained by the ROS community. Used in virtually every browser-to-ROS integration.

### socket.io (legacy — currently unused for controller)
- **What:** Library for bidirectional event-based communication over WebSockets with automatic fallback to HTTP long-polling.
- **Why it was used:** Controller prototype needed a server relay so phone and web could exchange events without direct p2p connection.
- **Why it was replaced:** React Native on Android's OkHttp networking stack failed to connect to a local HTTP/WS server even with cleartext traffic explicitly permitted. Supabase Realtime (WSS to cloud) was not affected by this restriction.

### Supabase Realtime Broadcast
- **What:** Supabase's pub/sub system built on Phoenix Channels (Elixir). Clients join named channels and send/receive arbitrary JSON payloads. "Broadcast" mode is ephemeral (not persisted) and low-latency.
- **Why:** Runs over WSS (encrypted) to Supabase's servers, so Android's cleartext traffic restriction does not apply. No self-hosted relay server needed. Works across different networks (phone on cellular, laptop on WiFi). Already in use for database/auth so no new service.

---

## 6. Current Limitations

**Single-user design**
- Notes have no sharing or collaboration — every note belongs to exactly one user. There is no invite system, public links, or shared folders.
- The notes "lock screen" password is global: one password unlocks all notes for any user who knows it. It is not per-user and is stored as plaintext in an environment variable.

**No real-time note sync**
- If you edit the same note on web and phone simultaneously, the last writer wins and the other's changes are silently lost. There is no conflict resolution (no CRDT, no operational transforms, no locking).

**Mobile editor is plain text only**
- Mobile cannot render or create rich text (bold, headings, lists). Web notes with formatting appear as stripped plain text on mobile. The `extractText()` converter preserves some visual hints (`#` for headings) but loses all formatting when the user edits and saves from mobile.

**Controller requires manual rosbridge setup**
- A user who wants ROS2 integration must manually install rosbridge_suite, run the launch file, and keep it running. There is no health indicator in the UI beyond the log, no auto-reconnect with exponential backoff, and roslib reconnects too aggressively (causing log spam on unstable links).

**Controller security**
- Supabase Realtime broadcast channels are public by default — any client with the Supabase anon key (which is in the mobile app bundle) can join any channel name and receive button events. There is no per-room auth.

**Backend is dead code**
- The Node.js backend has REST routes for notes and finance that no client uses (both call Supabase directly). The socket.io relay is also unused. This code adds maintenance surface area without providing value.

**No offline support**
- If the device has no internet connection, notes cannot be loaded or saved. There is no local cache, no sync queue, and no conflict strategy.

**Free tier limits (Supabase)**
- Free tier: 500 MB database, 2 GB bandwidth/month, 50,000 MAU. Realtime broadcast: 200 concurrent connections, 10 messages/second. For a personal app this is fine; under moderate real traffic it saturates.

**No push notifications**
- No way to alert users of new content, note shares, or controller events when the app is in the background.

**EAS build time**
- Every change to native configuration requires a full EAS build (~10 min). There is no local build configuration for quick iteration on native issues.

---

## 7. Recommended Future Improvements

### For reliability / polish (low effort, high impact)

- **Rich text on mobile.** Replace the plain `TextInput` with a WebView-based TipTap instance (same editor as web), or use `react-native-rich-editor`. Eliminates the content format mismatch problem entirely.
- **Per-user note passwords.** Store a hashed password in the `profiles` table instead of a shared env variable. Each user sets their own lock pin.
- **Optimistic UI + retry queue.** Cache notes in AsyncStorage/localStorage. Show cached content immediately on load. Queue writes when offline and flush on reconnect (use Supabase's offline persistence or a custom queue with react-query).
- **rosbridge reconnection with backoff.** Replace roslib's default aggressive reconnect with exponential backoff (1s, 2s, 4s, 8s...) and a max retry count. Show a clear "disconnected" badge in the UI rather than just a log entry.
- **Controller channel auth.** Use Supabase RLS on Realtime channels (available via Realtime policies) to require authentication before joining a controller room. Prevents unauthorized listeners.
- **Remove unused backend.** Delete or repurpose `backend/`. It adds complexity with no current benefit. If a server-side capability is needed later, add it then.

### For scalability (multiple users / production product)

- **Note sharing and collaboration.** Add a `note_shares` table (`note_id`, `shared_with_user_id`, `permission_level`). For real-time collaboration, integrate Supabase's built-in Presence or a CRDT library (e.g. Yjs with y-supabase provider) to merge concurrent edits without conflicts.
- **Note versioning / history.** Store a `note_history` table (`note_id`, `content`, `saved_at`, `saved_by`). Triggered on every notes update. Lets users restore previous versions.
- **Authentication hardening.** Add OAuth providers (Google, GitHub) via Supabase Auth. Add email verification and MFA (Supabase supports TOTP out of the box).
- **Upgrade Supabase plan.** Move to Pro ($25/month): 8 GB database, unlimited bandwidth, 100k MAU, daily backups, no pausing on inactivity. Required for any real user base.
- **CDN and storage.** Use Supabase Storage for file attachments in notes (images, PDFs). Store file URLs in the note content JSON. Supabase Storage integrates with their RLS system for access control.
- **Deploy backend to cloud.** If a server-side relay is ever needed (e.g., for push notifications, webhooks, or compute-heavy operations), deploy to Railway or Fly.io. Both offer free tiers and auto-scale. Use HTTPS so Android connects without cleartext restrictions.

### For a full product

- **Push notifications.** Use Expo Push Notifications (EAS-hosted FCM/APNs relay). Trigger from a Supabase Edge Function on database events (e.g., note shared with you).
- **Full-text search.** Enable `pg_trgm` or `pgvector` in Supabase. Use Supabase's built-in full-text search (`to_tsvector`) on the `notes.title` + `content` fields. Add a search bar that queries Supabase directly.
- **Web app deployment.** Deploy the Next.js app to Vercel (zero config, free for personal use). Add a custom domain. Currently the web app only runs locally.
- **Mobile app stores.** Build a production EAS profile and submit to Google Play and Apple App Store. Requires a developer account ($99/year Apple, $25 one-time Google). The `app.json` already has the necessary identifiers (`com.notesapp.mobile`).
- **Multi-device controller rooms.** The current controller supports one phone + one web viewer per room. Adding presence tracking (`supabase.channel().track()`) would show how many devices are in a room and distinguish multiple senders.
- **ROS2 controller improvements.** Publish separate pressed/released topics, or use `sensor_msgs/Joy` instead of `std_msgs/String` for better integration with existing ROS2 teleoperation nodes. Add analog axis simulation (simulate joystick from D-pad).
- **Analytics and observability.** Integrate PostHog (open-source, self-hostable) for event tracking. Add Sentry for error reporting on both web and mobile. Without these, production bugs are invisible.
