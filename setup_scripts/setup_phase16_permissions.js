const fs = require('fs');
const path = './android/app/src/main/AndroidManifest.xml';

try {
  let xml = fs.readFileSync(path, 'utf8');

  const blePermissions = `
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
`;

  if (!xml.includes('BLUETOOTH_SCAN')) {
    // Inject right before the closing manifest tag
    xml = xml.replace('</manifest>', blePermissions + '</manifest>');
    fs.writeFileSync(path, xml);
    console.log('[SUCCESS] AndroidManifest.xml patched with BLE permissions.');
  } else {
    console.log('[INFO] BLE permissions already exist in AndroidManifest.xml.');
  }
} catch (error) {
  console.error('[ERROR] Failed to patch manifest:', error);
}
