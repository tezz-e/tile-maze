package com.tiltmaze.glyph

import kotlin.math.hypot

object GlyphMath {
    const val GRID_SIZE = 25
    const val TOTAL_LEDS = 625
    const val CENTER = 12.0f
    const val RADIUS = 12.5f
    const val RADIUS_SQ = RADIUS * RADIUS // 156.25f
    const val TRAVEL_RADIUS = 10.5f

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
}
