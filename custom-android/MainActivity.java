package com.pulsar.musicplayer;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private PowerManager.WakeLock wakeLock;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private BroadcastReceiver noisyAudioReceiver;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 1. Partial WakeLock for continuous screen-off audio playback
        try {
            PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (powerManager != null) {
                wakeLock = powerManager.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "PulsarAudio::PlaybackWakeLock"
                );
                wakeLock.acquire();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        // 2. Request Android Audio Focus
        initAudioFocus();

        // 3. Register Noisy Audio Receiver (Headphones disconnected / Bluetooth lost)
        registerNoisyReceiver();

        // 4. Handle Hardware Back Button
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge().getWebView();
                if (webView != null) {
                    webView.evaluateJavascript(
                        "(function() {" +
                        "  var eqModal = document.getElementById('eqModal');" +
                        "  if (eqModal && eqModal.classList.contains('active')) {" +
                        "    document.getElementById('closeEqBtn')?.click(); return true;" +
                        "  }" +
                        "  var npStage = document.getElementById('nowPlayingStage');" +
                        "  if (npStage && npStage.classList.contains('mobile-active')) {" +
                        "    document.getElementById('npCollapseBtn')?.click(); return true;" +
                        "  }" +
                        "  var sidebar = document.getElementById('appSidebar');" +
                        "  if (sidebar && sidebar.classList.contains('mobile-open')) {" +
                        "    sidebar.classList.remove('mobile-open');" +
                        "    document.getElementById('mobileDrawerBackdrop')?.classList.remove('active');" +
                        "    return true;" +
                        "  }" +
                        "  return false;" +
                        "})();",
                        result -> {
                            if (!"true".equals(result)) {
                                moveTaskToBack(true);
                            }
                        }
                    );
                } else {
                    moveTaskToBack(true);
                }
            }
        });
    }

    private void initAudioFocus() {
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (audioManager == null) return;

        AudioManager.OnAudioFocusChangeListener focusChangeListener = focusChange -> {
            WebView webView = getBridge().getWebView();
            if (webView == null) return;

            if (focusChange == AudioManager.AUDIOFOCUS_LOSS ||
                focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                // Auto-pause on incoming call or permanent loss
                webView.post(() -> webView.evaluateJavascript(
                    "if (window.app && window.app.audioEngine) window.app.audioEngine.pause();",
                    null
                ));
            } else if (focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
                // Temporarily duck volume
                webView.post(() -> webView.evaluateJavascript(
                    "if (window.app && window.app.audioEngine) window.app.audioEngine.setVolume(0.2);",
                    null
                ));
            } else if (focusChange == AudioManager.AUDIOFOCUS_GAIN) {
                // Restore volume
                webView.post(() -> webView.evaluateJavascript(
                    "if (window.app && window.app.audioEngine) window.app.audioEngine.setVolume(window.app.audioEngine.previousVolume || 0.8);",
                    null
                ));
            }
        };

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes playbackAttributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build();

            audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(playbackAttributes)
                .setAcceptsDelayedFocusGain(true)
                .setOnAudioFocusChangeListener(focusChangeListener)
                .build();

            audioManager.requestAudioFocus(audioFocusRequest);
        } else {
            audioManager.requestAudioFocus(
                focusChangeListener,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN
            );
        }
    }

    private void registerNoisyReceiver() {
        noisyAudioReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) {
                    WebView webView = getBridge().getWebView();
                    if (webView != null) {
                        webView.post(() -> webView.evaluateJavascript(
                            "if (window.app && window.app.audioEngine) window.app.audioEngine.pause();",
                            null
                        ));
                    }
                }
            }
        };

        IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        registerReceiver(noisyAudioReceiver, filter);
    }

    @Override
    public void onPause() {
        super.onPause();
        // Keep WebView and JavaScript audio running in background with screen turned off
        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                webView.onResume();
                webView.resumeTimers();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onStop() {
        super.onStop();
        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                webView.onResume();
                webView.resumeTimers();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        if (noisyAudioReceiver != null) {
            try {
                unregisterReceiver(noisyAudioReceiver);
            } catch (Exception ignored) {}
        }
        if (audioManager != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
                audioManager.abandonAudioFocusRequest(audioFocusRequest);
            }
        }
    }
}
