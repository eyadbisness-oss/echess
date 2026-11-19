import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';

let nativeInitialized = false;

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function initializeNativeAndroidShell(): Promise<void> {
  if (nativeInitialized || !Capacitor.isNativePlatform()) return;
  nativeInitialized = true;

  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#0B0E11' });
  } catch {
    // ignore on platforms without StatusBar support
  }

  try {
    await SplashScreen.hide();
  } catch {
    // ignore
  }
}

export type ChessHapticType = 'light' | 'medium' | 'heavy' | 'success' | 'error';

export function triggerChessHaptic(kind: ChessHapticType): void {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (kind === 'success') {
      void Haptics.notification({ type: NotificationType.Success });
    } else if (kind === 'error') {
      void Haptics.notification({ type: NotificationType.Error });
    } else if (kind === 'heavy') {
      void Haptics.impact({ style: ImpactStyle.Heavy });
    } else if (kind === 'medium') {
      void Haptics.impact({ style: ImpactStyle.Medium });
    } else {
      void Haptics.impact({ style: ImpactStyle.Light });
    }
  } catch {
    // ignore haptic errors on unsupported devices
  }
}
