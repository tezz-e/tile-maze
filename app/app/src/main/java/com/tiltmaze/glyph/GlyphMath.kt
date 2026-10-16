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
