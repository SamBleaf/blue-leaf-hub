import { getDropboxAccessToken, getTeamNamespaceId, sharedJobRootPath } from './server/lib/dropboxClient.mjs';

const token = await getDropboxAccessToken();
const namespaceId = await getTeamNamespaceId(token);
const testPath = sharedJobRootPath('TEST FOLDER DELETE ME');

console.log('Namespace ID:', namespaceId);
console.log('Creating folder at:', testPath);

const res = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
    'Dropbox-API-Path-Root': JSON.stringify({ ".tag": "namespace_id", "namespace_id": namespaceId })
  },
  body: JSON.stringify({ path: testPath, autorename: true })
});

const data = await res.json();
console.log('Result:', JSON.stringify(data, null, 2));