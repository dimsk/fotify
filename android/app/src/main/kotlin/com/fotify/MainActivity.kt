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
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.isVisible
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
 * • BACK (short) + connection-error overlay visible → retry reload
 * • BACK (short) + empty-state overlay visible      → open /admin
 * • BACK (short) + no overlay, on slideshow         → open /admin
 * • BACK (short) + no overlay, on admin             → back to slideshow
 * • BACK (long)                                     → close app
 * • Screen never sleeps (FLAG_KEEP_SCREEN_ON)
 * • Immersive fullscreen (system bars hidden)
 * • Polls /photos/current-slide every 5 s for empty-state detection
 */
class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "MainActivity"
        private const val POLL_INTERVAL_MS = 5_000L
        private const val HTTP_TIMEOUT_MS = 3_000
        /** Number of consecutive main-frame errors before showing the error overlay. */
        private const val ERROR_RETRY_THRESHOLD = 1
    }

    private lateinit var binding: ActivityMainBinding
    private var serverUrl: String = ""
    private var isAtAdmin = false
    private var pollingJob: Job? = null
    private var retryJob: Job? = null

    /** Counts consecutive main-frame network errors since last successful page load. */
    private var consecutiveErrors = 0

    // ── Lifecycle ─────────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Keep display on and hide status/navigation bars as early as possible.
        // FireOS 6/7 is unreliable if fullscreen is applied only after setContentView().
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_FULLSCREEN,
        )

        val prefs = Prefs.get(this)
        serverUrl = prefs.serverUrl ?: run {
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
        if (!isAtAdmin && !binding.connectionErrorOverlay.isVisible) startPolling()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) applyFullscreen()
    }

    override fun onPause() {
        super.onPause()
        stopPolling()
        retryJob?.cancel()
    }

    override fun onDestroy() {
        super.onDestroy()
        binding.webView.destroy()
    }

    // ── Fullscreen ────────────────────────────────────────────────────────

    private fun applyFullscreen() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE

        @Suppress("DEPRECATION")
        window.setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
        )

        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    // ── WebView setup ─────────────────────────────────────────────────────

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        WebView.setWebContentsDebuggingEnabled(true)

        val wv = binding.webView
        wv.setBackgroundColor(Color.BLACK)
        wv.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        wv.isVerticalScrollBarEnabled = false
        wv.isHorizontalScrollBarEnabled = false
        wv.isScrollbarFadingEnabled = true
        wv.overScrollMode = View.OVER_SCROLL_NEVER

        wv.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            loadsImagesAutomatically = true
            javaScriptCanOpenWindowsAutomatically = false
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            cacheMode = WebSettings.LOAD_DEFAULT
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
        }

        wv.addJavascriptInterface(DisplayBridge(), "FotifyDisplay")
        wv.webViewClient = buildWebViewClient()
        wv.webChromeClient = buildWebChromeClient()
    }

    /** Exposes the native display resolution to the remote Fotify frontend. */
    inner class DisplayBridge {
        @JavascriptInterface
        fun getWidth(): Int = displaySize().first

        @JavascriptInterface
        fun getHeight(): Int = displaySize().second

        @JavascriptInterface
        fun getDensity(): Float = resources.displayMetrics.density
    }

    private fun displaySize(): Pair<Int, Int> {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val bounds = windowManager.currentWindowMetrics.bounds
            bounds.width() to bounds.height()
        } else {
            @Suppress("DEPRECATION")
            val display = windowManager.defaultDisplay
            val metrics = android.util.DisplayMetrics()
            @Suppress("DEPRECATION")
            display.getRealMetrics(metrics)
            metrics.widthPixels to metrics.heightPixels
        }
    }

    private fun buildWebViewClient() = object : WebViewClient() {

        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
            // New load attempt: reset error counter and hide stale overlays
            consecutiveErrors = 0
            retryJob?.cancel()
            hideAllOverlays()
        }

        override fun onPageFinished(view: WebView?, url: String?) {
            val currentUrl = url ?: ""
            isAtAdmin = currentUrl.contains("/admin")
            if (!isAtAdmin) startPolling() else stopPolling()
        }

        // ── Main-frame error: retry once silently, then show overlay ──────

        // API 23+ (preferred path – only fires for this specific request)
        override fun onReceivedError(
            view: WebView?,
            request: WebResourceRequest?,
            error: WebResourceError?,
        ) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                request?.isForMainFrame == true
            ) {
                val description = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
                    error?.description?.toString() ?: "" else ""
                val errorCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
                    error?.errorCode ?: -1 else -1
                Log.w(TAG, "Main-frame error $errorCode: $description (url=${request.url})")
                handleMainFrameError("$description (code $errorCode)")
            }
        }

        // Legacy API < 23
        @Suppress("DEPRECATION", "OverridingDeprecatedMember")
        override fun onReceivedError(
            view: WebView?,
            errorCode: Int,
            description: String?,
            failingUrl: String?,
        ) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                Log.w(TAG, "Legacy main-frame error $errorCode: $description")
                handleMainFrameError("$description (code $errorCode)")
            }
        }

        @Suppress("DEPRECATION")
        override fun onReceivedSslError(
            view: WebView?,
            handler: SslErrorHandler?,
            error: SslError?,
        ) {
            handler?.cancel()
        }
    }

    private fun handleMainFrameError(description: String) {
        consecutiveErrors++
        if (consecutiveErrors > ERROR_RETRY_THRESHOLD) {
            // Multiple failures → show overlay
            showConnectionError(description)
        } else {
            // First failure → silent retry after 2 s
            retryJob?.cancel()
            retryJob = lifecycleScope.launch {
                delay(2_000)
                if (isActive) {
                    Log.d(TAG, "Silent retry after first main-frame error")
                    loadSlideshow()
                }
            }
        }
    }

    private fun buildWebChromeClient() = object : WebChromeClient() {
        override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
            consoleMessage ?: return false
            Log.d(
                TAG,
                "WebView console ${consoleMessage.messageLevel()}: " +
                    "${consoleMessage.message()} (${consoleMessage.sourceId()}:${consoleMessage.lineNumber()})",
            )
            return true
        }

        override fun onProgressChanged(view: WebView?, newProgress: Int) {
            Log.d(TAG, "WebView load progress: $newProgress")
            super.onProgressChanged(view, newProgress)
        }

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

    // ── Key handling ──────────────────────────────────────────────────────
    //
    // BACK (short press):
    //   connection-error overlay visible  → retry
    //   empty-state overlay visible       → open /admin
    //   on slideshow (no overlay)         → open /admin
    //   on admin                          → back to slideshow
    //
    // BACK (long press): close the app

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            event.startTracking()   // Required for onKeyLongPress to fire
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onKeyLongPress(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            finishAndRemoveTask()
            return true
        }
        return super.onKeyLongPress(keyCode, event)
    }

    override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.isCanceled) return true  // was a long press – already handled

            when {
                // Error overlay: short BACK = retry connecting
                binding.connectionErrorOverlay.isVisible -> {
                    consecutiveErrors = 0
                    hideAllOverlays()
                    loadSlideshow()
                }
                // Empty-state overlay: short BACK = open admin so user can add sources
                binding.emptyStateOverlay.isVisible -> {
                    navigateToAdmin()
                }
                // Normal mode: toggle slideshow ↔ admin
                isAtAdmin -> navigateToSlideshow()
                else -> navigateToAdmin()
            }
            return true
        }
        return super.onKeyUp(keyCode, event)
    }

    // ── Overlay management ────────────────────────────────────────────────

    private fun setupOverlayButtons() {
        binding.retryButton.setOnClickListener {
            consecutiveErrors = 0
            hideAllOverlays()
            loadSlideshow()
        }
        binding.changeServerButton.setOnClickListener { changeServer() }
        binding.changeServerButton2.setOnClickListener { changeServer() }
    }

    private fun showConnectionError(description: String = "") {
        stopPolling()
        retryJob?.cancel()
        binding.emptyStateOverlay.visibility = View.GONE
        binding.connectionErrorOverlay.visibility = View.VISIBLE
        binding.connectionErrorUrl.text = serverUrl
        binding.connectionErrorDetail.text = description.ifEmpty { "" }
        // Move D-pad focus to the first actionable button in the overlay
        binding.retryButton.requestFocus()
    }

    private fun showEmptyStateOverlay() {
        if (binding.connectionErrorOverlay.isVisible) return
        binding.emptyStateOverlay.visibility = View.VISIBLE
        binding.adminUrlText.text = "$serverUrl/admin"
        binding.changeServerButton2.requestFocus()
    }

    private fun hideEmptyStateOverlay() {
        binding.emptyStateOverlay.visibility = View.GONE
    }

    private fun hideAllOverlays() {
        binding.emptyStateOverlay.visibility = View.GONE
        binding.connectionErrorOverlay.visibility = View.GONE
        if (!isAtAdmin) startPolling()
    }

    private fun changeServer() {
        stopPolling()
        retryJob?.cancel()
        Prefs.get(this).clear()
        startActivity(Intent(this, DiscoveryActivity::class.java))
        finish()
    }

    // ── Empty-state polling ───────────────────────────────────────────────

    private fun startPolling() {
        if (pollingJob?.isActive == true) return
        pollingJob = lifecycleScope.launch {
            delay(1_500)
            while (isActive) {
                if (!isAtAdmin && !binding.connectionErrorOverlay.isVisible) {
                    checkSlideshowState()
                }
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
            if (type == "empty") checkSourceCount() else hideEmptyStateOverlay()
        }
    }

    private suspend fun checkSourceCount() {
        val isEmpty = withContext(Dispatchers.IO) {
            val body = fetchText("$serverUrl/sources") ?: return@withContext true
            try {
                JSONArray(body).length() == 0
            } catch (_: Exception) {
                try {
                    JSONObject(body).optJSONArray("data")?.length() == 0 ?: true
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

    private fun fetchText(urlString: String): String? = try {
        val conn = URL(urlString).openConnection() as HttpURLConnection
        conn.connectTimeout = HTTP_TIMEOUT_MS
        conn.readTimeout = HTTP_TIMEOUT_MS
        conn.connect()
        if (conn.responseCode != 200) null
        else BufferedReader(InputStreamReader(conn.inputStream)).use { it.readText() }
            .also { conn.disconnect() }
    } catch (e: Exception) {
        Log.w(TAG, "HTTP fetch failed [$urlString]: ${e.message}")
        null
    }

    private fun fetchJson(urlString: String): JSONObject? =
        fetchText(urlString)?.let { try { JSONObject(it) } catch (_: Exception) { null } }
}
