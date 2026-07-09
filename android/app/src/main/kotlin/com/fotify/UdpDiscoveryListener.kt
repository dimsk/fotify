package com.fotify

import android.content.Context
import android.net.wifi.WifiManager
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.MulticastSocket
import java.net.NetworkInterface
import java.net.SocketTimeoutException
import kotlin.coroutines.coroutineContext

/**
 * Receives Fotify's custom UDP discovery beacons.
 *
 * This is intentionally simpler and more robust than mDNS on FireTV:
 * the backend periodically sends a small UDP packet, the app listens on a
 * fixed port and uses the packet sender IP as the server address.
 */
class UdpDiscoveryListener(context: Context) {

    companion object {
        private const val TAG = "UdpDiscovery"
        private const val DISCOVERY_PORT = 15767
        private const val MULTICAST_ADDRESS = "239.255.157.66"
        private const val QUERY = "fotify-discovery-query"
    }

    private val appContext = context.applicationContext
    private val wifiManager =
        appContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager

    private var socket: MulticastSocket? = null
    private var job: Job? = null
    private var multicastLock: WifiManager.MulticastLock? = null

    suspend fun listen(onServerFound: (FotifyServer) -> Unit) = withContext(Dispatchers.IO) {
        acquireMulticastLock()

        val multicastAddress = InetAddress.getByName(MULTICAST_ADDRESS)
        val buffer = ByteArray(2048)

        try {
            socket = MulticastSocket(null).apply {
                reuseAddress = true
                broadcast = true
                soTimeout = 2000
                bind(InetSocketAddress(DISCOVERY_PORT))
                @Suppress("DEPRECATION")
                joinGroup(multicastAddress)
            }
            job = coroutineContext[Job]
            Log.d(TAG, "Listening for UDP discovery beacons on $DISCOVERY_PORT")
            var lastQueryAt = 0L

            while (isActive) {
                val now = System.currentTimeMillis()
                if (now - lastQueryAt >= 2_000) {
                    sendQuery()
                    lastQueryAt = now
                }
                try {
                    val packet = DatagramPacket(buffer, buffer.size)
                    socket?.receive(packet)
                    val body = String(packet.data, packet.offset, packet.length, Charsets.UTF_8)
                    val server = parseBeacon(body, packet.address.hostAddress ?: "")
                    if (server != null) onServerFound(server)
                } catch (_: SocketTimeoutException) {
                    // Normal: loop again so coroutine cancellation is observed.
                } catch (e: Exception) {
                    if (isActive) Log.w(TAG, "UDP receive error: ${e.message}")
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "UDP discovery listener failed: ${e.message}")
        } finally {
            stop()
        }
    }

    fun stop() {
        job?.cancel()
        job = null
        try {
            socket?.close()
        } catch (_: Exception) {
            // ignore
        }
        socket = null
        releaseMulticastLock()
    }

    private fun parseBeacon(body: String, senderHost: String): FotifyServer? {
        return try {
            val json = JSONObject(body)
            if (json.optString("type") != "fotify-discovery") return null

            val port = json.optInt("frontendPort", 0)
            if (senderHost.isEmpty() || port <= 0) return null

            FotifyServer(
                name = json.optString("name", "Fotify@$senderHost:$port"),
                host = senderHost,
                port = port,
            )
        } catch (_: Exception) {
            null
        }
    }

    private fun sendQuery() {
        val payload = QUERY.toByteArray(Charsets.UTF_8)
        for (target in discoveryTargets()) {
            try {
                val packet = DatagramPacket(
                    payload,
                    payload.size,
                    InetAddress.getByName(target),
                    DISCOVERY_PORT,
                )
                socket?.send(packet)
                Log.d(TAG, "Sent UDP discovery query to $target:$DISCOVERY_PORT")
            } catch (e: Exception) {
                Log.w(TAG, "Could not send UDP discovery query to $target: ${e.message}")
            }
        }
    }

    private fun discoveryTargets(): Set<String> {
        val targets = linkedSetOf("255.255.255.255", MULTICAST_ADDRESS)
        getWifiIpv4Address()?.let { localIp ->
            targets.add(localIp.substringBeforeLast('.') + ".255")
        }
        getLocalIpv4Address()?.let { localIp ->
            targets.add(localIp.substringBeforeLast('.') + ".255")
        }
        return targets
    }

    private fun getWifiIpv4Address(): String? {
        @Suppress("DEPRECATION")
        val raw = wifiManager?.connectionInfo?.ipAddress ?: return null
        if (raw == 0) return null
        return listOf(
            raw and 0xff,
            raw shr 8 and 0xff,
            raw shr 16 and 0xff,
            raw shr 24 and 0xff,
        ).joinToString(".")
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

    private fun acquireMulticastLock() {
        if (multicastLock?.isHeld == true) return
        multicastLock = wifiManager?.createMulticastLock("fotify-udp-discovery")?.apply {
            setReferenceCounted(false)
            acquire()
        }
        Log.d(TAG, "Multicast lock acquired: ${multicastLock?.isHeld == true}")
    }

    private fun releaseMulticastLock() {
        try {
            multicastLock?.takeIf { it.isHeld }?.release()
        } catch (e: Exception) {
            Log.w(TAG, "Error releasing multicast lock: ${e.message}")
        }
        multicastLock = null
    }
}
