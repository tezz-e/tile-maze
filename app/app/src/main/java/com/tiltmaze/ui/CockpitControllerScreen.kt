package com.tiltmaze.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
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
    onBoostChange: (Boolean) -> Unit,
    onBrakeChange: (Boolean) -> Unit,
    onCalibrate: () -> Unit,
    onDisconnect: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0B0F19))
            .padding(16.dp)
    ) {
        // 1. Top Bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.TopCenter),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "ROOM: $roomCode",
                    color = Color(0xFF38BDF8),
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                )
                Text(
                    text = "• P$playerSlot",
                    color = Color(0xFF94A3B8),
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }

            // Latency Chip
            Box(
                modifier = Modifier
                    .background(Color(0xFF1E293B), RoundedCornerShape(16.dp))
                    .padding(horizontal = 12.dp, vertical = 6.dp)
            ) {
                Text(
                    text = "RTT: ${rttMs}ms | 60 Hz",
                    color = Color(0xFF34D399),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                )
            }

            Button(
                onClick = onDisconnect,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF334155)),
                shape = RoundedCornerShape(8.dp),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
            ) {
                Text("Exit", color = Color.White, fontSize = 13.sp)
            }
        }

        // 2. Center: Artificial Horizon Reticle Canvas
        Box(
            modifier = Modifier
                .size(240.dp)
                .align(Alignment.Center)
        ) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                val center = Offset(size.width / 2f, size.height / 2f)
                val radius = size.minDimension / 2.2f

                // Outer border circle
                drawCircle(
                    color = Color(0xFF1E293B),
                    radius = radius,
                    center = center,
                    style = Stroke(width = 3f)
                )

                // Deadzone circle
                drawCircle(
                    color = Color(0xFF334155),
                    radius = radius * 0.15f,
                    center = center,
                    style = Stroke(width = 1.5f)
                )

                // Crosshair lines
                drawLine(
                    color = Color(0xFF334155),
                    start = Offset(center.x - radius, center.y),
                    end = Offset(center.x + radius, center.y),
                    strokeWidth = 1.5f
                )
                drawLine(
                    color = Color(0xFF334155),
                    start = Offset(center.x, center.y - radius),
                    end = Offset(center.x, center.y + radius),
                    strokeWidth = 1.5f
                )

                // Motion Target Dot: mapped from pitch (Y) and roll (X)
                val dotX = (center.x + roll * radius * 0.85f).coerceIn(center.x - radius, center.x + radius)
                val dotY = (center.y + pitch * radius * 0.85f).coerceIn(center.y - radius, center.y + radius)

                // Glowing target indicator
                drawCircle(
                    color = Color(0xFF38BDF8),
                    radius = 12f,
                    center = Offset(dotX, dotY)
                )
            }
        }

        // 3. Left Controls: Brake & Calibrate
        Column(
            modifier = Modifier
                .align(Alignment.CenterStart)
                .padding(start = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Calibrate Neutral Button
            Button(
                onClick = onCalibrate,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.size(width = 130.dp, height = 50.dp)
            ) {
                Text("CALIBRATE", fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }

            // Brake Thumb Button (Hold down)
            Box(
                modifier = Modifier
                    .size(130.dp, 80.dp)
                    .background(Color(0xFF475569), RoundedCornerShape(16.dp))
                    .pointerInput(Unit) {
                        detectTapGestures(
                            onPress = {
                                onBrakeChange(true)
                                tryAwaitRelease()
                                onBrakeChange(false)
                            }
                        )
                    },
                contentAlignment = Alignment.Center
            ) {
                Text("BRAKE", color = Color.White, fontWeight = FontWeight.Black, fontSize = 16.sp)
            }
        }

        // 4. Right Controls: Nitro Boost
        Column(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .padding(end = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "SHAKE TO JUMP",
                color = Color(0xFF94A3B8),
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold
            )

            // Nitro Boost Thumb Button (Hold down)
            Box(
                modifier = Modifier
                    .size(130.dp, 80.dp)
                    .background(Color(0xFFE11D48), RoundedCornerShape(16.dp))
                    .pointerInput(Unit) {
                        detectTapGestures(
                            onPress = {
                                onBoostChange(true)
                                tryAwaitRelease()
                                onBoostChange(false)
                            }
                        )
                    },
                contentAlignment = Alignment.Center
            ) {
                Text("NITRO", color = Color.White, fontWeight = FontWeight.Black, fontSize = 18.sp)
            }
        }
    }
}
