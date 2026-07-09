package com.fotify

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.*
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import com.fotify.databinding.ActivityMainBinding
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

/**
 * Main activity: full-screen WebView showing the Fotify slideshow.
 *
 * Key behaviour
 * ─────────────
 * • BACK (short press) — toggles between slideshow `/` and admin `/admin`
 * • BACK (long press)  — closes the app
 * • Screen never sleeps (FLAG_KEEP_SCREEN_ON)
 * • Immersive fullscreen (system bars hidden)
 * • Polls `/photos/current-slide` every 5 s to detect empty state
 * • Shows overlay when no sources are configured yet
 * • Shows overlay when the server is unreachable
 */
class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "MainActivity"
        private const val POLL_INTERVAL_MS = 5_000L
        private const val CONNECT_TIMEOUT_MS = 3_000
        private const val READ_TIMEOUT_MS = 3_000
    }

    private lateinit var binding: ActivityMainBinding
    private var serverUrl: String = ""
    private var isAtAdmin = false
    private var pollingJob: Job? = null

    // ── Lifecycle ─────────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Keep display on – no sleep/screen-saver during slideshow
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val prefs = Prefs.get(this)
        serverUrl = prefs.serverUrl ?: run {
            // No server configured → go back to discovery
            startActivity(Intent(this, DiscoveryActivity::class.java))
            finish()
            return
        }

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        applyFullscreen()
        setupWebView()
        setupOverlayButtons()
        loadSlideshow()
    }

    override fun onResume() {
        super.onResume()
        applyFullscreen()
        if (!isAtAdmin) startPolling()
    }

    override fun onPause() {
        super.onPause()
        stopPolling()
    }

    override fun onDestroy() {
        super.onDestroy()
        binding.webView.destroy()
    }

    // ── Fullscreen ────────────────────────────────────────────────────────

    private fun applyFullscreen() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, binding.root).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    // ── WebView setup ─────────────────────────────────────────────────────

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val wv = binding.webView
        wv.setBackgroundColor(Color.BLACK)
        wv.setLayerType(View.LAYER_TYPE_HARDWARE, null)

        wv.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            cacheMode = WebSettings.LOAD_DEFAULT
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
        }

        wv.webViewClient = buildWebViewClient()
        wv.webChromeClient = buildWebChromeClient()
    }

    private fun buildWebViewClient() = object : WebViewClient() {

        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
            hideAllOverlays()
        }

        override fun onPageFinished(view: WebView?, url: String?) {
            val currentUrl = url ?: ""
            isAtAdmin = currentUrl.contains("/admin")
            if (!isAtAdmin) startPolling() else stopPolling()
        }

        // API 23+ error handling (main-frame only)
        override fun onReceivedError(
            view: WebView?,
            request: WebResourceRequest?,
            error: WebResourceError?,
        ) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (request?.isForMainFrame == true) showConnectionError()
            }
        }

        // Legacy (API < 23)
        @Suppress("DEPRECATION", "OverridingDeprecatedMember")
        override fun onReceivedError(
            view: WebView?,
            errorCode: Int,
            description: String?,
            failingUrl: String?,
        ) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                showConnectionError()
            }
        }

        @Suppress("DEPRECATION")
        override fun onReceivedSslError(view: WebView?, handler: SslErrorHandler?, error: SslError?) {
            // Reject SSL errors (local servers use plain HTTP anyway)
            handler?.cancel()
        }
    }

    private fun buildWebChromeClient() = object : WebChromeClient() {
        // Allow video autoplay / fullscreen video inside the WebView
        override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
            super.onShowCustomView(view, callback)
        }
    }

    // ── Navigation ────────────────────────────────────────────────────────

    private fun loadSlideshow() {
        val url = if (serverUrl.endsWith("/")) serverUrl else "$serverUrl/"
        binding.webView.loadUrl(url)
        isAtAdmin = false
    }

    private fun navigateToAdmin() {
        binding.webView.loadUrl("$serverUrl/admin")
        isAtAdmin = true
        stopPolling()
        hideAllOverlays()
    }

    private fun navigateToSlideshow() {
        hideAllOverlays()
        loadSlideshow()
    }

    // ── Key handling (BACK short → admin toggle, BACK long → exit) ────────

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            event.startTracking()   // Required for onKeyLongPress to fire
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onKeyLongPress(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            // Long-press BACK → close the app
            finishAndRemoveTask()
            return true
        }
        return super.onKeyLongPress(keyCode, event)
    }

    override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.isCanceled) return true   // was a long press; already handled
            // Short-press BACK → toggle slideshow ↔ admin
            if (isAtAdmin) navigateToSlideshow() else navigateToAdmin()
            return true
        }
        return super.onKeyUp(keyCode, event)
    }

    // ── Overlay management ────────────────────────────────────────────────

    private fun setupOverlayButtons() {
        // Connection-error overlay buttons
        binding.retryButton.setOnClickListener {
            hideAllOverlays()
            loadSlideshow()
        }
        binding.changeServerButton.setOnClickListener { changeServer() }

        // Empty-state overlay button
        binding.changeServerButton2.setOnClickListener { changeServer() }
    }

    private fun showConnectionError() {
        stopPolling()
        binding.connectionErrorOverlay.visibility = View.VISIBLE
        binding.emptyStateOverlay.visibility = View.GONE
        binding.connectionErrorUrl.text = serverUrl
    }

    private fun showEmptyStateOverlay() {
        if (binding.connectionErrorOverlay.visibility == View.VISIBLE) return
        binding.emptyStateOverlay.visibility = View.VISIBLE
        binding.adminUrlText.text = "$serverUrl/admin"
    }

    private fun hideEmptyStateOverlay() {
        binding.emptyStateOverlay.visibility = View.GONE
    }

    private fun hideAllOverlays() {
        binding.emptyStateOverlay.visibility = View.GONE
        binding.connectionErrorOverlay.visibility = View.GONE
    }

    private fun changeServer() {
        stopPolling()
        Prefs.get(this).clear()
        startActivity(Intent(this, DiscoveryActivity::class.java))
        finish()
    }

    // ── Empty-state polling ───────────────────────────────────────────────

    private fun startPolling() {
        if (pollingJob?.isActive == true) return
        pollingJob = lifecycleScope.launch {
            delay(1_500)   // Let the page load first
            while (isActive) {
                if (!isAtAdmin) checkSlideshowState()
                delay(POLL_INTERVAL_MS)
            }
        }
    }

    private fun stopPolling() {
        pollingJob?.cancel()
        pollingJob = null
    }

    private suspend fun checkSlideshowState() {
        val type = withContext(Dispatchers.IO) {
            fetchJson("$serverUrl/photos/current-slide")?.optString("type")
        } ?: return

        withContext(Dispatchers.Main) {
            if (type == "empty") {
                checkSourceCount()
            } else {
                hideEmptyStateOverlay()
            }
        }
    }

    private suspend fun checkSourceCount() {
        val isEmpty = withContext(Dispatchers.IO) {
            val body = fetchText("$serverUrl/sources") ?: return@withContext true
            try {
                // Sources endpoint returns a plain JSON array
                JSONArray(body).length() == 0
            } catch (_: Exception) {
                // Fallback: try {data: [...]} shape
                try {
                    val obj = JSONObject(body)
                    obj.optJSONArray("data")?.length() == 0
                } catch (_: Exception) {
                    true
                }
            }
        }
        withContext(Dispatchers.Main) {
            if (isEmpty) showEmptyStateOverlay() else hideEmptyStateOverlay()
        }
    }

    // ── HTTP helpers ──────────────────────────────────────────────────────

    private fun fetchText(urlString: String): String? {
        return try {
            val conn = URL(urlString).openConnection() as HttpURLConnection
            conn.connectTimeout = CONNECT_TIMEOUT_MS
            conn.readTimeout = READ_TIMEOUT_MS
            conn.connect()
            if (conn.responseCode != 200) return null
            BufferedReader(InputStreamReader(conn.inputStream)).use { it.readText() }
                .also { conn.disconnect() }
        } catch (e: Exception) {
            Log.w(TAG, "HTTP fetch failed for $urlString: ${e.message}")
            null
        }
    }

    private fun fetchJson(urlString: String): JSONObject? =
        fetchText(urlString)?.let { body ->
            try { JSONObject(body) } catch (_: Exception) { null }
        }
}
