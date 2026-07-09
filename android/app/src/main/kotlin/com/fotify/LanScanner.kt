package com.fotify

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
class LanScanner {

    companion object {
        private const val TAG = "LanScanner"
        private const val TIMEOUT_MS = 700

        // 15766 = default, 15776 = currently reported custom setup, 8080 = old nginx default.
        private val PORTS = intArrayOf(15766, 15776, 8080)
    }

    private var scanJob: Job? = null

    suspend fun scan(onServerFound: (FotifyServer) -> Unit) = withContext(Dispatchers.IO) {
        val localIp = getLocalIpv4Address() ?: run {
            Log.w(TAG, "No local IPv4 address found; LAN scan skipped")
            return@withContext
        }
        val prefix = localIp.substringBeforeLast('.')
        Log.d(TAG, "LAN scan started on $prefix.0/24")

        coroutineScope {
            scanJob = coroutineContext[Job]
            val semaphore = Semaphore(32)
            val tasks = (1..254).flatMap { hostPart ->
                PORTS.map { port ->
                    async {
                        if (!isActive) return@async
                        val host = "$prefix.$hostPart"
                        semaphore.acquire()
                        try {
                            if (isFotifyServer(host, port)) {
                                onServerFound(
                                    FotifyServer(
                                        name = "Fotify@$host:$port",
                                        host = host,
                                        port = port,
                                    )
                                )
                            }
                        } finally {
                            semaphore.release()
                        }
                    }
                }
            }
            tasks.awaitAll()
        }
        Log.d(TAG, "LAN scan finished")
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

    private fun getLocalIpv4Address(): String? {
        return NetworkInterface.getNetworkInterfaces().toList()
            .asSequence()
            .filter { !it.isLoopback && it.isUp }
            .flatMap { it.inetAddresses.toList().asSequence() }
            .map { it.hostAddress ?: "" }
            .firstOrNull { address ->
                address.count { it == '.' } == 3 &&
                    !address.startsWith("127.") &&
                    !address.startsWith("169.254.")
            }
    }
}
