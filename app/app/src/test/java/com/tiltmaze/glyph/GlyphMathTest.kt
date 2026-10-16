package com.tiltmaze.glyph

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.roundToInt
import kotlin.math.sin

class GlyphMathTest {

    @Test
    fun testCircleMaskExactLedCount() {
        var count = 0
        for (i in 0 until GlyphMath.TOTAL_LEDS) {
            if (GlyphMath.CIRCLE_MASK[i]) count++
        }
        assertEquals("Physical circular LED matrix must have exactly 489 LEDs", 489, count)
    }

    @Test
    fun testRadialClamp() {
        // Within unit circle
        val (x1, y1) = GlyphMath.clampRadial(0.3f, 0.4f)
        assertEquals(0.3f, x1, 1e-5f)
        assertEquals(0.4f, y1, 1e-5f)

        // On unit circle (3-4-5 triangle scaled)
        val (x2, y2) = GlyphMath.clampRadial(0.6f, 0.8f)
        assertEquals(0.6f, x2, 1e-5f)
        assertEquals(0.8f, y2, 1e-5f)

        // Outside unit circle (scaled down to length 1.0)
        val (x3, y3) = GlyphMath.clampRadial(3.0f, 4.0f)
        val len3 = hypot(x3, y3)
        assertEquals(1.0f, len3, 1e-5f)
        assertEquals(0.6f, x3, 1e-5f)
        assertEquals(0.8f, y3, 1e-5f)
    }

    @Test
    fun testBlobCenterStaysInsideMaskForAllInputsOnUnitCircle() {
        // Test 360 angles on the unit circle
        for (deg in 0 until 360) {
            val rad = deg * PI.toFloat() / 180f
            val vx = cos(rad)
            val vy = sin(rad)

            val (cx, cy) = GlyphMath.getBallCenter(vx, vy)

            // Distance from center (12, 12)
            val distFromCenter = hypot(cx - GlyphMath.CENTER, cy - GlyphMath.CENTER)
            assertTrue(
                "Ball center distance ($distFromCenter) must not exceed TRAVEL_RADIUS (${GlyphMath.TRAVEL_RADIUS})",
                distFromCenter <= GlyphMath.TRAVEL_RADIUS + 1e-5f
            )

            // Nearest integer grid pixel must be inside the circular mask
            val nearestX = cx.roundToInt()
            val nearestY = cy.roundToInt()
            assertTrue(
                "Nearest cell ($nearestX, $nearestY) for angle $deg must be inside circular mask",
                GlyphMath.isInsideCircle(nearestX, nearestY)
            )

            // A 3-pixel blob (diameter 3, radius ~1.5) around the center:
            // Check that all pixels with distance <= 1.5 from (cx, cy) are within RADIUS (12.5) from (12, 12)
            val maxBlobEdgeDist = distFromCenter + 1.5f
            assertTrue(
                "Max blob edge ($maxBlobEdgeDist) must not exceed physical radius (${GlyphMath.RADIUS})",
                maxBlobEdgeDist <= GlyphMath.RADIUS + 1e-5f
            )
        }
    }

    @Test
    fun testGaussianBlobSubPixelRendering() {
        val frame = IntArray(GlyphMath.TOTAL_LEDS)

        // 1. Center rendering
        GlyphMath.renderGaussianBlob(12.0f, 12.0f, frame)
        val centerIdx = 12 * GlyphMath.GRID_SIZE + 12
        assertEquals(GlyphMath.PEAK_BRIGHTNESS, frame[centerIdx])
        assertTrue("Frame must have lit pixels", frame.any { it > 0 })

        // Ensure no LED outside circle mask is lit
        for (i in 0 until GlyphMath.TOTAL_LEDS) {
            if (!GlyphMath.CIRCLE_MASK[i]) {
                assertEquals("LED outside circle mask must be 0", 0, frame[i])
            }
        }

        // 2. Sub-pixel balance between (12, 12) and (13, 12)
        GlyphMath.renderGaussianBlob(12.5f, 12.0f, frame)
        val idx12 = 12 * GlyphMath.GRID_SIZE + 12
        val idx13 = 12 * GlyphMath.GRID_SIZE + 13
        assertEquals("Sub-pixel midpoint must illuminate adjacent pixels equally", frame[idx12], frame[idx13])
        assertTrue("Sub-pixel intensity must be positive", frame[idx12] > 0)

        // 3. Never all-zero even at boundary
        GlyphMath.renderGaussianBlob(22.5f, 12.0f, frame)
        assertTrue("Frame must never be all-zero", frame.any { it > 0 })
    }
}
