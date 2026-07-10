package com.fotify

import android.content.Context
import android.net.wifi.WifiManager
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.NetworkInterface
import java.net.URL
import java.util.concurrent.Semaphore
import kotlin.coroutines.coroutineContext

/**
 * HTTP fallback discovery for devices where mDNS is unreliable or blocked.
 *
 * FireTV devices often sit behind WiFi multicast filtering. If NSD/mDNS does
 * not return anything, this scanner probes the local /24 subnet for Fotify's
 * `/settings` endpoint on common ports.
 */
class LanScanner(context: Context) {

    companion object {
        private const val TAG = "LanScanner"
        private const val TIMEOUT_MS = 450

        // 15766 = default, 15776 = currently reported custom setup, 8080 = old nginx default.
        private val PORTS = intArrayOf(15766, 15776, 8080)

        // Emulator / FireTV discovery cannot rely on the device subnet only:
        // Android Emulator lives in 10.0.2.0/24 while the real LAN is often
        // 192.168.x.0/24. Common/default networks are scanned first, then the
        // full 192.168.*.* private range is scanned as a low-priority fallback.
        private val COMMON_PREFIXES = listOf(
            "192.168.0",
            "192.168.1",
            "192.168.2",
            "192.168.178",
            "10.0.0",
            "10.0.1",
        )

        private val FULL_192_168_PREFIXES = (0..255).map { "192.168.$it" }
    }

    private val appContext = context.applicationContext
    private val wifiManager =
        appContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
    private var scanJob: Job? = null

    suspend fun scan(
        onStatus: (String) -> Unit,
        onServerFound: (FotifyServer) -> Unit,
    ) = withContext(Dispatchers.IO) {
        val prefixes = getCandidatePrefixes()
        if (prefixes.isEmpty()) {
            Log.w(TAG, "No local IPv4 subnet found; LAN scan skipped")
            onStatus("HTTP scan skipped: no local IPv4")
            return@withContext
        }
        Log.d(TAG, "LAN scan started on ${prefixes.joinToString { "$it.0/24" }}")
        onStatus("HTTP scan: ${prefixes.size} ranges")

        coroutineScope {
            scanJob = coroutineContext[Job]
            val semaphore = Semaphore(96)

            // Do not spawn thousands of coroutines at once; older FireTV devices
            // and emulators can become unresponsive. Chunking keeps discovery fast
            // while preserving UI responsiveness.
            for (prefix in prefixes) {
                if (!isActive) break
                onStatus("HTTP scan: $prefix.0/24")
                val candidates = (1..254).flatMap { hostPart ->
                    PORTS.map { port -> "$prefix.$hostPart" to port }
                }
                for (chunk in candidates.chunked(192)) {
                    if (!isActive) break
                    chunk.map { (host, port) ->
                        async {
                            semaphore.acquire()
                            try {
                                if (isActive && isFotifyServer(host, port)) {
                                    onServerFound(
                                        FotifyServer(
                                            name = "Fotify@$host:$port",
                                            host = host,
                                            port = port,
                                            method = "HTTP scan",
                                        )
                                    )
                                }
                            } finally {
                                semaphore.release()
                            }
                        }
                    }.awaitAll()
                }
            }
        }
        Log.d(TAG, "LAN scan finished")
        onStatus("HTTP scan finished")
    }

    fun stop() {
        scanJob?.cancel()
        scanJob = null
    }

    private fun isFotifyServer(host: String, port: Int): Boolean {
        val url = "http://$host:$port/settings"
        return try {
            val conn = URL(url).openConnection() as HttpURLConnection
            conn.connectTimeout = TIMEOUT_MS
            conn.readTimeout = TIMEOUT_MS
            conn.requestMethod = "GET"
            conn.connect()
            if (conn.responseCode != 200) return false

            val body = BufferedReader(InputStreamReader(conn.inputStream)).use { it.readText() }
            // Fotify settings endpoint is JSON and contains known settings keys.
            body.trimStart().startsWith("{") &&
                (body.contains("\"language\"") || body.contains("\"imageDurationMs\""))
        } catch (_: Exception) {
            false
        }
    }

    private fun getCandidatePrefixes(): Set<String> {
        val prefixes = linkedSetOf<String>()

        // Scan common home LANs first. This is important for Android Emulator,
        // where the device subnet is 10.0.2.0/24 but the real server is usually
        // in the host LAN (for example 192.168.0.0/24).
        COMMON_PREFIXES.forEach { prefixes.add(it) }

        getWifiIpv4Address()?.let { prefixes.add(it.substringBeforeLast('.')) }

        NetworkInterface.getNetworkInterfaces().toList()
            .asSequence()
            .filter { !it.isLoopback && it.isUp }
            .flatMap { it.inetAddresses.toList().asSequence() }
            .map { it.hostAddress ?: "" }
            .filter { address ->
                address.count { it == '.' } == 3 &&
                    !address.startsWith("127.") &&
                    !address.startsWith("169.254.")
            }
            .map { it.substringBeforeLast('.') }
            .forEach { prefixes.add(it) }

        FULL_192_168_PREFIXES.forEach { prefixes.add(it) }

        return prefixes
    }

    private fun getWifiIpv4Address(): String? {
        @Suppress("DEPRECATION")
        val raw = wifiManager?.connectionInfo?.ipAddress ?: return null
        if (raw == 0) return null

        // WifiInfo.ipAddress is little-endian on Android.
        return listOf(
            raw and 0xff,
            raw shr 8 and 0xff,
            raw shr 16 and 0xff,
            raw shr 24 and 0xff,
        ).joinToString(".")
    }
}
