package com.tiltmaze.sensor

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.view.Surface
import android.view.WindowManager
import kotlin.math.hypot
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
 * Reads hardware Game Rotation Vector (or Rotation Vector) at SENSOR_DELAY_FASTEST (~100Hz),
 * performs display-aware coordinate transformation, applies calibration offsets,
 * and conditions the signal with an adaptive One-Euro filter.
 */
class MotionSensorManager(private val context: Context) : SensorEventListener {
    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val rotationSensor: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR)
        ?: sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    private val accelSensor: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)

    // One-Euro Filters for jitter-free pitch and roll
    private val pitchFilter = OneEuroFilter(minCutoff = 1.0f, beta = 0.4f)
    private val rollFilter = OneEuroFilter(minCutoff = 1.0f, beta = 0.4f)

    // Calibration offsets (in radians)
    @Volatile private var calibPitchOffset = 0.0f
    @Volatile private var calibRollOffset = 0.0f
    @Volatile private var pendingCalibration = false
    @Volatile private var recalibratePulse = false

    // Current filtered values
    @Volatile private var currentPitch = 0.0f
    @Volatile private var currentRoll = 0.0f
    @Volatile private var currentYawRate = 0.0f

    // Shake-to-jump detection
    private var lastShakeTime = 0L
    private var shakeFramesRemaining = 0
    private val SHAKE_THRESHOLD_G = 2.15f * 9.81f // ~21.1 m/s^2
    private val SHAKE_DEBOUNCE_MS = 450L
    private val MAX_TILT_DEG = 30.0f
    private val DEADZONE_RAD = 0.025f // ~1.4° deadzone

    fun start() {
        rotationSensor?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_FASTEST)
        }
        accelSensor?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_FASTEST)
        }
    }

    fun stop() {
        sensorManager.unregisterListener(this)
    }

    fun calibrateNeutral() {
        pendingCalibration = true
    }

    fun resetToFlat() {
        calibPitchOffset = 0.0f
        calibRollOffset = 0.0f
        recalibratePulse = true
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null) return
        val now = System.currentTimeMillis()

        if (event.sensor.type == Sensor.TYPE_GAME_ROTATION_VECTOR || event.sensor.type == Sensor.TYPE_ROTATION_VECTOR) {
            val worldRotMatrix = FloatArray(9)
            SensorManager.getRotationMatrixFromVector(worldRotMatrix, event.values)

            // Remap coordinate system for current display rotation
            val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager
            val displayRotation = windowManager?.defaultDisplay?.rotation ?: Surface.ROTATION_90

            val axisX: Int
            val axisY: Int
            when (displayRotation) {
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

            val screenRotMatrix = FloatArray(9)
            SensorManager.remapCoordinateSystem(worldRotMatrix, axisX, axisY, screenRotMatrix)

            val orientation = FloatArray(3)
            SensorManager.getOrientation(screenRotMatrix, orientation)

            val rawAzimuth = orientation[0]
            val rawPitch = orientation[1] // Pitch (tilt nose-down / nose-up)
            val rawRoll = orientation[2]  // Roll (tilt left / tilt right)

            // Apply pending calibration
            if (pendingCalibration) {
                calibPitchOffset = rawPitch
                calibRollOffset = rawRoll
                pendingCalibration = false
                recalibratePulse = true
            }

            // Calculate calibrated relative delta angles
            var deltaPitch = rawPitch - calibPitchOffset
            var deltaRoll = rawRoll - calibRollOffset

            // Deadzone check
            val radialMag = hypot(deltaPitch, deltaRoll)
            if (radialMag < DEADZONE_RAD) {
                deltaPitch = 0.0f
                deltaRoll = 0.0f
            }

            // Normalize to [-1.0, 1.0] clamped to MAX_TILT_DEG
            val maxTiltRad = (MAX_TILT_DEG * Math.PI / 180.0).toFloat()
            val normPitch = (deltaPitch / maxTiltRad).coerceIn(-1.0f, 1.0f)
            val normRoll = (deltaRoll / maxTiltRad).coerceIn(-1.0f, 1.0f)

            // Adaptive One Euro Filter
            currentPitch = pitchFilter.filter(normPitch, now)
            currentRoll = rollFilter.filter(normRoll, now)
            currentYawRate = rawAzimuth
        } else if (event.sensor.type == Sensor.TYPE_LINEAR_ACCELERATION) {
            val ax = event.values[0]
            val ay = event.values[1]
            val az = event.values[2]
            val magnitude = sqrt(ax * ax + ay * ay + az * az)

            if (magnitude > SHAKE_THRESHOLD_G && (now - lastShakeTime > SHAKE_DEBOUNCE_MS)) {
                lastShakeTime = now
                shakeFramesRemaining = 3 // Active for 3 binary frames
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    fun getCurrentMotionData(): MotionData {
        val isShake = shakeFramesRemaining > 0
        if (shakeFramesRemaining > 0) shakeFramesRemaining--

        val isRecal = recalibratePulse
        recalibratePulse = false

        return MotionData(
            pitch = currentPitch,
            roll = currentRoll,
            yawRate = currentYawRate,
            shakeTriggered = isShake,
            recalibratedPulse = isRecal
        )
    }
}
