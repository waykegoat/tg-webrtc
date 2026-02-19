<template>
  <div class="app" :class="{ 'in-call': callState !== 'idle' }">

    <!-- ═══ IDLE: Main screen ═══ -->
    <template v-if="callState === 'idle'">
      <header class="hdr">
        <div class="hdr-left">
          <span class="hdr-dot" :class="wsConnected ? 'on' : 'off'"></span>
          <span class="hdr-title">Звонки</span>
        </div>
        <button class="hdr-share" @click="shareInvite">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          <span>Пригласить</span>
        </button>
      </header>

      <!-- Tabs -->
      <div class="tabs">
        <button class="tab" :class="{ sel: tab === 'contacts' }" @click="tab = 'contacts'">Контакты</button>
        <button class="tab" :class="{ sel: tab === 'history' }" @click="tab = 'history'; fetchHistory()">История</button>
        <button class="tab" :class="{ sel: tab === 'dial' }" @click="tab = 'dial'">Набрать</button>
      </div>

      <!-- Contacts list -->
      <div v-if="tab === 'contacts'" class="contacts-wrap">
        <div v-if="contacts.length === 0" class="empty">
          <p>Пока нет контактов</p>
          <p class="empty-sub">Нажмите «Пригласить» чтобы<br>добавить друзей по ссылке</p>
        </div>
        <div v-else class="contacts-list">
          <div
            v-for="c in contacts"
            :key="c.id"
            class="contact-row"
            @click="callContact(c)"
          >
            <div class="contact-avatar" :class="{ 'av-on': c.online }">
              {{ contactInitials(c) }}
            </div>
            <div class="contact-info">
              <span class="contact-name">
                {{ contactDisplayName(c) }}
                <span v-if="c.isFriend" class="friend-badge">друг</span>
              </span>
              <span class="contact-status">{{ c.online ? 'онлайн' : 'офлайн' }}</span>
            </div>
            <div class="contact-actions">
              <button class="icon-btn" @click.stop="callContactAudio(c)" title="Аудио">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
              </button>
              <button class="icon-btn" @click.stop="callContactVideo(c)" title="Видео">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
              </button>
            </div>
          </div>
        </div>
        <button class="refresh-btn" :class="{ loading: refreshingContacts }" @click="doRefreshContacts" :disabled="refreshingContacts">
          <svg class="refresh-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          Обновить
        </button>
      </div>

      <!-- History tab -->
      <div v-if="tab === 'history'" class="contacts-wrap">
        <div v-if="history.length === 0" class="empty">
          <p>Нет звонков</p>
          <p class="empty-sub">История вызовов появится<br>после первого звонка</p>
        </div>
        <div v-else class="contacts-list">
          <div v-for="h in history" :key="h.id" class="history-row">
            <div class="hist-icon" :class="h.callerId === myUserId ? 'out' : 'inc'">
              <svg v-if="h.callerId === myUserId" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/></svg>
            </div>
            <div class="hist-info">
              <span class="hist-name">{{ histPeerName(h) }}</span>
              <span class="hist-meta">
                {{ h.type === 'video' ? 'Видео' : 'Аудио' }} · {{ formatDuration(h.duration) }} · {{ h.status }}
              </span>
            </div>
            <div class="hist-time">{{ formatTime(h.startTime) }}</div>
          </div>
        </div>
        <button class="refresh-btn" :class="{ loading: refreshingHistory }" @click="doRefreshHistory" :disabled="refreshingHistory">
          <svg class="refresh-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          Обновить
        </button>
      </div>

      <!-- Dial pad -->
      <div v-if="tab === 'dial'" class="dial-wrap">
        <input
          v-model="targetUserId"
          type="text"
          inputmode="numeric"
          placeholder="Telegram ID"
          class="dial-input"
        />
        <div class="dial-btns">
          <button class="dbtn dbtn-video" :disabled="!targetUserId || !wsConnected" @click="startCall(false)">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
            <span>Видео</span>
          </button>
          <button class="dbtn dbtn-audio" :disabled="!targetUserId || !wsConnected" @click="startCall(true)">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
            <span>Аудио</span>
          </button>
        </div>
      </div>
    </template>

    <!-- ═══ INCOMING ═══ -->
    <div v-if="callState === 'incoming'" class="scene incoming-scene">
      <div class="inc-pulse"></div>
      <div class="inc-avatar">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      </div>
      <p class="inc-label">Входящий звонок</p>
      <p class="inc-name">{{ callerDisplayName }}</p>
      <div class="inc-btns">
        <button class="round-btn reject-btn" @click="rejectCall">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <button class="round-btn accept-btn" @click="acceptCall">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
        </button>
      </div>
    </div>

    <!-- ═══ CALLING ═══ -->
    <div v-if="callState === 'calling'" class="scene calling-scene">
      <video ref="callingLocalVideo" class="pip-video" autoplay playsinline muted></video>
      <div class="calling-pulse"></div>
      <p class="calling-label">Вызов...</p>
      <p class="calling-name">{{ targetUserId }}</p>
      <button class="round-btn reject-btn" @click="hangup">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <!-- ═══ ACTIVE CALL ═══ -->
    <div v-if="callState === 'active'" class="scene active-scene">
      <div class="vid-wrap">
        <video ref="mainVideo" class="main-video" autoplay playsinline :muted="isSwapped"></video>
        <transition name="fade">
          <div v-if="showMainAvatar" class="vid-avatar-overlay">
            <div class="vid-avatar">{{ mainAvatarLetter }}</div>
            <span class="vid-avatar-name">{{ mainAvatarName }}</span>
          </div>
        </transition>
        <video ref="pipVideoEl" class="pip-video pip-active" autoplay playsinline :muted="!isSwapped" @click="swapVideos"></video>
        <transition name="fade">
          <div v-if="showPipAvatar" class="pip-avatar-overlay" @click="swapVideos">
            <div class="vid-avatar sm">{{ pipAvatarLetter }}</div>
          </div>
        </transition>
        <div class="timer-badge">{{ callDuration }}</div>
      </div>
      <div class="ctrls">
        <button class="ctrl" :class="{ on: isMuted }" @click="toggleMute">
          <svg v-if="!isMuted" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
        </button>
        <button class="ctrl" :class="{ on: isSpeaker }" @click="toggleSpeaker">
          <svg v-if="isSpeaker" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>
          <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
        </button>
        <button class="ctrl end-ctrl" @click="hangup">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        </button>
        <button class="ctrl" :class="{ on: isCamOff }" @click="toggleCamera">
          <svg v-if="!isCamOff" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        </button>
        <button class="ctrl" @click="flipCamera" :disabled="isCamOff || audioOnly">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
        </button>
      </div>
    </div>

    <!-- Toast -->
    <transition name="toast">
      <div v-if="toastMsg" class="toast" :class="toastType" @click="toastMsg = ''">
        {{ toastMsg }}
      </div>
    </transition>

  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import SimplePeer from 'simple-peer'

// ─── Config ───
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000'
const API_URL = WS_URL.replace('wss://', 'https://').replace('ws://', 'http://')
const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME || ''

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
]

// ─── Reactive state ───
const tab = ref('contacts')
const myUserId = ref('')
const myProfile = ref(null)
const targetUserId = ref('')
const remoteUserId = ref('')
const callState = ref('idle')
const wsConnected = ref(false)
const toastMsg = ref('')
const toastType = ref('info')
const contacts = ref([])
const history = ref([])

const isMuted = ref(false)
const isCamOff = ref(false)
const isSpeaker = ref(false)
const audioOnly = ref(false)
const isSwapped = ref(false)
const facingFront = ref(true)
const refreshingContacts = ref(false)
const refreshingHistory = ref(false)

const callingLocalVideo = ref(null)
const mainVideo = ref(null)
const pipVideoEl = ref(null)

let ws = null
let peer = null
let localStream = null
let remoteStream = null
let reconnectTimer = null
let callStartTime = null
let durationTimer = null
let pendingSignals = []
let speakerEl = null
let earpieceEl = null
const callDurationSec = ref(0)

const callDuration = computed(() => {
  const m = Math.floor(callDurationSec.value / 60)
  const s = callDurationSec.value % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

const callerDisplayName = computed(() => {
  const c = contacts.value.find((x) => x.id === remoteUserId.value)
  if (c) return contactDisplayName(c)
  return remoteUserId.value
})

const myInitial = computed(() => {
  if (myProfile.value?.firstName) return myProfile.value.firstName.charAt(0).toUpperCase()
  return 'Я'
})

const peerInitial = computed(() => {
  const c = contacts.value.find((x) => x.id === remoteUserId.value)
  if (c) return contactInitials(c)
  return '#'
})

const peerName = computed(() => {
  const c = contacts.value.find((x) => x.id === remoteUserId.value)
  if (c) return contactDisplayName(c)
  return remoteUserId.value
})

const showMainAvatar = computed(() => isSwapped.value ? isCamOff.value : audioOnly.value)
const showPipAvatar = computed(() => isSwapped.value ? audioOnly.value : isCamOff.value)
const mainAvatarLetter = computed(() => isSwapped.value ? myInitial.value : peerInitial.value)
const mainAvatarName = computed(() => isSwapped.value ? 'Вы' : peerName.value)
const pipAvatarLetter = computed(() => isSwapped.value ? peerInitial.value : myInitial.value)

// ─── Helpers ───
function contactDisplayName(c) {
  if (c.firstName || c.lastName) return [c.firstName, c.lastName].filter(Boolean).join(' ')
  if (c.username) return '@' + c.username
  return c.id
}

function contactInitials(c) {
  if (c.firstName) return c.firstName.charAt(0).toUpperCase()
  if (c.username) return c.username.charAt(0).toUpperCase()
  return '#'
}

function formatDuration(sec) {
  if (!sec || sec < 1) return '0:00'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.toDateString() === now.toDateString()) return time
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${time}`
}

function histPeerName(h) {
  const peerId = h.callerId === myUserId.value ? h.receiverId : h.callerId
  const peerInfo = h.callerId === myUserId.value ? h.receiverName : h.callerName
  if (peerInfo?.firstName) return [peerInfo.firstName, peerInfo.lastName].filter(Boolean).join(' ')
  if (peerInfo?.username) return '@' + peerInfo.username
  return peerId
}

// ─── Telegram WebApp ───
function initTelegram() {
  const tg = window.Telegram?.WebApp
  if (tg) {
    tg.ready()
    tg.expand()
    const user = tg.initDataUnsafe?.user
    if (user) {
      myUserId.value = String(user.id)
      myProfile.value = {
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        username: user.username || '',
      }
    }
    // Handle deep link referral: start_param = "add_USERID"
    const startParam = tg.initDataUnsafe?.start_param || ''
    if (startParam.startsWith('add_') && myUserId.value) {
      const friendId = startParam.slice(4)
      if (friendId && friendId !== myUserId.value) {
        addFriendViaApi(friendId)
      }
    }
  }
  if (!myUserId.value) {
    const saved = localStorage.getItem('zvonki_user_id')
    if (saved) {
      myUserId.value = saved
    } else {
      const input = prompt('Введите ваш Telegram ID:')
      if (input) {
        myUserId.value = input.trim()
        localStorage.setItem('zvonki_user_id', myUserId.value)
      }
    }
  }
}

async function addFriendViaApi(friendId) {
  try {
    await fetch(`${API_URL}/api/add-friend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: myUserId.value,
        friendId,
        userProfile: myProfile.value,
      }),
    })
    showToast('Контакт добавлен!', 'info')
    fetchContacts()
  } catch (e) {
    console.warn('[API] add-friend failed:', e)
  }
}

function shareInvite() {
  const botUser = BOT_USERNAME
  const link = botUser
    ? `https://t.me/${botUser}?start=add_${myUserId.value}`
    : `Мой ID для звонков: ${myUserId.value}`

  const tg = window.Telegram?.WebApp
  if (tg && botUser) {
    tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Добавь меня в контакты для звонков!')}`)
  } else if (navigator.share) {
    navigator.share({ title: 'Звонки', text: 'Добавь меня в контакты!', url: link }).catch(() => {})
  } else {
    navigator.clipboard?.writeText(link)
    showToast('Ссылка скопирована', 'info')
  }
}

async function registerProfile() {
  try {
    await fetch(`${API_URL}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: myUserId.value,
        firstName: myProfile.value?.firstName || '',
        lastName: myProfile.value?.lastName || '',
        username: myProfile.value?.username || '',
      }),
    })
  } catch (e) {
    console.warn('[API] register failed:', e)
  }
}

async function fetchContacts() {
  try {
    const res = await fetch(`${API_URL}/api/contacts?userId=${myUserId.value}`)
    contacts.value = await res.json()
  } catch (e) {
    console.warn('[API] contacts failed:', e)
  }
}

async function doRefreshContacts() {
  refreshingContacts.value = true
  await fetchContacts()
  setTimeout(() => { refreshingContacts.value = false }, 600)
}

async function fetchHistory() {
  try {
    const res = await fetch(`${API_URL}/api/history?userId=${myUserId.value}`)
    history.value = await res.json()
  } catch (e) {
    console.warn('[API] history failed:', e)
  }
}

async function doRefreshHistory() {
  refreshingHistory.value = true
  await fetchHistory()
  setTimeout(() => { refreshingHistory.value = false }, 600)
}

async function saveCallLog(status) {
  const peerId = remoteUserId.value || targetUserId.value
  if (!peerId) return
  try {
    await fetch(`${API_URL}/api/call-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callerId: callStartedByMe ? myUserId.value : peerId,
        receiverId: callStartedByMe ? peerId : myUserId.value,
        startTime: callStartTime || Date.now(),
        duration: callDurationSec.value,
        type: audioOnly.value ? 'audio' : 'video',
        status,
      }),
    })
  } catch (e) {
    console.warn('[API] call-log failed:', e)
  }
}

let callStartedByMe = false

// ─── WebSocket ───
function connectWs() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
  ws = new WebSocket(WS_URL)

  ws.onopen = () => {
    wsConnected.value = true
    ws.send(JSON.stringify({
      type: 'register',
      userId: myUserId.value,
      profile: myProfile.value || { firstName: '', lastName: '', username: '' },
    }))
  }

  ws.onmessage = (e) => {
    let msg
    try { msg = JSON.parse(e.data) } catch { return }
    handleSignal(msg)
  }

  ws.onclose = () => {
    wsConnected.value = false
    reconnectTimer = setTimeout(connectWs, 3000)
  }

  ws.onerror = () => {}
}

function sendWs(msg) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

// ─── Signal handler ───
function handleSignal(msg) {
  switch (msg.type) {
    case 'registered':
      break

    case 'call':
      if (callState.value !== 'idle') {
        sendWs({ type: 'busy', targetUserId: msg.from })
        return
      }
      remoteUserId.value = msg.from
      callState.value = 'incoming'
      audioOnly.value = msg.payload?.audioOnly || false
      callStartedByMe = false
      break

    case 'signal':
      if (peer) {
        peer.signal(msg.payload)
      } else {
        pendingSignals.push(msg.payload)
      }
      break

    case 'hangup':
      showToast('Собеседник завершил звонок', 'warn')
      cleanup('завершён')
      break

    case 'reject':
      showToast('Звонок отклонён', 'warn')
      cleanup('отклонён')
      break

    case 'busy':
      showToast('Собеседник занят', 'warn')
      cleanup('занят')
      break

    case 'offline':
      showToast(msg.message || 'Не в сети', 'info')
      cleanup('не в сети')
      break

    case 'error':
      showToast(msg.message, 'err')
      if (callState.value === 'calling') cleanup('ошибка')
      break
  }
}

// ─── Media ───
async function getMedia(onlyAudio) {
  try {
    return await navigator.mediaDevices.getUserMedia(
      onlyAudio
        ? { audio: true, video: false }
        : { audio: true, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } }
    )
  } catch (err) {
    showToast('Нет доступа к камере/микрофону', 'err')
    return null
  }
}

// ─── Call logic ───
function callContact(c) {
  targetUserId.value = c.id
  tab.value = 'dial'
}
function callContactVideo(c) { targetUserId.value = c.id; startCall(false) }
function callContactAudio(c) { targetUserId.value = c.id; startCall(true) }

async function startCall(isAudioOnly) {
  if (!targetUserId.value) return
  audioOnly.value = isAudioOnly
  callStartedByMe = true
  const stream = await getMedia(isAudioOnly)
  if (!stream) return
  localStream = stream
  callState.value = 'calling'
  remoteUserId.value = targetUserId.value

  await nextTick()
  if (callingLocalVideo.value && !isAudioOnly) {
    callingLocalVideo.value.srcObject = stream
  }

  sendWs({ type: 'call', targetUserId: targetUserId.value, payload: { audioOnly: isAudioOnly } })
  createPeer(true, stream)
}

async function acceptCall() {
  const stream = await getMedia(audioOnly.value)
  if (!stream) { rejectCall(); return }
  localStream = stream
  callState.value = 'active'
  startDurationTimer()
  createPeer(false, stream)

  if (pendingSignals.length > 0) {
    pendingSignals.forEach((s) => peer.signal(s))
    pendingSignals = []
  }

  await nextTick()
  assignVideos()
}

function rejectCall() {
  sendWs({ type: 'reject', targetUserId: remoteUserId.value })
  cleanup('отклонён')
}

function hangup() {
  const target = remoteUserId.value || targetUserId.value
  if (target) sendWs({ type: 'hangup', targetUserId: target })
  cleanup('завершён')
}

// ─── Peer ───
function createPeer(initiator, stream) {
  peer = new SimplePeer({ initiator, stream, trickle: true, config: { iceServers: ICE_SERVERS } })

  peer.on('signal', (data) => {
    sendWs({ type: 'signal', targetUserId: remoteUserId.value || targetUserId.value, payload: data })
  })

  peer.on('stream', (rs) => {
    remoteStream = rs
    callState.value = 'active'
    startDurationTimer()
    nextTick(() => {
      assignVideos()
      setupRemoteAudio(rs)
    })
  })

  peer.on('connect', () => console.log('[Peer] Connected'))
  peer.on('close', () => cleanup('завершён'))
  peer.on('error', (err) => {
    showToast('Ошибка: ' + err.message, 'err')
    cleanup('ошибка')
  })
}

function assignVideos() {
  if (!mainVideo.value || !pipVideoEl.value) return
  if (isSwapped.value) {
    mainVideo.value.srcObject = localStream
    pipVideoEl.value.srcObject = remoteStream
  } else {
    mainVideo.value.srcObject = remoteStream
    pipVideoEl.value.srcObject = localStream
  }
}

function swapVideos() {
  isSwapped.value = !isSwapped.value
  assignVideos()
}

// ─── Controls ───
function toggleMute() {
  if (!localStream) return
  localStream.getAudioTracks().forEach((t) => { t.enabled = !t.enabled })
  isMuted.value = !isMuted.value
}

async function toggleCamera() {
  if (!peer || !localStream) return
  const vt = localStream.getVideoTracks()
  if (vt.length > 0) {
    const on = !vt[0].enabled
    vt.forEach((t) => { t.enabled = on })
    isCamOff.value = !on
  } else {
    try {
      const vs = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      })
      const track = vs.getVideoTracks()[0]
      localStream.addTrack(track)
      peer.addTrack(track, localStream)
      isCamOff.value = false
      audioOnly.value = false
      await nextTick()
      assignVideos()
    } catch { showToast('Не удалось включить камеру', 'err') }
  }
}

async function flipCamera() {
  if (!peer || !localStream || isCamOff.value || audioOnly.value) return
  const oldTrack = localStream.getVideoTracks()[0]
  if (!oldTrack) return
  oldTrack.stop()
  localStream.removeTrack(oldTrack)
  facingFront.value = !facingFront.value
  try {
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facingFront.value ? 'user' : 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
    })
    const newTrack = newStream.getVideoTracks()[0]
    localStream.addTrack(newTrack)
    peer.replaceTrack(oldTrack, newTrack, localStream)
    await nextTick()
    assignVideos()
  } catch (e) {
    showToast('Не удалось переключить камеру', 'err')
  }
}

// ─── Speaker / earpiece toggle ───
// Mobile trick: <video> plays through loudspeaker, <audio> through earpiece
function setupRemoteAudio(rs) {
  cleanupAudioEls()
  // Create both elements, only one active at a time
  earpieceEl = document.createElement('audio')
  earpieceEl.srcObject = rs
  earpieceEl.autoplay = true
  earpieceEl.playsInline = true
  earpieceEl.style.display = 'none'
  document.body.appendChild(earpieceEl)

  speakerEl = document.createElement('video')
  speakerEl.srcObject = rs
  speakerEl.autoplay = false
  speakerEl.playsInline = true
  speakerEl.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;'
  document.body.appendChild(speakerEl)

  applySpeaker()
}

function toggleSpeaker() {
  isSpeaker.value = !isSpeaker.value
  applySpeaker()
}

function applySpeaker() {
  if (isSpeaker.value) {
    // Speaker mode: play via hidden <video>, mute <audio>
    if (earpieceEl) { earpieceEl.muted = true; earpieceEl.pause() }
    if (speakerEl) { speakerEl.muted = false; speakerEl.play().catch(() => {}) }
  } else {
    // Earpiece mode: play via <audio>, mute <video>
    if (speakerEl) { speakerEl.muted = true; speakerEl.pause() }
    if (earpieceEl) { earpieceEl.muted = false; earpieceEl.play().catch(() => {}) }
  }
}

function cleanupAudioEls() {
  if (earpieceEl) { earpieceEl.srcObject = null; earpieceEl.remove(); earpieceEl = null }
  if (speakerEl) { speakerEl.srcObject = null; speakerEl.remove(); speakerEl = null }
}

// ─── Timer ───
function startDurationTimer() {
  if (durationTimer) return
  callStartTime = Date.now()
  callDurationSec.value = 0
  durationTimer = setInterval(() => {
    callDurationSec.value = Math.floor((Date.now() - callStartTime) / 1000)
  }, 1000)
}

// ─── Toast ───
function showToast(msg, type = 'info') {
  toastMsg.value = msg
  toastType.value = type
  setTimeout(() => { toastMsg.value = '' }, 4000)
}

// ─── Cleanup ───
function cleanup(status) {
  // Only the initiator saves the call log to avoid duplicates
  if (callStartedByMe && callState.value !== 'idle' && (remoteUserId.value || targetUserId.value)) {
    saveCallLog(status || 'завершён')
  }

  if (peer) { peer.destroy(); peer = null }
  if (localStream) { localStream.getTracks().forEach((t) => t.stop()); localStream = null }
  remoteStream = null
  if (durationTimer) { clearInterval(durationTimer); durationTimer = null }
  cleanupAudioEls()
  callState.value = 'idle'
  isMuted.value = false
  isCamOff.value = false
  isSpeaker.value = false
  isSwapped.value = false
  facingFront.value = true
  callDurationSec.value = 0
  pendingSignals = []
  callStartedByMe = false
  fetchContacts()
}

// ─── Lifecycle ───
onMounted(() => {
  initTelegram()
  if (myUserId.value) {
    registerProfile()
    connectWs()
    fetchContacts()
  }
})

onUnmounted(() => {
  cleanup()
  if (reconnectTimer) clearTimeout(reconnectTimer)
  if (ws) ws.close()
})
</script>

<style>
:root {
  --bg: #0d0d0d;
  --card: #161616;
  --border: #232323;
  --text: #e8e8e8;
  --text2: #888;
  --accent: #5b7fff;
  --green: #34d399;
  --red: #f43f5e;
  --radius: 14px;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  overflow: hidden;
  -webkit-tap-highlight-color: transparent;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-width: 480px;
  margin: 0 auto;
}

/* ─── Header ─── */
.hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}
.hdr-left { display: flex; align-items: center; gap: 10px; }
.hdr-dot { width: 8px; height: 8px; border-radius: 50%; }
.hdr-dot.on { background: var(--green); }
.hdr-dot.off { background: var(--red); }
.hdr-title { font-size: 18px; font-weight: 700; }
.hdr-share {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 20px;
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background .15s;
}
.hdr-share:active { background: var(--border); }

/* ─── Tabs ─── */
.tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
}
.tab {
  flex: 1;
  padding: 12px;
  background: none;
  border: none;
  color: var(--text2);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all .2s;
}
.tab.sel {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

/* ─── Contacts ─── */
.contacts-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 60%;
  color: var(--text2);
  font-size: 15px;
}
.empty-sub { font-size: 13px; margin-top: 8px; text-align: center; opacity: .6; }

.contacts-list { display: flex; flex-direction: column; }

.contact-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  cursor: pointer;
  transition: background .15s;
}
.contact-row:active { background: var(--card); }

.contact-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--card);
  border: 2px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 16px;
  color: var(--text2);
  flex-shrink: 0;
}
.contact-avatar.av-on { border-color: var(--green); color: var(--green); }

.contact-info { flex: 1; min-width: 0; }
.contact-name { display: flex; align-items: center; gap: 6px; font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.friend-badge {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .5px;
  color: var(--accent);
  background: rgba(91,127,255,.12);
  padding: 1px 6px;
  border-radius: 6px;
  flex-shrink: 0;
}
.contact-status { font-size: 12px; color: var(--text2); display: block; }

.contact-actions { display: flex; gap: 8px; }
.icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: var(--card);
  color: var(--text2);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background .15s, color .15s;
}
.icon-btn:active { background: var(--accent); color: #fff; }

.refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 16px auto;
  padding: 8px 24px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 20px;
  color: var(--text2);
  font-size: 13px;
  cursor: pointer;
  transition: opacity .2s, background .15s;
}
.refresh-btn:active { background: var(--border); }
.refresh-btn:disabled { opacity: .5; cursor: not-allowed; }
.refresh-icon { transition: transform .3s ease; }
.refresh-btn.loading .refresh-icon { animation: spin .7s linear infinite; }
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.contacts-list { animation: listIn .3s ease; }
@keyframes listIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ─── History ─── */
.history-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
}
.hist-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.hist-icon.out { background: rgba(91,127,255,.15); color: var(--accent); }
.hist-icon.inc { background: rgba(52,211,153,.15); color: var(--green); }
.hist-info { flex: 1; min-width: 0; }
.hist-name { display: block; font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hist-meta { display: block; font-size: 12px; color: var(--text2); }
.hist-time { font-size: 12px; color: var(--text2); white-space: nowrap; flex-shrink: 0; }

/* ─── Dial ─── */
.dial-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 20px;
  gap: 20px;
}

.dial-input {
  width: 100%;
  max-width: 300px;
  padding: 16px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: #fff;
  font-size: 20px;
  text-align: center;
  outline: none;
  font-family: monospace;
  transition: border-color .2s;
}
.dial-input:focus { border-color: var(--accent); }
.dial-input::placeholder { color: #444; }

.dial-btns { display: flex; gap: 12px; width: 100%; max-width: 300px; }
.dbtn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px;
  border: none;
  border-radius: var(--radius);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  color: #fff;
  transition: transform .1s, opacity .2s;
}
.dbtn:active { transform: scale(.97); }
.dbtn:disabled { opacity: .3; cursor: not-allowed; }
.dbtn-video { background: var(--accent); }
.dbtn-audio { background: var(--green); }

/* ─── Scenes ─── */
.scene {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  animation: sceneIn .3s ease;
}
@keyframes sceneIn {
  from { opacity: 0; transform: scale(.97); }
  to { opacity: 1; transform: scale(1); }
}

/* Fade transition */
.fade-enter-active, .fade-leave-active { transition: opacity .25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* Incoming */
.incoming-scene { gap: 16px; background: var(--bg); }
.inc-pulse {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  border: 2px solid var(--green);
  animation: pulse 2s ease-out infinite;
}
.inc-avatar {
  margin-top: -90px;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--card);
  display: flex;
  align-items: center;
  justify-content: center;
}
.inc-label { font-size: 14px; color: var(--text2); margin-top: 24px; }
.inc-name { font-size: 22px; font-weight: 700; }
.inc-btns { display: flex; gap: 40px; margin-top: 40px; }

.round-btn {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform .1s;
}
.round-btn:active { transform: scale(.9); }
.accept-btn { background: var(--green); }
.reject-btn { background: var(--red); }

/* Calling */
.calling-scene { gap: 16px; background: var(--bg); position: relative; }
.calling-pulse {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 2px solid var(--accent);
  animation: pulse 2s ease-out infinite;
}
.calling-label { font-size: 14px; color: var(--text2); }
.calling-name { font-size: 22px; font-weight: 700; margin-bottom: 32px; }

@keyframes pulse {
  0% { transform: scale(.85); opacity: 1; }
  100% { transform: scale(1.5); opacity: 0; }
}

/* Active call */
.active-scene { background: #000; padding: 0; }
.vid-wrap { flex: 1; position: relative; width: 100%; overflow: hidden; }
.main-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #111;
}
.pip-video {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 110px;
  height: 150px;
  object-fit: cover;
  border-radius: 12px;
  border: 2px solid rgba(255,255,255,.15);
  z-index: 10;
  background: #1a1a1a;
  cursor: pointer;
  transition: transform .15s;
}
.pip-active:active { transform: scale(.95); }

.timer-badge {
  position: absolute;
  top: 12px;
  left: 12px;
  background: rgba(0,0,0,.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  font-family: monospace;
  z-index: 10;
}

/* Controls */
.ctrls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  padding: 16px 12px;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
  background: rgba(0,0,0,.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.ctrl {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  border: none;
  background: rgba(255,255,255,.1);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background .15s;
}
.ctrl.on { background: rgba(255,255,255,.25); }
.ctrl:active { transform: scale(.9); }
.ctrl:disabled { opacity: .3; cursor: not-allowed; }
.ctrl:disabled:active { transform: none; }

.end-ctrl {
  background: var(--red);
  width: 58px;
  height: 58px;
}

/* Toast */
.toast {
  position: fixed;
  bottom: 90px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  z-index: 200;
  max-width: 90%;
  text-align: center;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
/* Video avatar overlays */
.vid-avatar-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  z-index: 5;
  gap: 12px;
}
.pip-avatar-overlay {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 110px;
  height: 150px;
  border-radius: 12px;
  border: 2px solid rgba(255,255,255,.15);
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  z-index: 11;
  cursor: pointer;
}
.vid-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: rgba(91,127,255,.15);
  border: 2px solid rgba(91,127,255,.35);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: 700;
  color: var(--accent);
}
.vid-avatar.sm {
  width: 48px;
  height: 48px;
  font-size: 20px;
}
.vid-avatar-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  opacity: .7;
}

.toast.info { background: rgba(91,127,255,.85); color: #fff; }
.toast.warn { background: rgba(250,204,21,.85); color: #000; }
.toast.err { background: rgba(244,63,94,.85); color: #fff; }

.toast-enter-active { animation: tIn .25s ease; }
.toast-leave-active { animation: tIn .2s ease reverse; }
@keyframes tIn {
  from { opacity: 0; transform: translateX(-50%) translateY(10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
</style>
