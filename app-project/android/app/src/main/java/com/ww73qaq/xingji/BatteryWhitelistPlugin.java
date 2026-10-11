package com.ww73qaq.xingji;

import android.content.Intent;
import android.net.Uri;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/* v3.18.0：电池优化白名单（保活前提）
   isIgnoring → 查询当前是否已豁免；request → 弹系统授权框；openList → 跳系统白名单列表页 */
@CapacitorPlugin(name = "BatteryWhitelist")
public class BatteryWhitelistPlugin extends Plugin {

    private PowerManager pm() {
        return (PowerManager) getBridge().getContext().getSystemService(android.content.Context.POWER_SERVICE);
    }

    @PluginMethod
    public void isIgnoring(PluginCall call) {
        JSObject r = new JSObject();
        r.put("value", pm().isIgnoringBatteryOptimizations(getBridge().getContext().getPackageName()));
        call.resolve(r);
    }

    @PluginMethod
    public void request(PluginCall call) {
        try {
            String pkg = getBridge().getContext().getPackageName();
            if (!pm().isIgnoringBatteryOptimizations(pkg)) {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                        Uri.parse("package:" + pkg));
                getBridge().getActivity().startActivity(i);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void openList(PluginCall call) {
        try {
            getBridge().getActivity().startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }
}
