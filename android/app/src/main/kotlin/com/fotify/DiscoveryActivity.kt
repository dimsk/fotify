package com.fotify

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.widget.BaseAdapter
import android.widget.ListView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.isVisible
import androidx.lifecycle.lifecycleScope
import com.fotify.databinding.ActivityDiscoveryBinding
import kotlinx.coroutines.launch

/**
 * Server discovery and selection screen.
 *
 * Shown on first launch (or when no server is configured). Scans the LAN via
 * mDNS/NSD for Fotify servers and also allows manual IP:Port entry.
 *
 * Once the user selects or enters a server the URL is persisted and
 * [MainActivity] is launched.
 */
class DiscoveryActivity : AppCompatActivity() {

    private lateinit var binding: ActivityDiscoveryBinding
    private lateinit var nsd: NsdHelper
    private lateinit var lanScanner: LanScanner
    private lateinit var udpDiscoveryListener: UdpDiscoveryListener
    private val servers = mutableListOf<FotifyServer>()
    private lateinit var adapter: ServerAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)

        // Skip discovery if a server is already configured
        val prefs = Prefs.get(this)
        if (prefs.serverUrl != null) {
            openMainActivity()
            return
        }

        binding = ActivityDiscoveryBinding.inflate(layoutInflater)
        setContentView(binding.root)

        applyFullscreen()

        setupServerList()
        setupManualInput()
        startDiscovery()
    }

    override fun onResume() {
        super.onResume()
        if (::binding.isInitialized) applyFullscreen()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && ::binding.isInitialized) applyFullscreen()
    }

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

    // ── Server list ───────────────────────────────────────────────────────

    private fun setupServerList() {
        adapter = ServerAdapter()
        binding.serverList.apply {
            adapter = this@DiscoveryActivity.adapter
            choiceMode = ListView.CHOICE_MODE_SINGLE
            isFocusable = true
            isFocusableInTouchMode = false
            itemsCanFocus = false

            setOnItemClickListener { _, _, position, _ ->
                connectToPosition(position)
            }

            setOnKeyListener { _, keyCode, event ->
                if (event.action != KeyEvent.ACTION_UP) return@setOnKeyListener false
                if (!isConfirmKey(keyCode)) return@setOnKeyListener false
                connectSelectedServer()
                true
            }
        }
    }

    private fun isConfirmKey(keyCode: Int): Boolean = keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
        keyCode == KeyEvent.KEYCODE_ENTER ||
        keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER ||
        keyCode == KeyEvent.KEYCODE_BUTTON_A

    private fun connectSelectedServer() {
        val position = binding.serverList.selectedItemPosition
            .takeIf { it in servers.indices }
            ?: 0.takeIf { servers.isNotEmpty() }
            ?: return
        connectToPosition(position)
    }

    private fun connectToPosition(position: Int) {
        if (position !in servers.indices) return
        connectTo(servers[position])
    }

    // ── Manual URL input ──────────────────────────────────────────────────

    private fun setupManualInput() {
        binding.connectButton.setOnClickListener { handleManualConnect() }

        binding.manualUrl.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_GO || actionId == EditorInfo.IME_ACTION_DONE) {
                handleManualConnect()
                true
            } else {
                false
            }
        }
    }

    private fun handleManualConnect() {
        val raw = binding.manualUrl.text.toString().trim()
        if (raw.isEmpty()) {
            Toast.makeText(this, getString(R.string.enter_address_hint), Toast.LENGTH_SHORT).show()
            return
        }

        // Accept "ip:port", "ip" (defaults to 15766), or full "http://..." URLs
        val fullUrl = when {
            raw.startsWith("http://") || raw.startsWith("https://") -> raw
            else -> "http://$raw"
        }

        val host = extractHost(fullUrl)
        val port = extractPort(fullUrl)

        if (host.isEmpty()) {
            Toast.makeText(this, getString(R.string.invalid_address), Toast.LENGTH_SHORT).show()
            return
        }

        connectTo(FotifyServer(name = raw, host = host, port = port))
    }

    // ── mDNS discovery ────────────────────────────────────────────────────

    private fun startDiscovery() {
        nsd = NsdHelper(this).apply {
            onServerFound = { server ->
                runOnUiThread { addServer(server) }
            }
            onServerLost = { name ->
                runOnUiThread {
                    servers.removeAll { it.name == name }
                    adapter.notifyDataSetChanged()
                    binding.noServersHint.isVisible = servers.isEmpty()
                    binding.serverList.isVisible = servers.isNotEmpty()
                }
            }
        }
        nsd.startDiscovery()

        udpDiscoveryListener = UdpDiscoveryListener(this)
        lifecycleScope.launch {
            udpDiscoveryListener.listen { server ->
                runOnUiThread { addServer(server) }
            }
        }

        lanScanner = LanScanner(this)
        lifecycleScope.launch {
            lanScanner.scan { server ->
                runOnUiThread { addServer(server) }
            }
        }
    }

    private fun addServer(server: FotifyServer) {
        val alreadyKnown = servers.any { it.host == server.host && it.port == server.port }
        if (alreadyKnown) return
        val wasEmpty = servers.isEmpty()
        servers.add(server)
        adapter.notifyDataSetChanged()
        binding.noServersHint.isVisible = false
        binding.serverList.isVisible = true
        if (wasEmpty) {
            binding.serverList.post {
                binding.serverList.requestFocus()
                binding.serverList.setSelection(0)
                binding.serverList.setItemChecked(0, true)
            }
        }
    }

    override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
        if (isConfirmKey(keyCode) && binding.serverList.hasFocus()) {
            connectSelectedServer()
            return true
        }
        return super.onKeyUp(keyCode, event)
    }

    // ── Navigation ────────────────────────────────────────────────────────

    private fun connectTo(server: FotifyServer) {
        val prefs = Prefs.get(this)
        prefs.serverUrl = server.url
        prefs.serverName = server.name
        openMainActivity()
    }

    private fun openMainActivity() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        if (::nsd.isInitialized) nsd.stopDiscovery()
        if (::udpDiscoveryListener.isInitialized) udpDiscoveryListener.stop()
        if (::lanScanner.isInitialized) lanScanner.stop()
    }

    // ── URL parsing helpers ───────────────────────────────────────────────

    private fun extractHost(url: String): String = try {
        url.removePrefix("http://").removePrefix("https://")
            .split("/").first()
            .split(":").first()
    } catch (_: Exception) { "" }

    private fun extractPort(url: String): Int = try {
        val noProto = url.removePrefix("http://").removePrefix("https://")
        val hostPort = noProto.split("/").first()
        if (":" in hostPort) {
            hostPort.substringAfterLast(":").toInt()
        } else {
            15766
        }
    } catch (_: Exception) { 15766 }

    // ── Adapter ───────────────────────────────────────────────────────────

    inner class ServerAdapter : BaseAdapter() {
        override fun getCount(): Int = servers.size
        override fun getItem(pos: Int): FotifyServer = servers[pos]
        override fun getItemId(pos: Int): Long = pos.toLong()

        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val view = convertView ?: LayoutInflater.from(parent.context)
                .inflate(R.layout.item_server, parent, false)
            val server = servers[position]
            view.findViewById<TextView>(R.id.serverName).text = server.name
            view.findViewById<TextView>(R.id.serverAddress).text =
                getString(R.string.server_address_format, server.host, server.port)
            view.setOnClickListener { connectTo(server) }
            return view
        }
    }
}
