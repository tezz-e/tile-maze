package com.tiltmaze.haptics

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

class HapticManager(context: Context) {
    private val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val manager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        manager?.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

    fun trigger(effectName: String, durationMs: Long = 50L, intensity: Float = 0.5f) {
        if (vibrator == null || !vibrator.hasVibrator()) return

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val amplitude = (intensity.coerceIn(0.1f, 1.0f) * 255).toInt()

            val effect = when (effectName) {
                "impactLight" -> VibrationEffect.createOneShot(30L, amplitude / 2)
                "impactHeavy" -> VibrationEffect.createOneShot(70L, amplitude)
                "scrape" -> {
                    val timings = longArrayOf(0, 20, 30, 20)
                    val amplitudes = intArrayOf(0, amplitude / 3, 0, amplitude / 3)
                    VibrationEffect.createWaveform(timings, amplitudes, -1)
                }
                "success" -> {
                    val timings = longArrayOf(0, 40, 60, 80)
                    val amplitudes = intArrayOf(0, 160, 0, 255)
                    VibrationEffect.createWaveform(timings, amplitudes, -1)
                }
                "warning" -> {
                    val timings = longArrayOf(0, 50, 40, 50, 40, 50)
                    val amplitudes = intArrayOf(0, 255, 0, 255, 0, 255)
                    VibrationEffect.createWaveform(timings, amplitudes, -1)
                }
                else -> VibrationEffect.createOneShot(durationMs, amplitude)
            }
            vibrator.vibrate(effect)
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(durationMs)
        }
    }
}
