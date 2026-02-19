<template>
  <div class="app" :class="{ 'in-call': callState !== 'idle' }">
    <!-- Header -->
    <header class="header">
      <h1>📞 Звонки</h1>
      <div class="status-bar">
        <span class="dot" :class="wsConnected ? 'online' : 'offline'"></span>
        <span>{{ wsConnected ? 'Онлайн' : 'Подключение...' }}</span>
        <span v-if="myUserId" class="my-id">ID: {{ myUserId }}</span>
      </div>
    </header>

    <!-- Idle state: dial screen -->
    <div v-if="callState === 'idle'" class="dial-screen">
      <div class="input-group">
        <label for="targetId">Telegram ID собеседника</label>
        <input
          id="targetId"
          v-model="targetUserId"
          type="text"
          inputmode="numeric"
          placeholder="Введите ID..."
          class="input"
        />
      </div>
      <button
        class="btn btn-call"
        :disabled="!targetUserId || !wsConnected"
        @click="startCall(false)"
      >
        🎥 Видеозвонок
      </button>
      <button
        class="btn btn-audio"
        :disabled="!targetUserId || !wsConnected"
        @click="startCall(true)"
      >
        🎤 Аудиозвонок
      </button>
    </div>

    <!-- Incoming call -->
    <div v-if="callState === 'incoming'" class="incoming-screen">
      <div class="incoming-info">
        <div class="caller-avatar">📲</div>
        <p>Входящий звонок от</p>
        <p class="caller-id">{{ remoteUserId }}</p>
      </div>
      <div class="incoming-actions">
        <button class="btn btn-accept" @click="acceptCall">✅ Принять</button>
        <button class="btn btn-reject" @click="rejectCall">❌ Отклонить</button>
      </div>
    </div>

    <!-- Calling (outgoing, waiting) -->
    <div v-if="callState === 'calling'" class="calling-screen">
      <div class="calling-info">
        <div class="pulse-ring"></div>
        <p>Вызываем...</p>
        <p class="caller-id">{{ targetUserId }}</p>
      </div>
      <button class="btn btn-hangup" @click="hangup">Отмена</button>
    </div>

    <!-- Active call -->
    <div v-if="callState === 'active'" class="call-screen">
      <div class="video-container">
        <video
          ref="remoteVideo"
          class="remote-video"
          autoplay
          playsinline
        ></video>
        <video
          ref="localVideo"
          class="local-video"
          autoplay
          playsinline
          muted
        ></video>
        <div class="call-timer">{{ callDuration }}</div>
      </div>
      <div class="call-controls">
        <button class="ctrl-btn" :class="{ active: isMuted }" @click="toggleMute">
          {{ isMuted ? '🔇' : '🎤' }}
        </button>
        <button class="ctrl-btn btn-hangup-round" @click="hangup">
          📵
        </button>
        <button class="ctrl-btn" :class="{ active: isCamOff }" @click="toggleCamera">
          {{ isCamOff ? '🚫' : '📷' }}
        </button>
      </div>
    </div>

    <!-- Error toast -->
    <div v-if="errorMsg" class="toast error-toast" @click="errorMsg = ''">
      {{ errorMsg }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from 'vue'
import SimplePeer from 'simple-peer'

// ─── Config ───
const SIGNALING_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
]

// ─── State ───
const myUserId = ref('')
const targetUserId = ref('')
const remoteUserId = ref('')
const callState = ref('idle') // idle | calling | incoming | active
const wsConnected = ref(false)
const errorMsg = ref('')
const isMuted = ref(false)
const isCamOff = ref(false)
const audioOnly = ref(false)

const localVideo = ref(null)
const remoteVideo = ref(null)

let ws = null
let peer = null
let localStream = null
let reconnectTimer = null
let callStartTime = null
let durationTimer = null
const callDurationSec = ref(0)

const callDuration = computed(() => {
  const m = Math.floor(callDurationSec.value / 60)
  const s = callDurationSec.value % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

// Pending signal data for incoming calls (before user accepts)
let pendingSignalData = null

// ─── Telegram WebApp ───
function initTelegram() {
  const tg = window.Telegram?.WebApp
  if (tg) {
    tg.ready()
    tg.expand()
    const user = tg.initDataUnsafe?.user
    if (user) {
      myUserId.value = String(user.id)
    }
  }
  // Fallback: prompt for ID if not in Telegram
  if (!myUserId.value) {
    const saved = localStorage.getItem('zvonki_user_id')
    if (saved) {
      myUserId.value = saved
    } else {
      const input = prompt('Введите ваш Telegram ID (узнайте через @userinfobot):')
      if (input) {
        myUserId.value = input.trim()
        localStorage.setItem('zvonki_user_id', myUserId.value)
      }
    }
  }
}

// ─── WebSocket ───
function connectWs() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

  ws = new WebSocket(SIGNALING_URL)

  ws.onopen = () => {
    wsConnected.value = true
    console.log('[WS] Connected')
    // Register
    ws.send(JSON.stringify({ type: 'register', userId: myUserId.value }))
  }

  ws.onmessage = (event) => {
    let msg
    try { msg = JSON.parse(event.data) } catch { return }
    handleSignal(msg)
  }

  ws.onclose = () => {
    wsConnected.value = false
    console.log('[WS] Disconnected, reconnecting in 3s...')
    reconnectTimer = setTimeout(connectWs, 3000)
  }

  ws.onerror = (err) => {
    console.error('[WS] Error:', err)
  }
}

function sendWs(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

// ─── Signaling handler ───
function handleSignal(msg) {
  switch (msg.type) {
    case 'registered':
      console.log('[Signal] Registered as', msg.userId)
      break

    case 'call':
      // Incoming call request
      if (callState.value !== 'idle') {
        sendWs({ type: 'busy', targetUserId: msg.from })
        return
      }
      remoteUserId.value = msg.from
      pendingSignalData = msg.payload
      callState.value = 'incoming'
      audioOnly.value = msg.payload?.audioOnly || false
      break

    case 'signal':
      // WebRTC signaling data
      if (peer) {
        peer.signal(msg.payload)
      }
      break

    case 'hangup':
      showError('Собеседник завершил звонок')
      cleanup()
      break

    case 'reject':
      showError('Звонок отклонён')
      cleanup()
      break

    case 'busy':
      showError('Собеседник занят')
      cleanup()
      break

    case 'error':
      showError(msg.message)
      if (callState.value === 'calling') cleanup()
      break
  }
}

// ─── Media ───
async function getMedia(audioOnlyMode) {
  try {
    const constraints = audioOnlyMode
      ? { audio: true, video: false }
      : { audio: true, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } }
    localStream = await navigator.mediaDevices.getUserMedia(constraints)
    return localStream
  } catch (err) {
    showError('Не удалось получить доступ к камере/микрофону')
    console.error('[Media]', err)
    return null
  }
}

// ─── Call logic ───
async function startCall(isAudioOnly) {
  if (!targetUserId.value) return
  audioOnly.value = isAudioOnly

  const stream = await getMedia(isAudioOnly)
  if (!stream) return

  callState.value = 'calling'
  remoteUserId.value = targetUserId.value

  await nextTick()
  if (localVideo.value) {
    localVideo.value.srcObject = stream
  }

  // Send call request
  sendWs({
    type: 'call',
    targetUserId: targetUserId.value,
    payload: { audioOnly: isAudioOnly },
  })

  // Create peer as initiator
  createPeer(true, stream)
}

async function acceptCall() {
  const stream = await getMedia(audioOnly.value)
  if (!stream) {
    rejectCall()
    return
  }

  callState.value = 'active'
  startDurationTimer()

  await nextTick()
  if (localVideo.value) {
    localVideo.value.srcObject = stream
  }

  // Create peer as receiver
  createPeer(false, stream)

  // If we had pending signal data, signal it now
  if (pendingSignalData && peer) {
    // The call message itself isn't a peer signal; signals come separately
  }
}

function rejectCall() {
  sendWs({ type: 'reject', targetUserId: remoteUserId.value })
  cleanup()
}

function hangup() {
  const target = remoteUserId.value || targetUserId.value
  if (target) {
    sendWs({ type: 'hangup', targetUserId: target })
  }
  cleanup()
}

// ─── WebRTC Peer ───
function createPeer(initiator, stream) {
  peer = new SimplePeer({
    initiator,
    stream,
    trickle: true,
    config: { iceServers: ICE_SERVERS },
  })

  peer.on('signal', (data) => {
    const target = remoteUserId.value || targetUserId.value
    sendWs({
      type: 'signal',
      targetUserId: target,
      payload: data,
    })
  })

  peer.on('stream', (remoteStream) => {
    console.log('[Peer] Got remote stream')
    callState.value = 'active'
    startDurationTimer()
    nextTick(() => {
      if (remoteVideo.value) {
        remoteVideo.value.srcObject = remoteStream
      }
    })
  })

  peer.on('connect', () => {
    console.log('[Peer] Connected')
  })

  peer.on('close', () => {
    console.log('[Peer] Closed')
    cleanup()
  })

  peer.on('error', (err) => {
    console.error('[Peer] Error:', err)
    showError('Ошибка соединения: ' + err.message)
    cleanup()
  })
}

// ─── Controls ───
function toggleMute() {
  if (!localStream) return
  const audioTracks = localStream.getAudioTracks()
  audioTracks.forEach((t) => { t.enabled = !t.enabled })
  isMuted.value = !isMuted.value
}

function toggleCamera() {
  if (!localStream) return
  const videoTracks = localStream.getVideoTracks()
  videoTracks.forEach((t) => { t.enabled = !t.enabled })
  isCamOff.value = !isCamOff.value
}

// ─── Timer ───
function startDurationTimer() {
  callStartTime = Date.now()
  callDurationSec.value = 0
  durationTimer = setInterval(() => {
    callDurationSec.value = Math.floor((Date.now() - callStartTime) / 1000)
  }, 1000)
}

// ─── Cleanup ───
function cleanup() {
  if (peer) {
    peer.destroy()
    peer = null
  }
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop())
    localStream = null
  }
  if (durationTimer) {
    clearInterval(durationTimer)
    durationTimer = null
  }
  callState.value = 'idle'
  isMuted.value = false
  isCamOff.value = false
  callDurationSec.value = 0
  pendingSignalData = null
}

function showError(msg) {
  errorMsg.value = msg
  setTimeout(() => { errorMsg.value = '' }, 4000)
}

// ─── Lifecycle ───
onMounted(() => {
  initTelegram()
  if (myUserId.value) {
    connectWs()
  }
})

onUnmounted(() => {
  cleanup()
  if (reconnectTimer) clearTimeout(reconnectTimer)
  if (ws) ws.close()
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #1a1a2e;
  color: #eee;
  min-height: 100vh;
  overflow: hidden;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-width: 480px;
  margin: 0 auto;
}

/* Header */
.header {
  padding: 16px 20px;
  background: #16213e;
  border-bottom: 1px solid #0f3460;
}

.header h1 {
  font-size: 20px;
  margin-bottom: 6px;
}

.status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #aaa;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot.online { background: #4ade80; }
.dot.offline { background: #f87171; }

.my-id {
  margin-left: auto;
  color: #60a5fa;
  font-weight: 600;
}

/* Dial screen */
.dial-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 30px 20px;
  gap: 16px;
}

.input-group {
  width: 100%;
  max-width: 320px;
}

.input-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  color: #94a3b8;
}

.input {
  width: 100%;
  padding: 14px 16px;
  border-radius: 12px;
  border: 2px solid #334155;
  background: #0f172a;
  color: #fff;
  font-size: 18px;
  text-align: center;
  outline: none;
  transition: border-color 0.2s;
}

.input:focus {
  border-color: #3b82f6;
}

.btn {
  width: 100%;
  max-width: 320px;
  padding: 16px;
  border: none;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.1s, opacity 0.2s;
}

.btn:active { transform: scale(0.97); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-call {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
}

.btn-audio {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
}

/* Incoming */
.incoming-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 30px 20px;
  gap: 30px;
}

.incoming-info {
  text-align: center;
}

.caller-avatar {
  font-size: 64px;
  margin-bottom: 16px;
  animation: ring 1s ease-in-out infinite;
}

@keyframes ring {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(15deg); }
  75% { transform: rotate(-15deg); }
}

.caller-id {
  font-size: 24px;
  font-weight: 700;
  color: #60a5fa;
  margin-top: 8px;
}

.incoming-actions {
  display: flex;
  gap: 16px;
  width: 100%;
  max-width: 320px;
}

.btn-accept {
  flex: 1;
  background: #22c55e;
  color: #fff;
}

.btn-reject {
  flex: 1;
  background: #ef4444;
  color: #fff;
}

/* Calling */
.calling-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 40px;
}

.calling-info {
  text-align: center;
  position: relative;
}

.pulse-ring {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  border: 3px solid #3b82f6;
  margin: 0 auto 20px;
  animation: pulse 1.5s ease-out infinite;
}

@keyframes pulse {
  0% { transform: scale(0.8); opacity: 1; }
  100% { transform: scale(1.4); opacity: 0; }
}

.btn-hangup {
  background: #ef4444;
  color: #fff;
  width: 200px;
}

/* Active call */
.call-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  background: #000;
}

.video-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.remote-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #111;
}

.local-video {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 120px;
  height: 160px;
  object-fit: cover;
  border-radius: 12px;
  border: 2px solid rgba(255,255,255,0.3);
  z-index: 10;
  background: #222;
}

.call-timer {
  position: absolute;
  top: 12px;
  left: 12px;
  background: rgba(0,0,0,0.6);
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  z-index: 10;
}

.call-controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 24px;
  padding: 20px;
  background: rgba(0,0,0,0.8);
}

.ctrl-btn {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  background: #334155;
  font-size: 24px;
  cursor: pointer;
  transition: background 0.2s;
}

.ctrl-btn.active {
  background: #ef4444;
}

.btn-hangup-round {
  background: #ef4444;
  width: 64px;
  height: 64px;
  font-size: 28px;
}

/* Toast */
.toast {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  border-radius: 12px;
  font-size: 14px;
  z-index: 100;
  cursor: pointer;
  animation: slideUp 0.3s ease;
}

.error-toast {
  background: #dc2626;
  color: #fff;
}

@keyframes slideUp {
  from { transform: translateX(-50%) translateY(20px); opacity: 0; }
  to { transform: translateX(-50%) translateY(0); opacity: 1; }
}
</style>
