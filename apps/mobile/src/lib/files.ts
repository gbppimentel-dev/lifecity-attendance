import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// Native Android share sheet lets the user choose Files, Drive, or another app.
// Files are private cache entries, not public member-data downloads.
export async function shareTextFile(filename: string, contents: string, mimeType = 'text/csv') {
  if (!(await Sharing.isAvailableAsync())) throw Error('File sharing is unavailable on this device.');
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const file = new File(Paths.cache, `${Date.now()}-${safe}`);
  file.create(); file.write(contents);
  // Android may read the file after its chooser returns. Leave it in the app's
  // private temporary cache for the OS to reclaim instead of invalidating its URI.
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: 'Share ' + safe });
}
