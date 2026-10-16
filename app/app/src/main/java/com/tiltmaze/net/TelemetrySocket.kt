package com.tiltmaze.net

import kotlinx.coroutines.*
import okhttp3.*
import okio.ByteString
import okio.ByteString.Companion.toByteString
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.TimeUnit

interface TelemetryListener {
    fun onConnected(playerSlot: Int, sessionId: String, roomCode: String)
    fun onDisconnected()
    fun onLatencyUpdate(rttMs: Long)
    fun onHapticTrigger(effect: String, durationMs: Long, intensity: Float)
    fun onCalibrateRequest()
    fun onError(message: String)
}

class TelemetrySocket(private val listener: TelemetryListener) {
    private val client = OkHttpClient.Builder()
        .pingInterval(15, TimeUnit.SECONDS)
        .build()

    private var webSocket: WebSocket? = null
    private var isStreaming = false
    private var streamingJob: Job? = null
    private var ntpJob: Job? = null
    private var scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // Protocol State
    private var playerSlot = 1
    private var sessionId: String? = null
    private var roomCode: String = ""
    private var sequenceNumber = 0

    // Button states
    @Volatile var isBoostActive = false
    @Volatile var isBrakeActive = false

    // Bitmask constants
    private val BUTTON_BOOST = 1 shl 0
    private val BUTTON_BRAKE = 1 shl 1
    private val BUTTON_SHAKE = 1 shl 2
    private val BUTTON_RECALIBRATE = 1 shl 3

    fun connect(wsUrl: String, code: String, existingSessionId: String? = null, deviceName: String = "Nothing Phone 3") {
        this.roomCode = code.uppercase()
        this.sessionId = existingSessionId

        if (!scope.isActive) {
            scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
        }

        val request = Request.Builder().url(wsUrl).build()
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                // Send JSON JOIN_ROOM control message
                val joinMsg = JSONObject().apply {
                    put("type", "JOIN_ROOM")
                    put("roomCode", roomCode)
                    sessionId?.let { put("sessionId", it) }
                    put("deviceName", deviceName)
                }
                ws.send(joinMsg.toString())
                startNtpLoop()
            }

            override fun onMessage(ws: WebSocket, text: String) {
                try {
                    val json = JSONObject(text)
                    when (json.optString("type")) {
                        "JOINED_ROOM" -> {
                            playerSlot = json.getInt("playerSlot")
                            sessionId = json.getString("sessionId")
                            listener.onConnected(playerSlot, sessionId!!, roomCode)
                        }
                        "NTP_PONG" -> {
                            val t0 = json.getLong("clientSendTime")
                            val rtt = System.currentTimeMillis() - t0
                            listener.onLatencyUpdate(rtt)
                        }
                        "HAPTIC_EVENT" -> {
                            val effect = json.optString("effect", "impactLight")
                            val duration = json.optLong("durationMs", 50L)
                            val intensity = json.optDouble("intensity", 0.5).toFloat()
                            listener.onHapticTrigger(effect, duration, intensity)
                        }
                        "CALIBRATE_REQUEST" -> {
                            listener.onCalibrateRequest()
                        }
                        "ERROR" -> {
                            listener.onError(json.optString("message", "Unknown server error"))
                        }
                    }
                } catch (e: Exception) {
                    // Ignore malformed JSON
                }
            }

            override fun onClosing(ws: WebSocket, code: Int, reason: String) {
                listener.onDisconnected()
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                listener.onError("Connection error: ${t.message}")
                listener.onDisconnected()
            }
        })
    }

    /**
     * Starts the 60Hz coroutine loop streaming the 20-byte binary telemetry frame.
     * Scheduled against a monotonic clock (System.nanoTime) to eliminate drift.
     */
    fun startStreaming(motionProvider: () -> com.tiltmaze.sensor.MotionData) {
        if (isStreaming) return
        isStreaming = true

        streamingJob = scope.launch {
            val byteBuffer = ByteBuffer.allocate(20).order(ByteOrder.LITTLE_ENDIAN)
            val periodNs = 16_666_667L // 16.666ms period (60Hz)
            var nextSendTimeNs = System.nanoTime()

            while (isActive && isStreaming) {
                val ws = webSocket
                if (ws == null) {
                    delay(16)
                    continue
                }

                // Check TCP queueSize first before consuming any motion pulses
                // so that a Wi-Fi stall never discards pulses or builds a burst backlog.
                if (ws.queueSize() > 512L) {
                    nextSendTimeNs = System.nanoTime() + periodNs
                    delay(16)
                    continue
                }

                // Only consume motion frame when frame is guaranteed to be dispatched
                val motion = motionProvider()

                // Calculate Button Bitmask
                var bitmask = 0
                if (isBoostActive) bitmask = bitmask or BUTTON_BOOST
                if (isBrakeActive) bitmask = bitmask or BUTTON_BRAKE
                if (motion.shakeTriggered) bitmask = bitmask or BUTTON_SHAKE
                if (motion.recalibratedPulse) bitmask = bitmask or BUTTON_RECALIBRATE

                sequenceNumber = (sequenceNumber + 1) and 0xFF

                byteBuffer.clear()
                byteBuffer.put(0x01.toByte())                       // Byte 0: packetType (0x01)
                byteBuffer.put(playerSlot.toByte())                  // Byte 1: playerSlot (1 or 2)
                byteBuffer.put(bitmask.toByte())                     // Byte 2: buttonBitmask
                byteBuffer.put(sequenceNumber.toByte())              // Byte 3: sequenceNumber
                byteBuffer.putFloat(motion.pitch)                    // Bytes 4-7: calibratedPitch (Float32 LE)
                byteBuffer.putFloat(motion.roll)                     // Bytes 8-11: calibratedRoll (Float32 LE)
                byteBuffer.putFloat(motion.yaw)                      // Bytes 12-15: yaw (Float32 LE)
                byteBuffer.putInt((System.currentTimeMillis() and 0xFFFFFFFFL).toInt()) // Bytes 16-19: clientTimestamp

                val byteString = byteBuffer.array().toByteString(0, 20)
                ws.send(byteString)

                // Schedule next frame against monotonic clock to eliminate drift
                nextSendTimeNs += periodNs
                val sleepNs = nextSendTimeNs - System.nanoTime()
                if (sleepNs > 0) {
                    delay(sleepNs / 1_000_000L)
                } else {
                    // Overran period, reset anchor to current time
                    nextSendTimeNs = System.nanoTime()
                    yield()
                }
            }
        }
    }

    private fun startNtpLoop() {
        ntpJob?.cancel()
        ntpJob = scope.launch {
            while (isActive) {
                val ping = JSONObject().apply {
                    put("type", "NTP_PING")
                    put("clientSendTime", System.currentTimeMillis())
                }
                webSocket?.send(ping.toString())
                delay(1000)
            }
        }
    }

    fun stop() {
        isStreaming = false
        streamingJob?.cancel()
        ntpJob?.cancel()
        scope.cancel()
        webSocket?.close(1000, "User disconnected")
        webSocket = null
    }
}
