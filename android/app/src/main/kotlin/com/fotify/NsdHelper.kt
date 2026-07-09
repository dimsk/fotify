package com.fotify

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.util.Log
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicBoolean

/** Represents a discovered Fotify server on the local network. */
data class FotifyServer(
    val name: String,
    val host: String,
    val port: Int,
) {
    /** Full base URL that the Android WebView can load. */
    val url: String get() = "http://$host:$port"
}

/**
 * Thin wrapper around Android's [NsdManager] that discovers Fotify servers
 * advertising themselves as `_fotify._tcp` via mDNS.
 *
 * Resolves services sequentially to avoid the "FAILURE_ALREADY_ACTIVE"
 * error that occurs when [NsdManager.resolveService] is called concurrently.
 */
class NsdHelper(context: Context) {

    companion object {
        private const val TAG = "NsdHelper"
        // Android's older NSD implementations (including some FireOS versions)
        // are stricter and expect the trailing dot.
        private const val SERVICE_TYPE = "_fotify._tcp."
    }

    private val appContext = context.applicationContext
    private val nsdManager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
    private val wifiManager =
        appContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
    private var discoveryListener: NsdManager.DiscoveryListener? = null
    private var multicastLock: WifiManager.MulticastLock? = null

    /** Queue of services waiting to be resolved (serial processing). */
    private val pendingResolves = ConcurrentLinkedQueue<NsdServiceInfo>()
    private val isResolving = AtomicBoolean(false)

    /** Called on the calling thread when a new server has been fully resolved. */
    var onServerFound: ((FotifyServer) -> Unit)? = null

    /** Called when a previously found service disappears. */
    var onServerLost: ((String) -> Unit)? = null

    // ── Public API ────────────────────────────────────────────────────────

    fun startDiscovery() {
        if (discoveryListener != null) return          // already running
        discoveryListener = buildDiscoveryListener()
        try {
            acquireMulticastLock()
            nsdManager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discoveryListener)
            Log.d(TAG, "NSD discovery started for $SERVICE_TYPE")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start NSD discovery: ${e.message}")
            discoveryListener = null
            releaseMulticastLock()
        }
    }

    fun stopDiscovery() {
        discoveryListener?.let { listener ->
            try {
                nsdManager.stopServiceDiscovery(listener)
            } catch (e: Exception) {
                Log.w(TAG, "Error stopping NSD discovery: ${e.message}")
            }
        }
        discoveryListener = null
        pendingResolves.clear()
        releaseMulticastLock()
    }

    // ── Private helpers ───────────────────────────────────────────────────

    private fun buildDiscoveryListener() = object : NsdManager.DiscoveryListener {
        override fun onDiscoveryStarted(serviceType: String) {
            Log.d(TAG, "Discovery started: $serviceType")
        }

        override fun onServiceFound(service: NsdServiceInfo) {
            Log.d(TAG, "Service found: ${service.serviceName}")
            pendingResolves.add(service)
            drainResolveQueue()
        }

        override fun onServiceLost(service: NsdServiceInfo) {
            Log.d(TAG, "Service lost: ${service.serviceName}")
            onServerLost?.invoke(service.serviceName)
        }

        override fun onDiscoveryStopped(serviceType: String) {
            Log.d(TAG, "Discovery stopped")
        }

        override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
            Log.e(TAG, "Discovery start failed ($serviceType): error $errorCode")
        }

        override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
            Log.w(TAG, "Discovery stop failed: error $errorCode")
        }
    }

    /** Process the pending resolve queue one service at a time. */
    private fun drainResolveQueue() {
        if (!isResolving.compareAndSet(false, true)) return  // already resolving
        val next = pendingResolves.poll() ?: run {
            isResolving.set(false)
            return
        }
        resolve(next)
    }

    private fun resolve(service: NsdServiceInfo) {
        nsdManager.resolveService(service, object : NsdManager.ResolveListener {
            override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                Log.w(TAG, "Resolve failed for ${serviceInfo.serviceName}: error $errorCode")
                isResolving.set(false)
                drainResolveQueue()
            }

            override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                val host = serviceInfo.host?.hostAddress ?: ""
                val port = serviceInfo.port
                Log.d(TAG, "Resolved: ${serviceInfo.serviceName} → $host:$port")

                if (host.isNotEmpty() && port > 0) {
                    onServerFound?.invoke(
                        FotifyServer(
                            name = serviceInfo.serviceName,
                            host = host,
                            port = port,
                        )
                    )
                }
                isResolving.set(false)
                drainResolveQueue()
            }
        })
    }

    private fun acquireMulticastLock() {
        if (multicastLock?.isHeld == true) return
        multicastLock = wifiManager?.createMulticastLock("fotify-mdns")?.apply {
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
