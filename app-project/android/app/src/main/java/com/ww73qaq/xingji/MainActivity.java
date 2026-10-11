package com.ww73qaq.xingji;

import android.graphics.Color;
import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BatteryWhitelistPlugin.class);
        super.onCreate(savedInstanceState);
        // v3.18.4：状态栏不再悬浮在 WebView 上（WebView 从系统状态栏下方开始布局）。
        // 否则 env(safe-area-inset-top)≈状态栏高度被算进每个 .app-header 的 padding-top，
        // 所有二级页标题上方悬着一大截空白（用户反馈「顶部标题有空区域」）。
        // 状态栏/导航栏底色与页面米白一致，视觉无缝。
        try {
            WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
            getWindow().setStatusBarColor(Color.parseColor("#F7F2E7"));
            getWindow().setNavigationBarColor(Color.parseColor("#F7F2E7"));
        } catch (Exception e) {
            // 老系统降级：保持默认行为
        }
    }
}
