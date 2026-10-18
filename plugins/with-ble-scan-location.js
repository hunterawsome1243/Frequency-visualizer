// Config plugin: lets Android 12+ Bluetooth scans report every advertisement, including beacon-style
// ones such as Google Find Hub trackers.
//
// react-native-ble-plx's own library manifest declares BLUETOOTH_SCAN with
// android:usesPermissionFlags="neverForLocation". The manifest merger copies that attribute into the
// app's BLUETOOTH_SCAN element, even though app.json sets neverForLocation: false, and with that flag
// Android filters some beacons out of the scan results. tools:remove drops the library's attribute.
//
// It finds or creates the BLUETOOTH_SCAN element itself, because Expo runs a plugin listed later in
// app.json before the ones listed earlier; when this one creates the element, ble-plx sees it and
// does not add its own.
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const BLUETOOTH_SCAN = 'android.permission.BLUETOOTH_SCAN';

function withBleScanLocation(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = AndroidConfig.Manifest.ensureToolsAvailable(mod.modResults);
    const permissions = (manifest.manifest['uses-permission'] ??= []);
    let scan = permissions.find((item) => item.$['android:name'] === BLUETOOTH_SCAN);
    if (!scan) {
      scan = { $: { 'android:name': BLUETOOTH_SCAN, 'tools:targetApi': '31' } };
      permissions.push(scan);
    }
    delete scan.$['android:usesPermissionFlags'];
    scan.$['tools:remove'] = 'android:usesPermissionFlags';
    mod.modResults = manifest;
    return mod;
  });
}

module.exports = withBleScanLocation;
