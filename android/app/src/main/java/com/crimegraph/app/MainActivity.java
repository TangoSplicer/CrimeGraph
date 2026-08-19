package com.crimegraph.app;

import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // CrimeGraph handles protected local intelligence. Do not permit capture in
        // screenshots, screen recordings, or the task-switcher snapshot.
        getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE
        );

        // Capacitor uses a WebView for the local interface. Explicitly disable its
        // debugging endpoint for release packages even if a device enables global
        // WebView inspection.
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) == 0) {
            WebView.setWebContentsDebuggingEnabled(false);
        }

        registerPlugin(DeviceIdentityPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
