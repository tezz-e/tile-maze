package com.tiltmaze

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.tiltmaze.glyph.NothingGlyphController
import com.tiltmaze.haptics.HapticManager
import com.tiltmaze.net.TelemetryListener
import com.tiltmaze.net.TelemetrySocket
import com.tiltmaze.sensor.MotionSensorManager
import com.tiltmaze.ui.CockpitControllerScreen
import kotlinx.coroutines.delay
import org.json.JSONObject

class MainActivity : ComponentActivity(), TelemetryListener {
    private lateinit var sensorManager: MotionSensorManager
    private lateinit var hapticManager: HapticManager
    private lateinit var glyphController: NothingGlyphController
    private lateinit var socket: TelemetrySocket

    // UI state
    private var isConnectedState by mutableStateOf(false)
    private var roomCodeState by mutableStateOf("")
    private var playerSlotState by mutableStateOf(1)
    private var rttState by mutableStateOf(0L)
    private var pitchState by mutableStateOf(0f)
    private var rollState by mutableStateOf(0f)
    private var errorMessageState by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        sensorManager = MotionSensorManager(this)
        hapticManager = HapticManager(this)
        glyphController = NothingGlyphController(this).apply { init() }
        socket = TelemetrySocket(this)

        setContent {
            MaterialTheme {
                if (isConnectedState) {
                    // 60Hz UI Reticle update ticker
                    LaunchedEffect(Unit) {
                        while (true) {
                            val motion = sensorManager.getCurrentMotionData()
                            pitchState = motion.pitch
                            rollState = motion.roll
                            delay(16)
                        }
                    }

                    CockpitControllerScreen(
                        roomCode = roomCodeState,
                        playerSlot = playerSlotState,
                        rttMs = rttState,
                        pitch = pitchState,
                        roll = rollState,
                        onBoostChange = { socket.isBoostActive = it },
                        onBrakeChange = { socket.isBrakeActive = it },
                        onCalibrate = { sensorManager.calibrateNeutral() },
                        onDisconnect = { disconnect() }
                    )
                } else {
                    ConnectionScreen(
                        errorMessage = errorMessageState,
                        onConnect = { ip, port, code ->
                            connect(ip, port, code)
                        },
                        onScanQr = { scanQrCode() }
                    )
                }
            }
        }
    }

    private fun connect(serverIp: String, port: String, code: String) {
        val cleanIp = serverIp.trim().removePrefix("http://").removePrefix("ws://")
        val cleanPort = if (port.isNotBlank()) port.trim() else "3000"
        val wsUrl = "ws://$cleanIp:$cleanPort"

        errorMessageState = null
        socket.connect(wsUrl, code.uppercase())
    }

    private fun scanQrCode() {
        val options = GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .build()
        val scanner = GmsBarcodeScanning.getClient(this, options)

        scanner.startScan()
            .addOnSuccessListener { barcode ->
                barcode.rawValue?.let { raw ->
                    try {
                        val json = JSONObject(raw)
                        val wsUrl = json.getString("wsUrl")
                        val code = json.getString("roomCode")
                        socket.connect(wsUrl, code)
                    } catch (e: Exception) {
                        errorMessageState = "Invalid QR code payload"
                    }
                }
            }
            .addOnFailureListener {
                errorMessageState = "QR Scanner cancelled or unavailable"
            }
    }

    private fun disconnect() {
        socket.stop()
        sensorManager.stop()
        isConnectedState = false
    }

    override fun onConnected(playerSlot: Int, sessionId: String, roomCode: String) {
        runOnUiThread {
            this.playerSlotState = playerSlot
            this.roomCodeState = roomCode
            this.isConnectedState = true
            this.errorMessageState = null

            sensorManager.start()
            socket.startStreaming { sensorManager.getCurrentMotionData() }
            hapticManager.trigger("success", 80L, 0.7f)
        }
    }

    override fun onDisconnected() {
        runOnUiThread {
            isConnectedState = false
            sensorManager.stop()
        }
    }

    override fun onLatencyUpdate(rttMs: Long) {
        runOnUiThread {
            this.rttState = rttMs
        }
    }

    override fun onHapticTrigger(effect: String, durationMs: Long, intensity: Float) {
        hapticManager.trigger(effect, durationMs, intensity)
    }

    override fun onError(message: String) {
        runOnUiThread {
            this.errorMessageState = message
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        socket.stop()
        sensorManager.stop()
        glyphController.destroy()
    }
}

@Composable
fun ConnectionScreen(
    errorMessage: String?,
    onConnect: (ip: String, port: String, code: String) -> Unit,
    onScanQr: () -> Unit
) {
    var ipInput by remember { mutableStateOf("192.168.1.") }
    var portInput by remember { mutableStateOf("3000") }
    var codeInput by remember { mutableStateOf("") }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0B0F19))
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 520.dp)
                .background(Color(0xFF161E2E), RoundedCornerShape(16.dp))
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "TILTMAZE CONTROLLER",
                color = Color(0xFF38BDF8),
                fontSize = 22.sp,
                fontWeight = FontWeight.Black
            )

            errorMessage?.let {
                Text(text = it, color = Color(0xFFEF4444), fontSize = 13.sp)
            }

            // QR Scan Button
            Button(
                onClick = onScanQr,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.fillMaxWidth().height(48.dp)
            ) {
                Text("SCAN QR CODE ON LAPTOP", fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }

            Text("— OR ENTER MANUALLY —", color = Color(0xFF64748B), fontSize = 11.sp, fontWeight = FontWeight.SemiBold)

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedTextField(
                    value = ipInput,
                    onValueChange = { ipInput = it },
                    label = { Text("Laptop LAN IP") },
                    modifier = Modifier.weight(2f),
                    singleLine = true
                )
                OutlinedTextField(
                    value = portInput,
                    onValueChange = { portInput = it },
                    label = { Text("Port") },
                    modifier = Modifier.weight(1f),
                    singleLine = true
                )
            }

            OutlinedTextField(
                value = codeInput,
                onValueChange = { codeInput = it.take(4).uppercase() },
                label = { Text("4-Digit Room Code (e.g. K9X2)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            Button(
                onClick = { onConnect(ipInput, portInput, codeInput) },
                enabled = codeInput.length == 4,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981)),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.fillMaxWidth().height(48.dp)
            ) {
                Text("CONNECT TO GAME", fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
        }
    }
}
