package com.tiltmaze.sensor

import kotlin.math.PI
import kotlin.math.abs

private class LowPassFilter {
    private var y: Float? = null
    private var s: Float? = null

    fun filter(value: Float, alpha: Float): Float {
        if (y == null) {
            s = value
            y = value
            return value
        }
        y = value
        s = alpha * value + (1.0f - alpha) * s!!
        return s!!
    }

    fun last(): Float? = s

    fun reset() {
        y = null
        s = null
    }
}

/**
 * Adaptive One Euro Filter in Kotlin.
 * Eliminates hand tremors at rest while providing zero-lag tracking during fast motions.
 */
class OneEuroFilter(
    var minCutoff: Float = 1.0f,
    var beta: Float = 0.05f,
    var dCutoff: Float = 1.0f
) {
    private val xFilter = LowPassFilter()
    private val dxFilter = LowPassFilter()
    private var lastTime: Long? = null

    private fun alpha(rate: Float, cutoff: Float): Float {
        val tau = 1.0f / (2.0f * PI.toFloat() * cutoff)
        val te = 1.0f / rate
        return 1.0f / (1.0f + tau / te)
    }

    fun filter(x: Float, timestampMs: Long): Float {
        if (lastTime == null) {
            lastTime = timestampMs
            dxFilter.filter(0.0f, 1.0f)
            return xFilter.filter(x, 1.0f)
        }

        val dt = (timestampMs - lastTime!!) / 1000.0f
        lastTime = timestampMs
        val rate = if (dt > 0.0f) 1.0f / dt else 60.0f

        val prevX = xFilter.last() ?: x
        val dx = (x - prevX) * rate
        val edx = dxFilter.filter(dx, alpha(rate, dCutoff))

        val cutoff = minCutoff + beta * abs(edx)
        return xFilter.filter(x, alpha(rate, cutoff))
    }

    fun reset() {
        xFilter.reset()
        dxFilter.reset()
        lastTime = null
    }
}
