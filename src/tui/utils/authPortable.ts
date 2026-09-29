import { execa } from 'execa'
import { getMacOsKeychainStorageServiceName } from 'src/tui/utils/secureStorage/macOsKeychainHelpers.js'

export async function maybeRemoveApiKeyFromMacOSKeychainThrows(): Promise<void> {
  if (process.platform === 'darwin') {
    const storageServiceName = getMacOsKeychainStorageServiceName()
    // C2: 用数组参数 + 直接执行 security（不再走 shell），消除 $USER/服务名被 shell 解析的注入面
    const user = process.env.USER ?? ''
    const result = await execa(
      'security',
      ['delete-generic-password', '-a', user, '-s', storageServiceName],
      { reject: false },
    )
    if (result.exitCode !== 0) {
      throw new Error('Failed to delete keychain entry')
    }
  }
}

export function normalizeApiKeyForConfig(apiKey: string): string {
  return apiKey.slice(-20)
}
