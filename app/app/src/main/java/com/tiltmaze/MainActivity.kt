package com.tiltmaze

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
                    // 60Hz UI Reticle & Glyph LED update ticker
                    LaunchedEffect(Unit) {
                        while (true) {
                            val motion = sensorManager.getCurrentMotionData()
                            pitchState = motion.pitch
                            rollState = motion.roll
                            glyphController.updateBallPosition(rollState, pitchState)
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
                        onResetFlat = { sensorManager.resetToFlat() },
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
            .background(Color(0xFF000000))
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 480.dp)
                .border(BorderStroke(1.dp, Color.White), RoundedCornerShape(0.dp))
                .background(Color(0xFF080808))
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Micro header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "[ SYS // CONTROLLER_LINK ]",
                    color = Color(0xFF888888),
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "100HZ IMU",
                    color = Color(0xFFEA3323),
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold
                )
            }

            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "TILTMAZE",
                    color = Color.White,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    letterSpacing = 2.sp
                )
                Text(
                    text = "PHYSICAL MOTION CONTROLLER // KINETIC HARNESS",
                    color = Color(0xFF888888),
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace,
                    letterSpacing = 1.sp
                )
            }

            errorMessage?.let {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(BorderStroke(1.dp, Color(0xFFEA3323)), RoundedCornerShape(0.dp))
                        .background(Color(0xFF110000))
                        .padding(8.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "[ $it ]",
                        color = Color(0xFFEA3323),
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            // QR Scan Button (Inverted White Brutalist)
            Button(
                onClick = onScanQr,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color.White,
                    contentColor = Color.Black
                ),
                shape = RoundedCornerShape(0.dp),
                modifier = Modifier.fillMaxWidth().height(48.dp)
            ) {
                Text(
                    text = "[ SCAN LAPTOP QR CODE ]",
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp,
                    fontFamily = FontFamily.Monospace,
                    letterSpacing = 0.5.sp
                )
            }

            Text(
                text = "— OR MANUAL IP ENTRY —",
                color = Color(0xFF666666),
                fontSize = 10.sp,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp
            )

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedTextField(
                    value = ipInput,
                    onValueChange = { ipInput = it },
                    label = { Text("LAN IP", fontFamily = FontFamily.Monospace, fontSize = 11.sp) },
                    modifier = Modifier.weight(2f),
                    singleLine = true,
                    shape = RoundedCornerShape(0.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        focusedBorderColor = Color.White,
                        unfocusedBorderColor = Color(0xFF333333),
                        focusedLabelColor = Color(0xFFEA3323),
                        unfocusedLabelColor = Color(0xFF888888)
                    )
                )
                OutlinedTextField(
                    value = portInput,
                    onValueChange = { portInput = it },
                    label = { Text("Port", fontFamily = FontFamily.Monospace, fontSize = 11.sp) },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    shape = RoundedCornerShape(0.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        focusedBorderColor = Color.White,
                        unfocusedBorderColor = Color(0xFF333333),
                        focusedLabelColor = Color(0xFFEA3323),
                        unfocusedLabelColor = Color(0xFF888888)
                    )
                )
            }

            OutlinedTextField(
                value = codeInput,
                onValueChange = { codeInput = it.take(4).uppercase() },
                label = { Text("4-Char Room Code (e.g. 6UTP)", fontFamily = FontFamily.Monospace, fontSize = 11.sp) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                shape = RoundedCornerShape(0.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White,
                    focusedBorderColor = Color.White,
                    unfocusedBorderColor = Color(0xFF333333),
                    focusedLabelColor = Color(0xFFEA3323),
                    unfocusedLabelColor = Color(0xFF888888)
                )
            )

            Button(
                onClick = { onConnect(ipInput, portInput, codeInput) },
                enabled = codeInput.length == 4,
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (codeInput.length == 4) Color(0xFFEA3323) else Color(0xFF1A1A1A),
                    contentColor = if (codeInput.length == 4) Color.White else Color(0xFF555555),
                    disabledContainerColor = Color(0xFF111111),
                    disabledContentColor = Color(0xFF444444)
                ),
                shape = RoundedCornerShape(0.dp),
                modifier = Modifier.fillMaxWidth().height(48.dp)
            ) {
                Text(
                    text = "[ CONNECT TO RELAY // COMMENCE ]",
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp,
                    fontFamily = FontFamily.Monospace,
                    letterSpacing = 0.5.sp
                )
            }
        }
    }
}
