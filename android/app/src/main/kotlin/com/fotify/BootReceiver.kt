package com.fotify

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Starts Fotify automatically when the device boots.
 * If a server URL is already configured → go straight to the slideshow.
 * Otherwise → open the discovery screen.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        val bootActions = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON",
        )
        if (action !in bootActions) return

        val prefs = Prefs.get(context)
        val targetClass: Class<*> = if (prefs.serverUrl != null) {
            MainActivity::class.java
        } else {
            DiscoveryActivity::class.java
        }

        val i = Intent(context, targetClass).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        context.startActivity(i)
    }
}
