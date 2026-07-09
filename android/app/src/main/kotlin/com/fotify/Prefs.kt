package com.fotify

import android.content.Context
import android.content.SharedPreferences

/**
 * Simple SharedPreferences wrapper that persists the selected Fotify server URL.
 */
class Prefs private constructor(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("fotify_prefs", Context.MODE_PRIVATE)

    /** Base URL of the Fotify server, e.g. "http://192.168.1.100:15766" */
    var serverUrl: String?
        get() = prefs.getString(KEY_SERVER_URL, null)
        set(value) = prefs.edit().putString(KEY_SERVER_URL, value).apply()

    /** Human-readable server name (from mDNS or manual entry) */
    var serverName: String?
        get() = prefs.getString(KEY_SERVER_NAME, null)
        set(value) = prefs.edit().putString(KEY_SERVER_NAME, value).apply()

    fun clear() = prefs.edit().clear().apply()

    companion object {
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_SERVER_NAME = "server_name"

        @Volatile
        private var INSTANCE: Prefs? = null

        fun get(context: Context): Prefs =
            INSTANCE ?: synchronized(this) {
                INSTANCE ?: Prefs(context.applicationContext).also { INSTANCE = it }
            }
    }
}
