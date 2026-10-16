package com.tiltmaze.glyph

import kotlin.math.hypot

object GlyphMath {
    const val GRID_SIZE = 25
    const val TOTAL_LEDS = 625
    const val CENTER = 12.0f
    const val RADIUS = 12.5f
    const val RADIUS_SQ = RADIUS * RADIUS // 156.25f
    const val TRAVEL_RADIUS = 10.5f
    const val SIGMA = 0.9f
    const val TWO_SIGMA_SQ = 2.0f * SIGMA * SIGMA // ~1.62f
    const val PEAK_BRIGHTNESS = 4095

    /**
     * Precomputed boolean mask for the physical circular LED matrix.
     * Cells satisfying (x - 12)^2 + (y - 12)^2 <= 12.5^2 evaluate to true (exactly 489 LEDs).
     */
    val CIRCLE_MASK = BooleanArray(TOTAL_LEDS) { index ->
        val x = index % GRID_SIZE
        val y = index / GRID_SIZE
        val dx = x - CENTER
        val dy = y - CENTER
        (dx * dx + dy * dy) <= RADIUS_SQ
    }

    /**
     * Returns true if (x, y) is within the physical circular LED matrix.
     */
    fun isInsideCircle(x: Int, y: Int): Boolean {
        if (x !in 0 until GRID_SIZE || y !in 0 until GRID_SIZE) return false
        return CIRCLE_MASK[y * GRID_SIZE + x]
    }

    /**
     * Radially clamps a 2D vector (x, y) to unit length if hypot(x, y) > 1.
     * Never clamps axes independently to preserve direction.
     */
    fun clampRadial(x: Float, y: Float): Pair<Float, Float> {
        val len = hypot(x, y)
        return if (len > 1.0f && len > 1e-6f) {
            Pair(x / len, y / len)
        } else {
            Pair(x, y)
        }
    }

    /**
     * Exponential backoff tracker for reconnect attempts (500ms up to 5000ms).
     */
    class ReconnectBackoff(
        val initialDelayMs: Long = 500L,
        val maxDelayMs: Long = 5000L,
        val factor: Float = 2.0f
    ) {
        var currentDelayMs: Long = initialDelayMs
            private set

        fun nextDelay(): Long {
            val delay = currentDelayMs
            currentDelayMs = minOf(maxDelayMs, (currentDelayMs * factor).toLong())
            return delay
        }

        fun reset() {
            currentDelayMs = initialDelayMs
        }
    }

    /**
     * Configurable axis mapping flags for the rear Glyph Matrix display.
     * Default for landscape ROTATION_90 viewed from the back: swapXY = true, invertX = true, invertY = false.
     */
    data class AxisConfig(
        val swapXY: Boolean = true,
        val invertX: Boolean = true,
        val invertY: Boolean = false
    ) {
        fun map(xNorm: Float, yNorm: Float): Pair<Float, Float> {
            val rawX = if (invertX) -xNorm else xNorm
            val rawY = if (invertY) -yNorm else yNorm
            return if (swapXY) Pair(rawY, rawX) else Pair(rawX, rawY)
        }
    }

    /**
     * Draws an outer ring on the circle edge (r between 10.5 and 12.5).
     */
    fun renderOuterRing(targetFrame: IntArray, brightness: Int = PEAK_BRIGHTNESS) {
        targetFrame.fill(0)
        val rMinSq = 10.0f * 10.0f
        val rMaxSq = RADIUS_SQ
        for (y in 0 until GRID_SIZE) {
            val dy = y - CENTER
            for (x in 0 until GRID_SIZE) {
                val dx = x - CENTER
                val dSq = dx * dx + dy * dy
                if (dSq in rMinSq..rMaxSq && isInsideCircle(x, y)) {
                    targetFrame[y * GRID_SIZE + x] = brightness
                }
            }
        }
    }

    /**
     * Converts a normalized 2D direction vector into the floating-point ball center on the matrix.
     * The center is placed at 12 + v * 10.5, ensuring a 3-pixel blob stays fully within the 12.5 radius circle.
     */
    fun getBallCenter(vx: Float, vy: Float): Pair<Float, Float> {
        val (cx, cy) = clampRadial(vx, vy)
        return Pair(CENTER + cx * TRAVEL_RADIUS, CENTER + cy * TRAVEL_RADIUS)
    }

    /**
     * Renders a sub-pixel Gaussian blob centered at floating-point (cx, cy) on the circular matrix.
     * Evaluates a 5x5 neighborhood around the float position with peak brightness 4095.
     * Skips cells outside the circular mask.
     * Guarantees at least one illuminated pixel so a connected frame is never all-zero.
     */
    fun renderGaussianBlob(cx: Float, cy: Float, targetFrame: IntArray) {
        targetFrame.fill(0)

        val minX = (cx.toInt() - 2).coerceAtLeast(0)
        val maxX = (cx.toInt() + 2).coerceAtMost(GRID_SIZE - 1)
        val minY = (cy.toInt() - 2).coerceAtLeast(0)
        val maxY = (cy.toInt() + 2).coerceAtMost(GRID_SIZE - 1)

        var hasLitPixel = false

        for (py in minY..maxY) {
            val dy = py - cy
            val dySq = dy * dy
            for (px in minX..maxX) {
                if (!isInsideCircle(px, py)) continue

                val dx = px - cx
                val distSq = dx * dx + dySq
                val intensity = (PEAK_BRIGHTNESS * kotlin.math.exp(-distSq / TWO_SIGMA_SQ)).toInt()
                if (intensity > 0) {
                    targetFrame[py * GRID_SIZE + px] = intensity.coerceIn(0, PEAK_BRIGHTNESS)
                    hasLitPixel = true
                }
            }
        }

        // Never output an all-zero frame while connected: if everything clips, still draw the center pixel
        if (!hasLitPixel) {
            val nearestX = kotlin.math.round(cx).toInt().coerceIn(0, GRID_SIZE - 1)
            val nearestY = kotlin.math.round(cy).toInt().coerceIn(0, GRID_SIZE - 1)
            if (isInsideCircle(nearestX, nearestY)) {
                targetFrame[nearestY * GRID_SIZE + nearestX] = PEAK_BRIGHTNESS
            } else {
                targetFrame[12 * GRID_SIZE + 12] = PEAK_BRIGHTNESS
            }
        }
    }
}

/**
 * Frame-rate-independent exponential smoother with max speed limit for the Glyph display.
 * Prevents teleporting and provides smooth gliding motion on the rear matrix.
 */
class GlyphPositionSmoother(
    val timeConstantSeconds: Float = 0.080f, // 80ms
    val maxSpeedPixelsPerSecond: Float = 40.0f,
    initialX: Float = GlyphMath.CENTER,
    initialY: Float = GlyphMath.CENTER
) {
    var x: Float = initialX
        private set
    var y: Float = initialY
        private set

    fun snapTo(targetX: Float = GlyphMath.CENTER, targetY: Float = GlyphMath.CENTER) {
        x = targetX
        y = targetY
    }

    fun update(targetX: Float, targetY: Float, dtSeconds: Float): Pair<Float, Float> {
        if (dtSeconds <= 0f) return Pair(x, y)
        val dt = dtSeconds.coerceIn(0.001f, 0.2f)

        // 1. Exponential smoothing
        val alpha = 1.0f - kotlin.math.exp(-dt / timeConstantSeconds)
        val nx = x + (targetX - x) * alpha
        val ny = y + (targetY - y) * alpha

        // 2. Max speed limit
        val dx = nx - x
        val dy = ny - y
        val dist = kotlin.math.hypot(dx, dy)
        val maxDist = maxSpeedPixelsPerSecond * dt

        if (dist > maxDist && dist > 1e-6f) {
            val scale = maxDist / dist
            x += dx * scale
            y += dy * scale
        } else {
            x = nx
            y = ny
        }

        return Pair(x, y)
    }
}

