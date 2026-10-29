import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';
import { API_URL, assetUrl } from './api';
import { assertPublicRoute } from './policy';

export async function openExternal(value: string) {
  const url = new URL(value);
  if (!['https:', 'mailto:'].includes(url.protocol))
    throw new Error('This link is not a supported secure address.');
  await Linking.openURL(url.toString());
}
export async function shareFile(uri: string, mimeType: string) {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: 'Offstage Creators' });
}
export async function saveFile(uri: string, name: string, mimeType: string) {
  const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!result.granted) return false;
  const destination = await FileSystem.StorageAccessFramework.createFileAsync(
    result.directoryUri,
    name,
    mimeType,
  );
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await FileSystem.writeAsStringAsync(destination, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return true;
}
export async function qrFile(data: string, id: string) {
  if (!data.startsWith('data:image/png;base64,'))
    throw new Error('The server has not issued a ticket image.');
  const uri = FileSystem.cacheDirectory + `ticket-${id.replace(/[^a-zA-Z0-9_-]/g, '')}.png`;
  await FileSystem.writeAsStringAsync(uri, data.split(',')[1]!, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
}
export async function galleryFile(path: string, id: number) {
  const url = assetUrl(path);
  if (!url) throw new Error('This photo is not available.');
  const uri = FileSystem.cacheDirectory + `offstage-photo-${id}.jpg`;
  if (url.startsWith('data:')) {
    await FileSystem.writeAsStringAsync(uri, url.split(',')[1]!, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return uri;
  }
  const response = await FileSystem.downloadAsync(url, uri);
  if (response.status !== 200) throw new Error('Photo download failed. Please try again.');
  return response.uri;
}
export async function certificateFile(id: string, eventId: string) {
  const path = `/api/certificate/download/${encodeURIComponent(id)}?eventId=${encodeURIComponent(eventId)}`;
  assertPublicRoute(path, 'GET');
  const uri = FileSystem.cacheDirectory + `certificate-${id.replace(/[^a-zA-Z0-9_-]/g, '')}.svg`;
  const response = await FileSystem.downloadAsync(API_URL + path, uri);
  if (response.status !== 200)
    throw new Error('The certificate is no longer available. Refresh and verify it again.');
  const content = await FileSystem.readAsStringAsync(uri);
  if (!content.includes('<svg')) throw new Error('The server did not return a certificate file.');
  return uri;
}
