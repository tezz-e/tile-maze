package com.tiltmaze.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun CockpitControllerScreen(
    roomCode: String,
    playerSlot: Int,
    rttMs: Long,
    pitch: Float,
    roll: Float,
    calibrationFailed: Boolean = false,
    screenRotatedHint: Boolean = false,
    onBoostChange: (Boolean) -> Unit,
    onBrakeChange: (Boolean) -> Unit,
    onCalibrate: () -> Unit,
    onResetFlat: () -> Unit,
    onDisconnect: () -> Unit,
    onGlyphTest: () -> Unit = {}
) {
    var isBraking by remember { mutableStateOf(false) }
    var isBoosting by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF000000))
            .padding(16.dp)
    ) {
        // 1. Top Bar: Industrial Monospace Telemetry
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.TopCenter)
                .border(BorderStroke(1.dp, Color(0xFF222222)), RoundedCornerShape(0.dp))
                .background(Color(0xFF080808))
                .padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "[ ROOM: $roomCode ]",
                    color = Color.White,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    letterSpacing = 1.sp,
                    modifier = Modifier.pointerInput(Unit) {
                        detectTapGestures(onLongPress = { onGlyphTest() })
                    }
                )
                Text(
                    text = "• SLOT 0$playerSlot",
                    color = Color(0xFF888888),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                )
            }

            // High-Contrast Latency Chip
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier
                    .border(BorderStroke(1.dp, Color(0xFF333333)), RoundedCornerShape(0.dp))
                    .padding(horizontal = 10.dp, vertical = 4.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(6.dp)
                        .background(Color(0xFF00FF66))
                )
                Text(
                    text = "RTT: ${rttMs}MS // 100HZ",
                    color = Color.White,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    letterSpacing = 0.5.sp
                )
            }

            Button(
                onClick = onDisconnect,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color.Transparent,
                    contentColor = Color.White
                ),
                border = BorderStroke(1.dp, Color.White),
                shape = RoundedCornerShape(0.dp),
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 4.dp)
            ) {
                Text(
                    text = "[ EXIT ]",
                    color = Color.White,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                )
            }
        }

        // 2. Center: Tactical Aerospace Reticle Canvas
        Box(
            modifier = Modifier
                .size(240.dp)
                .align(Alignment.Center),
            contentAlignment = Alignment.Center
        ) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                val center = Offset(size.width / 2f, size.height / 2f)
                val radius = size.minDimension / 2.2f

                // Outer border circle (Hairline White)
                drawCircle(
                    color = Color(0xFF333333),
                    radius = radius,
                    center = center,
                    style = Stroke(width = 2f)
                )

                // Concentric attitude rings
                drawCircle(
                    color = Color(0xFF222222),
                    radius = radius * 0.65f,
                    center = center,
                    style = Stroke(width = 1f)
                )

                // Deadzone center circle
                drawCircle(
                    color = Color(0xFF444444),
                    radius = radius * 0.2f,
                    center = center,
                    style = Stroke(width = 1f)
                )

                // Precision Crosshair lines
                drawLine(
                    color = Color(0xFF333333),
                    start = Offset(center.x - radius, center.y),
                    end = Offset(center.x + radius, center.y),
                    strokeWidth = 1f
                )
                drawLine(
                    color = Color(0xFF333333),
                    start = Offset(center.x, center.y - radius),
                    end = Offset(center.x, center.y + radius),
                    strokeWidth = 1f
                )

                // Motion Target: mapped from roll (X) and pitch (Y: tilting forward moves UP)
                val dotX = (center.x + roll * radius * 0.85f).coerceIn(center.x - radius, center.x + radius)
                val dotY = (center.y - pitch * radius * 0.85f).coerceIn(center.y - radius, center.y + radius)

                // Target Halo & Core (Nothing Red #EA3323)
                drawCircle(
                    color = Color(0xFFEA3323).copy(alpha = 0.25f),
                    radius = 16f,
                    center = Offset(dotX, dotY)
                )
                drawCircle(
                    color = Color(0xFFEA3323),
                    radius = 7f,
                    center = Offset(dotX, dotY)
                )
            }

            // Attitude telemetry text overlay below reticle
            Column(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "P: %+.1f°  R: %+.1f°".format(pitch * 30f, roll * 30f),
                    color = Color(0xFF888888),
                    fontSize = 10.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold
                )
            }
        }

        // 3. Left Controls: Calibrate & Brake
        Column(
            modifier = Modifier
                .align(Alignment.CenterStart)
                .padding(start = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                text = "[ 01 // CALIBRATION ]",
                color = Color(0xFF888888),
                fontSize = 10.sp,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold
            )

            // Zero IMU Neutral (Hold in comfortable hand position)
            Button(
                onClick = onCalibrate,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color.White,
                    contentColor = Color.Black
                ),
                border = BorderStroke(1.dp, Color.White),
                shape = RoundedCornerShape(0.dp),
                modifier = Modifier.size(width = 140.dp, height = 40.dp),
                contentPadding = PaddingValues(0.dp)
            ) {
                Text(
                    text = "[ ZERO IMU ]",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    letterSpacing = 0.5.sp
                )
            }

            if (calibrationFailed) {
                Text(
                    text = "Hold still and tap Calibrate again",
                    color = Color(0xFFEA3323),
                    fontSize = 9.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold
                )
            } else if (screenRotatedHint) {
                Text(
                    text = "Screen rotated, tap Calibrate",
                    color = Color(0xFFEA3323),
                    fontSize = 9.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold
                )
            }

            // Reset to Level Flat Horizon (Tap: Reset flat, Long-press: Glyph Test)
            Box(
                modifier = Modifier
                    .size(width = 140.dp, height = 34.dp)
                    .border(BorderStroke(1.dp, Color(0xFF444444)), RoundedCornerShape(0.dp))
                    .background(Color.Black)
                    .pointerInput(Unit) {
                        detectTapGestures(
                            onTap = { onResetFlat() },
                            onLongPress = { onGlyphTest() }
                        )
                    },
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "RESET FLAT",
                    color = Color(0xFF888888),
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Normal,
                    fontFamily = FontFamily.Monospace
                )
            }

            Spacer(modifier = Modifier.height(4.dp))

            // Brake Thumb Button (Hold down, Nothing Red when active)
            Box(
                modifier = Modifier
                    .size(width = 140.dp, height = 74.dp)
                    .border(
                        BorderStroke(1.dp, if (isBraking) Color(0xFFEA3323) else Color.White),
                        RoundedCornerShape(0.dp)
                    )
                    .background(if (isBraking) Color(0xFFEA3323) else Color(0xFF080808))
                    .pointerInput(Unit) {
                        detectTapGestures(
                            onPress = {
                                isBraking = true
                                onBrakeChange(true)
                                tryAwaitRelease()
                                isBraking = false
                                onBrakeChange(false)
                            }
                        )
                    },
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "[ BRAKE ]",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                        fontFamily = FontFamily.Monospace
                    )
                    Text(
                        text = "HOLD TO DAMPEN",
                        color = if (isBraking) Color.White.copy(alpha = 0.8f) else Color(0xFF888888),
                        fontSize = 9.sp,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }
        }

        // 4. Right Controls: Nitro Boost & Shake
        Column(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .padding(end = 12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "[ SHAKE // JUMP ]",
                color = Color(0xFF888888),
                fontSize = 10.sp,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold
            )

            // Nitro Boost Thumb Button (Hold down, Inverts to Nothing Red)
            Box(
                modifier = Modifier
                    .size(width = 140.dp, height = 80.dp)
                    .border(
                        BorderStroke(2.dp, if (isBoosting) Color.White else Color(0xFFEA3323)),
                        RoundedCornerShape(0.dp)
                    )
                    .background(if (isBoosting) Color(0xFFEA3323) else Color.Black)
                    .pointerInput(Unit) {
                        detectTapGestures(
                            onPress = {
                                isBoosting = true
                                onBoostChange(true)
                                tryAwaitRelease()
                                isBoosting = false
                                onBoostChange(false)
                            }
                        )
                    },
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "NITRO",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 20.sp,
                        fontFamily = FontFamily.Monospace,
                        letterSpacing = 1.sp
                    )
                    Text(
                        text = "HOLD TO BOOST",
                        color = if (isBoosting) Color.White else Color(0xFFEA3323),
                        fontSize = 9.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}
