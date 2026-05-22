const fs = require('fs');
const path = './android/app/src/main/AndroidManifest.xml';

try {
  let xml = fs.readFileSync(path, 'utf8');

  const legacyPermissions = `
    <uses-permission android:name="android.permission.BLUETOOTH" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
`;

  if (!xml.includes('android.permission.BLUETOOTH"')) {
    xml = xml.replace('</manifest>', legacyPermissions + '</manifest>');
    fs.writeFileSync(path, xml);
    console.log('[SUCCESS] Baseline BLE permissions injected to prevent crashes.');
  } else {
    console.log('[INFO] Baseline BLE permissions already exist.');
  }
} catch (error) {
  console.error('[ERROR] Failed to patch manifest:', error);
}
