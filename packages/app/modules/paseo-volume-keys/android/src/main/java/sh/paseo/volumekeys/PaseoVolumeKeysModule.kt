package sh.paseo.volumekeys

import android.view.KeyEvent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Observes hardware volume-key presses so speech playback can mute on a
 * single volume-down and debounce rapid volume bursts. The activity forwards
 * key events here; this module only emits to JS and never consumes the key,
 * so the system still adjusts the stream volume exactly as before.
 */
class PaseoVolumeKeysModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    @Volatile
    private var instance: PaseoVolumeKeysModule? = null

    /**
     * Called from MainActivity.onKeyDown. Safe from any thread; a no-op when
     * no JS module instance is alive (nothing is listening).
     */
    fun notifyKeyDown(keyCode: Int) {
      val module = instance ?: return
      when (keyCode) {
        KeyEvent.KEYCODE_VOLUME_DOWN -> module.emit("down")
        KeyEvent.KEYCODE_VOLUME_UP -> module.emit("up")
        else -> {}
      }
    }
  }

  override fun initialize() {
    super.initialize()
    instance = this
  }

  override fun onCatalystInstanceDestroy() {
    instance = null
    super.onCatalystInstanceDestroy()
  }

  override fun getName() = "PaseoVolumeKeys"

  // Required by RN's event-emitter contract even though we never use them.
  @ReactMethod fun addListener(eventName: String) {}

  @ReactMethod fun removeListeners(count: Int) {}

  private fun emit(direction: String) {
    try {
      reactApplicationContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("PaseoVolumeKey", direction)
    } catch (_: IllegalStateException) {
      // Catalyst instance is gone; the press is simply not delivered.
    }
  }
}
