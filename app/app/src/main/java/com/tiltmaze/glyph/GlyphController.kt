package com.tiltmaze.glyph

import android.content.ComponentName
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.nothing.ketchum.Glyph
import com.nothing.ketchum.GlyphMatrixManager

interface GlyphController {
    fun init()
    fun updateBallPosition(xNorm: Float, yNorm: Float)
    fun pulseSuccess()
    fun destroy()
}

/**
 * Universal Hardware Matrix Driver.
 * If running on a Nothing Phone with Glyph Matrix hardware, drives the rear 25x25 LED matrix.
 * On any other device (Pixel, Samsung, OnePlus, etc.), gracefully operates as a no-op
 * without throwing errors or interrupting gameplay.
 */
class NothingGlyphController(private val context: Context) : GlyphController {
    private var glyphManager: GlyphMatrixManager? = null
    private var isRegistered = false
    private val TAG = "GlyphController"
    private val cellsPerFrame = 25 * 25
    private val currentFrame = IntArray(cellsPerFrame)
    private var lastUpdateMs = 0L

    private val glyphCallback = object : GlyphMatrixManager.Callback {
        override fun onServiceConnected(componentName: ComponentName) {
            try {
                // Glyph.DEVICE_23112 is Nothing Phone (3) with 25x25 Glyph Matrix
                glyphManager?.register(Glyph.DEVICE_23112)
                isRegistered = true
                Log.d(TAG, "Glyph Matrix service connected & registered successfully")
            } catch (e: Throwable) {
                Log.w(TAG, "Glyph device register exception: ${e.message}")
            }
        }

        override fun onServiceDisconnected(componentName: ComponentName) {
            isRegistered = false
        }
    }

    override fun init() {
        try {
            glyphManager = GlyphMatrixManager.getInstance(context.applicationContext)
            glyphManager?.init(glyphCallback)
        } catch (e: Throwable) {
            // Silently handled on non-supported hardware
            Log.d(TAG, "Glyph SDK not active on current device: ${e.message}")
            glyphManager = null
        }
    }

    override fun updateBallPosition(xNorm: Float, yNorm: Float) {
        if (!isRegistered || glyphManager == null) return
        val now = System.currentTimeMillis()
        if (now - lastUpdateMs < 30) return // Throttle to ~33Hz to prevent IPC saturation
        lastUpdateMs = now

        // Map normalized [-1.0, 1.0] to matrix coordinates [0, 24]
        val cx = ((xNorm + 1.0f) * 0.5f * 24f).toInt().coerceIn(0, 24)
        val cy = ((yNorm + 1.0f) * 0.5f * 24f).toInt().coerceIn(0, 24)

        // Clear previous frame
        currentFrame.fill(0)

        // Render 3x3 anti-aliased bright cluster
        for (dy in -1..1) {
            for (dx in -1..1) {
                val px = cx + dx
                val py = cy + dy
                if (px in 0..24 && py in 0..24) {
                    val idx = py * 25 + px
                    val brightness = when {
                        dx == 0 && dy == 0 -> 4095
                        dx == 0 || dy == 0 -> 1800
                        else -> 600
                    }
                    currentFrame[idx] = brightness
                }
            }
        }

        try {
            glyphManager?.setMatrixFrame(currentFrame)
        } catch (e: Throwable) {
            Log.w(TAG, "setMatrixFrame failed: ${e.message}")
        }
    }

    override fun pulseSuccess() {
        if (!isRegistered || glyphManager == null) return
        try {
            val pulseFrame = IntArray(cellsPerFrame) { 4095 }
            glyphManager?.setMatrixFrame(pulseFrame)
            Handler(Looper.getMainLooper()).postDelayed({
                try {
                    currentFrame.fill(0)
                    glyphManager?.setMatrixFrame(currentFrame)
                } catch (e: Throwable) {
                    // ignore
                }
            }, 180L)
        } catch (e: Throwable) {
            // ignore
        }
    }

    override fun destroy() {
        try {
            glyphManager?.turnOff()
            glyphManager?.unInit()
        } catch (e: Throwable) {
            // ignore
        }
        glyphManager = null
        isRegistered = false
    }
}
