package com.crimegraph.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.PluginMethod;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.X509EncodedKeySpec;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "DeviceIdentity")
public class DeviceIdentityPlugin extends Plugin {
    private static final String IDENTITY_KEY_ALIAS = "crimegraph_device_identity_v1";
    private static final String STORAGE_WRAP_KEY_ALIAS = "crimegraph_storage_wrap_v1";
    private static final String STORAGE_PREFERENCES = "crimegraph_storage_secret";
    private static final String WRAPPED_SECRET = "wrapped_secret";
    private static final String WRAPPED_SECRET_IV = "wrapped_secret_iv";
    private static final String SIGNATURE_ALGORITHM = "SHA256withECDSA";
    private static final String STORAGE_CIPHER = "AES/GCM/NoPadding";

    private KeyPair getOrCreateKeyPair() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(IDENTITY_KEY_ALIAS)) {
            PrivateKey privateKey = (PrivateKey) keyStore.getKey(IDENTITY_KEY_ALIAS, null);
            PublicKey publicKey = keyStore.getCertificate(IDENTITY_KEY_ALIAS).getPublicKey();
            return new KeyPair(publicKey, privateKey);
        }

        KeyPairGenerator generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore");
        KeyGenParameterSpec specification = new KeyGenParameterSpec.Builder(
                IDENTITY_KEY_ALIAS,
                KeyProperties.PURPOSE_SIGN | KeyProperties.PURPOSE_VERIFY
        )
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                .build();
        generator.initialize(specification);
        return generator.generateKeyPair();
    }

    private SecretKey getOrCreateStorageWrapKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(STORAGE_WRAP_KEY_ALIAS)) {
            return (SecretKey) keyStore.getKey(STORAGE_WRAP_KEY_ALIAS, null);
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        KeyGenParameterSpec specification = new KeyGenParameterSpec.Builder(
                STORAGE_WRAP_KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build();
        generator.init(specification);
        return generator.generateKey();
    }

    private SharedPreferences storagePreferences() {
        return getContext().getSharedPreferences(STORAGE_PREFERENCES, Context.MODE_PRIVATE);
    }

    private byte[] getOrCreateStorageSecret() throws Exception {
        SharedPreferences preferences = storagePreferences();
        String wrapped = preferences.getString(WRAPPED_SECRET, null);
        String iv = preferences.getString(WRAPPED_SECRET_IV, null);
        SecretKey wrapKey = getOrCreateStorageWrapKey();

        if (wrapped != null && iv != null) {
            Cipher cipher = Cipher.getInstance(STORAGE_CIPHER);
            cipher.init(Cipher.DECRYPT_MODE, wrapKey, new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            return cipher.doFinal(Base64.decode(wrapped, Base64.NO_WRAP));
        }

        byte[] secret = new byte[32];
        new SecureRandom().nextBytes(secret);
        Cipher cipher = Cipher.getInstance(STORAGE_CIPHER);
        cipher.init(Cipher.ENCRYPT_MODE, wrapKey);
        byte[] ciphertext = cipher.doFinal(secret);
        preferences.edit()
                .putString(WRAPPED_SECRET, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                .putString(WRAPPED_SECRET_IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .commit();
        return secret;
    }

    private void destroyStorageSecret() throws Exception {
        storagePreferences().edit().clear().commit();
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(STORAGE_WRAP_KEY_ALIAS)) keyStore.deleteEntry(STORAGE_WRAP_KEY_ALIAS);
    }

    private String fingerprint(byte[] value) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(value);
        StringBuilder output = new StringBuilder();
        for (byte item : digest) output.append(String.format("%02X", item));
        return output.toString();
    }

    @PluginMethod
    public void getPublicIdentity(PluginCall call) {
        try {
            KeyPair keyPair = getOrCreateKeyPair();
            byte[] encoded = keyPair.getPublic().getEncoded();
            String fingerprint = fingerprint(encoded);
            JSObject result = new JSObject();
            result.put("deviceId", "cg-" + fingerprint.substring(0, 24).toLowerCase());
            result.put("publicKey", Base64.encodeToString(encoded, Base64.NO_WRAP));
            result.put("fingerprint", fingerprint);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to establish a device-bound identity.", error);
        }
    }

    @PluginMethod
    public void getStorageSecret(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("secret", Base64.encodeToString(getOrCreateStorageSecret(), Base64.NO_WRAP));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to access the device-bound storage secret.", error);
        }
    }

    @PluginMethod
    public void destroyStorageSecret(PluginCall call) {
        try {
            destroyStorageSecret();
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to destroy the device-bound storage secret.", error);
        }
    }

    @PluginMethod
    public void sign(PluginCall call) {
        String payload = call.getString("payload");
        if (payload == null || payload.isEmpty()) {
            call.reject("A pairing payload is required.");
            return;
        }
        try {
            Signature signer = Signature.getInstance(SIGNATURE_ALGORITHM);
            signer.initSign(getOrCreateKeyPair().getPrivate());
            signer.update(payload.getBytes(StandardCharsets.UTF_8));
            JSObject result = new JSObject();
            result.put("signature", Base64.encodeToString(signer.sign(), Base64.NO_WRAP));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to sign the pairing payload.", error);
        }
    }

    @PluginMethod
    public void verify(PluginCall call) {
        String publicKey = call.getString("publicKey");
        String payload = call.getString("payload");
        String signature = call.getString("signature");
        if (publicKey == null || payload == null || signature == null) {
            call.reject("Public key, pairing payload, and signature are required.");
            return;
        }
        try {
            byte[] encodedPublicKey = Base64.decode(publicKey, Base64.DEFAULT);
            PublicKey trustedKey = KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(encodedPublicKey));
            Signature verifier = Signature.getInstance(SIGNATURE_ALGORITHM);
            verifier.initVerify(trustedKey);
            verifier.update(payload.getBytes(StandardCharsets.UTF_8));
            JSObject result = new JSObject();
            result.put("verified", verifier.verify(Base64.decode(signature, Base64.DEFAULT)));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to verify the pairing signature.", error);
        }
    }
}
