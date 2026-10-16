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
    fun runGlyphTest() {}
}

/**
 * Universal Hardware Matrix Driver.
 * If running on a Nothing Phone with Glyph Matrix hardware, drives the rear 25x25 LED matrix.
 * On any other device (Pixel, Samsung, OnePlus, etc.), gracefully operates as a no-op
 * without throwing errors or interrupting gameplay.
 */
class NothingGlyphController(private val context: Context) : GlyphController {
    companion object {
        var axisConfig = GlyphMath.AxisConfig(
            swapXY = true,
            invertX = true,
            invertY = false
        )
    }

    private var glyphManager: GlyphMatrixManager? = null
    private var isRegistered = false
    private val TAG = "GlyphController"
    private val cellsPerFrame = 25 * 25
    private val currentFrame = IntArray(cellsPerFrame)
    private var lastUpdateMs = 0L
    private val smoother = GlyphPositionSmoother(
        timeConstantSeconds = 0.080f,
        maxSpeedPixelsPerSecond = 40.0f
    )
    private var lastSmoothTimeNs = 0L
    private var isTestModeRunning = false
    private val mainHandler = Handler(Looper.getMainLooper())

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
        if (!isRegistered || glyphManager == null || isTestModeRunning) return
        val now = System.currentTimeMillis()
        if (now - lastUpdateMs < 30) return // Throttle to ~33Hz to prevent IPC saturation
        lastUpdateMs = now

        val nowNs = System.nanoTime()
        val dt = if (lastSmoothTimeNs == 0L) 0.033f else ((nowNs - lastSmoothTimeNs) / 1_000_000_000.0f)
        lastSmoothTimeNs = nowNs

        val (mappedX, mappedY) = axisConfig.map(xNorm, yNorm)
        val (targetX, targetY) = GlyphMath.getBallCenter(mappedX, mappedY)
        val (smoothX, smoothY) = smoother.update(targetX, targetY, dt)
        GlyphMath.renderGaussianBlob(smoothX, smoothY, currentFrame)

        try {
            glyphManager?.setMatrixFrame(currentFrame)
        } catch (e: Throwable) {
            Log.w(TAG, "setMatrixFrame failed: ${e.message}")
        }
    }

    override fun runGlyphTest() {
        if (!isRegistered || glyphManager == null || isTestModeRunning) return
        isTestModeRunning = true
        Log.i(TAG, "[Glyph Test] Starting hardware alignment test...")

        val steps = listOf(
            Runnable {
                Log.i(TAG, "[Glyph Test] Step 1/5: Outer Ring")
                GlyphMath.renderOuterRing(currentFrame)
                try { glyphManager?.setMatrixFrame(currentFrame) } catch (e: Throwable) {}
            },
            Runnable {
                Log.i(TAG, "[Glyph Test] Step 2/5: TOP")
                GlyphMath.renderGaussianBlob(GlyphMath.CENTER, GlyphMath.CENTER - GlyphMath.TRAVEL_RADIUS, currentFrame)
                try { glyphManager?.setMatrixFrame(currentFrame) } catch (e: Throwable) {}
            },
            Runnable {
                Log.i(TAG, "[Glyph Test] Step 3/5: RIGHT")
                GlyphMath.renderGaussianBlob(GlyphMath.CENTER + GlyphMath.TRAVEL_RADIUS, GlyphMath.CENTER, currentFrame)
                try { glyphManager?.setMatrixFrame(currentFrame) } catch (e: Throwable) {}
            },
            Runnable {
                Log.i(TAG, "[Glyph Test] Step 4/5: BOTTOM")
                GlyphMath.renderGaussianBlob(GlyphMath.CENTER, GlyphMath.CENTER + GlyphMath.TRAVEL_RADIUS, currentFrame)
                try { glyphManager?.setMatrixFrame(currentFrame) } catch (e: Throwable) {}
            },
            Runnable {
                Log.i(TAG, "[Glyph Test] Step 5/5: LEFT")
                GlyphMath.renderGaussianBlob(GlyphMath.CENTER - GlyphMath.TRAVEL_RADIUS, GlyphMath.CENTER, currentFrame)
                try { glyphManager?.setMatrixFrame(currentFrame) } catch (e: Throwable) {}
            },
            Runnable {
                Log.i(TAG, "[Glyph Test] Completed, returning to live mode")
                isTestModeRunning = false
                smoother.snapTo(GlyphMath.CENTER, GlyphMath.CENTER)
            }
        )

        steps.forEachIndexed { index, step ->
            mainHandler.postDelayed(step, index * 1000L)
        }
    }

    override fun pulseSuccess() {
        if (!isRegistered || glyphManager == null) return
        try {
            val pulseFrame = IntArray(cellsPerFrame) { idx ->
                if (GlyphMath.CIRCLE_MASK[idx]) 4095 else 0
            }
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
