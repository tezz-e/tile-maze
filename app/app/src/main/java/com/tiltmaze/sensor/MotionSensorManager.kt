package com.tiltmaze.sensor

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.hardware.display.DisplayManager
import android.os.Handler
import android.os.HandlerThread
import android.view.Surface
import android.view.WindowManager
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin
import kotlin.math.sqrt

data class MotionData(
    val pitch: Float,        // Calibrated normalized pitch [-1.0, 1.0]
    val roll: Float,         // Calibrated normalized roll [-1.0, 1.0]
    val yawRate: Float,      // Angular yaw rate
    val shakeTriggered: Boolean,
    val recalibratedPulse: Boolean
)

/**
 * High-Precision Sensor Manager for Kinetic Motion Steering.
 * Reads hardware Game Rotation Vector (or Rotation Vector) at SENSOR_DELAY_FASTEST (~100Hz)
 * on a dedicated HandlerThread ("ImuSensorThread").
 *
 * Uses yaw-invariant, 3D gravity-relative local-grip tilt extraction:
 * - Neutral pose captures the gravity vector in screen coordinates over a ~300ms steady window.
 * - Extracts decoupled local pitch and roll in the calibrated hand frame:
 *   gyLocal = gy * cos(calibPitchAngle) + gz * sin(calibPitchAngle)
 *   gzLocal = -gy * sin(calibPitchAngle) + gz * cos(calibPitchAngle)
 *   deltaPitch = atan2(-gyLocal, gzLocal)
 *   deltaRoll = wrapAngleRad(atan2(-gx, hypot(gyLocal, gzLocal).coerceAtLeast(1e-4f)) - calibRollAngle)
 * - Immune to compass/azimuth rotation and avoids gimbal lock even when held 90° upright.
 * - C0-continuous radial deadzone scales smoothly from DEADZONE_RAD to MAX_TILT_RAD.
 * - Conditions the signal with an adaptive One-Euro filter using sensor timestamps.
 */
class MotionSensorManager(private val context: Context) : SensorEventListener {
    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val displayManager = context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager

    private val rotationSensor: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR)
        ?: sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    private val accelSensor: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)

    // Dedicated HandlerThread for sensor events to prevent main thread lag
    private var sensorThread: HandlerThread? = null
    private var sensorHandler: Handler? = null

    // Adaptive One-Euro Filters
    private val pitchFilter = OneEuroFilter()
    private val rollFilter = OneEuroFilter()

    // Preallocated matrix buffers to avoid per-event allocations
    private val worldRotMatrix = FloatArray(9)
    private val screenRotMatrix = FloatArray(9)

    // Cached display rotation and axis remapping
    @Volatile private var currentDisplayRotation = Surface.ROTATION_90
    @Volatile private var axisX = SensorManager.AXIS_Y
    @Volatile private var axisY = SensorManager.AXIS_MINUS_X

    // Calibration neutral angles (radians)
    @Volatile private var calibPitchAngle = 0.0f
    @Volatile private var calibRollAngle = 0.0f

    // Volatile request flags set from UI/network threads
    @Volatile private var calibRequested = false
    @Volatile private var resetRequested = false

    // Calibration window state (runs over ~300ms of sensor time with 800ms max timeout)
    @Volatile private var pendingCalibration = true
    private var calibInitialRequestTimeNs = 0L
    private var calibWindowStartTimeNs = 0L
    private var calibFirstSampleX = 0.0f
    private var calibFirstSampleY = 0.0f
    private var calibFirstSampleZ = 0.0f
    private var calibSumX = 0.0
    private var calibSumY = 0.0
    private var calibSumZ = 0.0
    private var calibSampleCount = 0

    // Pulse states
    private val recalibratePulse = AtomicBoolean(false)
    private val shakeFramesRemaining = AtomicInteger(0)

    // Current output values
    @Volatile private var currentPitch = 0.0f
    @Volatile private var currentRoll = 0.0f
    @Volatile private var currentYawRate = 0.0f

    // Shake-to-jump detection using sensor timestamps
    private var lastShakeTimestampNs = 0L
    private val SHAKE_THRESHOLD_G = 2.15f * 9.81f // ~21.1 m/s^2
    private val SHAKE_DEBOUNCE_NS = 450L * 1_000_000L // 450ms in ns

    companion object {
        private const val DEADZONE_RAD = 0.025f // ~1.43° continuous deadzone
        private val MAX_TILT_RAD = Math.toRadians(30.0).toFloat()
        private const val CALIBRATION_WINDOW_NS = 300_000_000L // 300ms
        private const val CALIBRATION_TIMEOUT_NS = 800_000_000L // 800ms max timeout
        // cos(3°) ≈ 0.99862953
        private const val MAX_CALIB_MOTION_COS = 0.99862953f
    }

    private val displayListener = object : DisplayManager.DisplayListener {
        override fun onDisplayAdded(displayId: Int) {}
        override fun onDisplayRemoved(displayId: Int) {}
        override fun onDisplayChanged(displayId: Int) {
            val newRotation = getDisplayRotation()
            if (newRotation != currentDisplayRotation) {
                currentDisplayRotation = newRotation
                updateAxisRemap(newRotation)
                // If display rotation changes at runtime, auto-trigger a recalibration
                calibrateNeutral()
            }
        }
    }

    private fun getDisplayRotation(): Int {
        return if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            context.display?.rotation ?: Surface.ROTATION_90
        } else {
            @Suppress("DEPRECATION")
            (context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager)?.defaultDisplay?.rotation ?: Surface.ROTATION_90
        }
    }

    private fun updateAxisRemap(rotation: Int) {
        when (rotation) {
            Surface.ROTATION_0 -> {
                axisX = SensorManager.AXIS_X
                axisY = SensorManager.AXIS_Y
            }
            Surface.ROTATION_90 -> {
                axisX = SensorManager.AXIS_Y
                axisY = SensorManager.AXIS_MINUS_X
            }
            Surface.ROTATION_180 -> {
                axisX = SensorManager.AXIS_MINUS_X
                axisY = SensorManager.AXIS_MINUS_Y
            }
            Surface.ROTATION_270 -> {
                axisX = SensorManager.AXIS_MINUS_Y
                axisY = SensorManager.AXIS_X
            }
            else -> {
                axisX = SensorManager.AXIS_Y
                axisY = SensorManager.AXIS_MINUS_X
            }
        }
    }

    fun start() {
        val thread = HandlerThread("ImuSensorThread").apply { start() }
        sensorThread = thread
        val handler = Handler(thread.looper)
        sensorHandler = handler

        currentDisplayRotation = getDisplayRotation()
        updateAxisRemap(currentDisplayRotation)
        displayManager.registerDisplayListener(displayListener, handler)

        calibRequested = true
        resetRequested = false

        rotationSensor?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_FASTEST, handler)
        }
        accelSensor?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_FASTEST, handler)
        }
    }

    fun stop() {
        sensorManager.unregisterListener(this)
        displayManager.unregisterDisplayListener(displayListener)
        sensorThread?.quitSafely()
        sensorThread = null
        sensorHandler = null
    }

    fun calibrateNeutral() {
        calibRequested = true
    }

    fun resetToFlat() {
        resetRequested = true
    }

    private fun wrapAngleRad(angle: Float): Float {
        var a = angle
        while (a > Math.PI.toFloat()) a -= (2.0 * Math.PI).toFloat()
        while (a < -Math.PI.toFloat()) a += (2.0 * Math.PI).toFloat()
        return a
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null) return

        if (event.sensor.type == Sensor.TYPE_GAME_ROTATION_VECTOR || event.sensor.type == Sensor.TYPE_ROTATION_VECTOR) {
            if (resetRequested) {
                resetRequested = false
                calibRequested = false
                pendingCalibration = false
                calibInitialRequestTimeNs = 0L
                calibWindowStartTimeNs = 0L
                calibSampleCount = 0
                calibPitchAngle = 0.0f
                calibRollAngle = 0.0f
                pitchFilter.reset(0.0f)
                rollFilter.reset(0.0f)
                currentPitch = 0.0f
                currentRoll = 0.0f
                recalibratePulse.set(true)
            } else if (calibRequested) {
                calibRequested = false
                pendingCalibration = true
                calibInitialRequestTimeNs = 0L
                calibWindowStartTimeNs = 0L
                calibSampleCount = 0
            }

            SensorManager.getRotationMatrixFromVector(worldRotMatrix, event.values)
            SensorManager.remapCoordinateSystem(worldRotMatrix, axisX, axisY, screenRotMatrix)

            // World-up in screen coordinates is the third row (m[6], m[7], m[8])
            var gx = screenRotMatrix[6]
            var gy = screenRotMatrix[7]
            var gz = screenRotMatrix[8]
            val gLen = hypot(hypot(gx, gy), gz)
            if (gLen > 1e-4f) {
                gx /= gLen
                gy /= gLen
                gz /= gLen
            } else {
                gx = 0.0f; gy = 0.0f; gz = 1.0f
            }

            // Calibration with stability window (~300ms, restarts on >3° motion, max timeout 800ms)
            if (pendingCalibration) {
                if (calibInitialRequestTimeNs == 0L) {
                    calibInitialRequestTimeNs = event.timestamp
                    calibWindowStartTimeNs = event.timestamp
                    calibFirstSampleX = gx
                    calibFirstSampleY = gy
                    calibFirstSampleZ = gz
                    calibSumX = gx.toDouble()
                    calibSumY = gy.toDouble()
                    calibSumZ = gz.toDouble()
                    calibSampleCount = 1
                } else {
                    val totalElapsedNs = event.timestamp - calibInitialRequestTimeNs
                    val isTimedOut = totalElapsedNs >= CALIBRATION_TIMEOUT_NS

                    val dot = gx * calibFirstSampleX + gy * calibFirstSampleY + gz * calibFirstSampleZ
                    if (dot < MAX_CALIB_MOTION_COS && !isTimedOut) {
                        // Restart window due to motion > 3°
                        calibWindowStartTimeNs = event.timestamp
                        calibFirstSampleX = gx
                        calibFirstSampleY = gy
                        calibFirstSampleZ = gz
                        calibSumX = gx.toDouble()
                        calibSumY = gy.toDouble()
                        calibSumZ = gz.toDouble()
                        calibSampleCount = 1
                    } else {
                        calibSumX += gx.toDouble()
                        calibSumY += gy.toDouble()
                        calibSumZ += gz.toDouble()
                        calibSampleCount++

                        val windowElapsedNs = event.timestamp - calibWindowStartTimeNs
                        if (windowElapsedNs >= CALIBRATION_WINDOW_NS || isTimedOut) {
                            var gx0 = (calibSumX / calibSampleCount).toFloat()
                            var gy0 = (calibSumY / calibSampleCount).toFloat()
                            var gz0 = (calibSumZ / calibSampleCount).toFloat()
                            val g0Len = hypot(hypot(gx0, gy0), gz0)
                            if (g0Len > 1e-4f) {
                                gx0 /= g0Len
                                gy0 /= g0Len
                                gz0 /= g0Len
                            } else {
                                gx0 = 0f; gy0 = 0f; gz0 = 1f
                            }

                            calibPitchAngle = atan2(-gy0, gz0)
                            calibRollAngle = atan2(-gx0, hypot(gy0, gz0).coerceAtLeast(1e-4f))

                            pitchFilter.reset(0.0f)
                            rollFilter.reset(0.0f)
                            currentPitch = 0.0f
                            currentRoll = 0.0f
                            recalibratePulse.set(true)
                            pendingCalibration = false
                        }
                    }
                }
            }

            // Per-event local-grip tilt extraction (no gimbal lock at 90° vertical)
            val cosPitch = cos(calibPitchAngle)
            val sinPitch = sin(calibPitchAngle)

            val gyLocal = gy * cosPitch + gz * sinPitch
            val gzLocal = -gy * sinPitch + gz * cosPitch

            val deltaPitch = atan2(-gyLocal, gzLocal)
            val deltaRoll = wrapAngleRad(atan2(-gx, hypot(gyLocal, gzLocal).coerceAtLeast(1e-4f)) - calibRollAngle)

            // C0-continuous radial deadzone
            val radialMag = hypot(deltaPitch, deltaRoll)
            val normPitch: Float
            val normRoll: Float
            if (radialMag <= DEADZONE_RAD) {
                normPitch = 0.0f
                normRoll = 0.0f
            } else {
                val scale = ((radialMag - DEADZONE_RAD) / (MAX_TILT_RAD - DEADZONE_RAD)).coerceIn(0f, 1f) / radialMag
                normPitch = (deltaPitch * scale).coerceIn(-1.0f, 1.0f)
                normRoll = (deltaRoll * scale).coerceIn(-1.0f, 1.0f)
            }

            // Sensor time in seconds
            val timestampSec = event.timestamp * 1e-9
            currentPitch = pitchFilter.filter(normPitch, timestampSec)
            currentRoll = rollFilter.filter(normRoll, timestampSec)

            // Yaw rate: orientation azimuth without allocations
            currentYawRate = atan2(screenRotMatrix[1], screenRotMatrix[4])

        } else if (event.sensor.type == Sensor.TYPE_LINEAR_ACCELERATION) {
            val ax = event.values[0]
            val ay = event.values[1]
            val az = event.values[2]
            val magnitude = sqrt(ax * ax + ay * ay + az * az)

            if (magnitude > SHAKE_THRESHOLD_G && (event.timestamp - lastShakeTimestampNs > SHAKE_DEBOUNCE_NS)) {
                lastShakeTimestampNs = event.timestamp
                shakeFramesRemaining.set(3) // Active for 3 binary frames
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    /**
     * Side-effect-free read of current motion state for UI tickers.
     */
    fun getCurrentMotionData(): MotionData {
        return MotionData(
            pitch = currentPitch,
            roll = currentRoll,
            yawRate = currentYawRate,
            shakeTriggered = shakeFramesRemaining.get() > 0,
            recalibratedPulse = recalibratePulse.get()
        )
    }

    /**
     * Consumes one-shot pulses (shake frames, recalibrate pulse) for network streaming.
     */
    fun takeFrameForStream(): MotionData {
        var frames = shakeFramesRemaining.get()
        while (frames > 0) {
            if (shakeFramesRemaining.compareAndSet(frames, frames - 1)) {
                break
            }
            frames = shakeFramesRemaining.get()
        }
        val isShake = frames > 0
        val isRecal = recalibratePulse.getAndSet(false)

        return MotionData(
            pitch = currentPitch,
            roll = currentRoll,
            yawRate = currentYawRate,
            shakeTriggered = isShake,
            recalibratedPulse = isRecal
        )
    }
}
