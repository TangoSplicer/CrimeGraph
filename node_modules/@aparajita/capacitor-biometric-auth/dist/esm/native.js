import { BiometricAuthBase } from './base';
import { BiometryErrorType, BiometryType } from './definitions';
/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/require-await */
// eslint-disable-next-line import/prefer-default-export
export class BiometricAuthNative extends BiometricAuthBase {
    constructor(capProxy) {
        super();
        /*
          In order to call native methods and maintain the ability to
          call pure Javascript methods as well, we have to bind the native methods
          to the proxy.
    
          capProxy is a proxy of an instance of this class, so it is safe
          to cast it to this class.
        */
        const proxy = capProxy;
        /* eslint-disable @typescript-eslint/unbound-method */
        this.checkBiometry = proxy.checkBiometry;
        this.internalAuthenticate = proxy.internalAuthenticate;
        /* eslint-enable @typescript-eslint/unbound-method */
    }
    // @native
    async checkBiometry() {
        // Never used, but we have to satisfy the compiler.
        return Promise.resolve({
            isAvailable: false,
            strongBiometryIsAvailable: false,
            biometryType: BiometryType.none,
            biometryTypes: [],
            deviceIsSecure: false,
            reason: '',
            code: BiometryErrorType.none,
            strongReason: '',
            strongCode: BiometryErrorType.none,
        });
    }
    // @native
    // On native platforms, this will present the native authentication UI.
    async internalAuthenticate(options) { }
    // Web only, used for simulating biometric authentication.
    async setBiometryType(type) {
        console.warn('setBiometryType() is web only');
    }
    // Web only, used for simulating biometry enrollment.
    async setBiometryIsEnrolled(enrolled) {
        console.warn('setBiometryEnrolled() is web only');
    }
    // Web only, used for simulating device security.
    async setDeviceIsSecure(isSecure) {
        console.warn('setDeviceIsSecure() is web only');
    }
}
