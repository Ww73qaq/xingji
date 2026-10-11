package com.ww73qaq.xingji;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(BatteryWhitelistPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
