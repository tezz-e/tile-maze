package com.tiltmaze.sensor

import kotlin.math.PI
import kotlin.math.abs

private class LowPassFilter {
    private var y: Float? = null
    private var s: Float? = null

    fun filter(value: Float, alpha: Float): Float {
        y = value
        val prev = s
        if (prev == null) {
            s = value
            return value
        }
        val next = alpha * value + (1.0f - alpha) * prev
        s = next
        return next
    }

    fun lastRaw(): Float? = y
    fun lastFiltered(): Float? = s

    fun reset(value: Float? = null) {
        y = value
        s = value
    }
}

/**
 * Adaptive One Euro Filter in Kotlin.
 * Eliminates hand tremors at rest while providing zero-lag tracking during fast motions.
 *
 * Tuned for normalized [-1.0, 1.0] motion signals.
 * Reference: Casiez et al., "1 € Filter: A Simple Speed-based Low-pass Filter
 * for Noisy Input in Human-Computer Interaction", CHI 2012.
 */
class OneEuroFilter(
    var minCutoff: Float = DEFAULT_MIN_CUTOFF,
    var beta: Float = DEFAULT_BETA,
    var dCutoff: Float = DEFAULT_D_CUTOFF
) {
    companion object {
        const val DEFAULT_MIN_CUTOFF = 1.5f
        const val DEFAULT_BETA = 1.5f
        const val DEFAULT_D_CUTOFF = 1.0f
    }

    private val xFilter = LowPassFilter()
    private val dxFilter = LowPassFilter()
    private var lastTime: Double? = null

    private fun alpha(rate: Double, cutoff: Float): Float {
        val tau = 1.0 / (2.0 * Math.PI * cutoff)
        val te = 1.0 / rate
        return (1.0 / (1.0 + tau / te)).toFloat()
    }

    fun filter(x: Float, timestampSec: Double): Float {
        val prevTime = lastTime
        if (prevTime == null) {
            lastTime = timestampSec
            dxFilter.filter(0.0f, 1.0f)
            return xFilter.filter(x, 1.0f)
        }

        val rawDt = timestampSec - prevTime
        if (rawDt <= 0.0) {
            // Ignore dt <= 0 (return the last filtered output)
            return xFilter.lastFiltered() ?: x
        }

        val dt = rawDt.coerceIn(0.001, 0.1)
        lastTime = timestampSec
        val rate = 1.0 / dt

        // Compute dx from the previous RAW sample (xFilter.lastRaw())
        val prevRaw = xFilter.lastRaw() ?: x
        val dx = ((x - prevRaw) / dt).toFloat()

        val edx = dxFilter.filter(dx, alpha(rate, dCutoff))
        val cutoff = minCutoff + beta * abs(edx)

        return xFilter.filter(x, alpha(rate, cutoff))
    }

    fun reset(value: Float = 0.0f) {
        xFilter.reset(value)
        dxFilter.reset(0.0f)
        lastTime = null
    }
}
