
const API = 'https://saavn.dev/api';

async function request(path) {
  const response = await fetch(`${API}${path}`);

  if (!response.ok) {
    throw new Error(`JioSaavn API error: ${response.status}`);
  }

  return response.json();
}

function normalizeTrack(track) {
  const images = track.image || [];
  const image = images.length
    ? images[images.length - 1].url
    : null;

  return {
    id: String(track.id),
    title: track.name || track.title || 'Unknown Track',
    artist: track.primaryArtists || track.artist || 'Unknown Artist',
    artists: track.artists || {
      primary: [{ name: track.primaryArtists || 'Unknown Artist' }]
    },
    album: track.album?.name || '',
    duration: Number(track.duration || 0),
    artwork: image,
    thumbnail: image,
    url: track.url || '',
    source: 'snoopy-jiosaavn'
  };
}

async function snoopySearchTracks(query) {
  if (!query || !query.trim()) return [];

  const data = await request(
    `/search/songs?query=${encodeURIComponent(query.trim())}&limit=20`
  );

  const tracks = data.data?.results || [];

  return tracks.map(normalizeTrack);
}

async function snoopyGetTrackStreamUrl(track) {
  const id = typeof track === 'string' ? track : track?.id;

  if (!id) {
    throw new Error('A JioSaavn track ID is required.');
  }

  const data = await request(`/songs/${encodeURIComponent(id)}`);
  const song = Array.isArray(data.data)
    ? data.data[0]
    : data.data;

  if (!song) {
    throw new Error('Track not found on JioSaavn.');
  }

  const downloads = song.downloadUrl || song.downloadUrls || [];
  const stream = downloads.length
    ? downloads[downloads.length - 1].url
    : null;

  if (!stream) {
    throw new Error('No playable stream was returned for this track.');
  }

  return stream;
}

async function snoopyGetAlbum(album) {
  const id = typeof album === 'string' ? album : album?.id;

  if (!id) {
    throw new Error('A JioSaavn album ID is required.');
  }

  const data = await request(`/albums?id=${encodeURIComponent(id)}`);
  const result = data.data;

  if (!result) {
    throw new Error('Album not found on JioSaavn.');
  }

  return {
    id: String(result.id),
    title: result.name || result.title || 'Unknown Album',
    name: result.name || result.title || 'Unknown Album',
    artist: result.primaryArtists || '',
    artwork: result.image?.at(-1)?.url || null,
    tracks: (result.songs || []).map(normalizeTrack)
  };
}

return {
  id: 'snoopy-jiosaavn',
  name: 'Snoopy Shit',
  version: '1.0.2',
  labels: ['JioSaavn', 'MP4', 'STREAMING'],
  noStreamCache: true,
  searchTracks: snoopySearchTracks,
  getTrackStreamUrl: snoopyGetTrackStreamUrl,
  getTrackDownloadUrl: snoopyGetTrackStreamUrl,
  getAlbum: snoopyGetAlbum
};
