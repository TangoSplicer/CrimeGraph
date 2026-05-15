import { BiometricAuthBase } from './base';
import type { AuthenticateOptions, CheckBiometryResult } from './definitions';
import { BiometryType } from './definitions';
export declare class BiometricAuthWeb extends BiometricAuthBase {
    private biometryType;
    private biometryTypes;
    private biometryIsEnrolled;
    private deviceIsSecure;
    checkBiometry(): Promise<CheckBiometryResult>;
    private hasStrongBiometry;
    internalAuthenticate(options?: AuthenticateOptions): Promise<void>;
    setBiometryType(type: BiometryType | string | Array<BiometryType | string> | undefined): Promise<void>;
    setBiometryIsEnrolled(enrolled: boolean): Promise<void>;
    setDeviceIsSecure(isSecure: boolean): Promise<void>;
}
