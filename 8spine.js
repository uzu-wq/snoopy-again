
const BASE = 'https://saavn.dev/api';
const SEARCH_CACHE_MS = 60 * 1000;
const STREAM_CACHE_MS = 5 * 60 * 1000;

const searchCache = {};
const streamCache = {};
const trackCache = {};

function toStr(value) {
    return value == null ? '' : String(value);
}

function getId(value) {
    if (value && typeof value === 'object') {
        return toStr(value.id || value.trackId || value.songId);
    }
    return toStr(value);
}

function getImage(images) {
    if (typeof images === 'string') return images;
    if (!Array.isArray(images) || !images.length) return '';

    const preferred = images.find(function (image) {
        return image && (
            image.quality === '500x500' ||
            image.quality === 'high' ||
            image.quality === '320x320'
        );
    });

    return toStr((preferred || images[images.length - 1]).url);
}

function getArtistNames(song) {
    if (song.primaryArtists) return toStr(song.primaryArtists);

    const artists = song.artists || {};
    const primary = Array.isArray(artists.primary)
        ? artists.primary
        : [];

    return primary.map(function (artist) {
        return toStr(artist.name);
    }).filter(Boolean).join(', ') || 'Unknown Artist';
}

function normalizeTrack(song) {
    const album = song.album;
    const albumName = album && typeof album === 'object'
        ? album.name
        : album;

    const track = {
        id: toStr(song.id || song.songId),
        title: toStr(song.name || song.title) || 'Unknown Track',
        artist: getArtistNames(song),
        album: toStr(albumName),
        duration: Number(song.duration || 0),
        albumCover: getImage(song.image || song.images),
        format: 'm4a',
        explicit: Boolean(song.explicitContent),
        audioQuality: 'HIGH',
        url: toStr(song.url),
        language: toStr(song.language)
    };

    if (track.id) trackCache[track.id] = track;
    return track;
}

async function request(path) {
    const response = await fetch(BASE + path);

    if (!response.ok) {
        throw new Error('JioSaavn API HTTP ' + response.status);
    }

    const body = await response.text();

    let data;
    try {
        data = JSON.parse(body);
    } catch (error) {
        throw new Error('JioSaavn API returned invalid JSON');
    }

    return data;
}

function getPayload(data) {
    return data && data.data !== undefined ? data.data : data;
}

async function searchTracks(query, limit, ctx) {
    try {
        const term = toStr(query).trim();
        if (!term) return { tracks: [], total: 0 };

        const count = Math.min(
            Math.max(parseInt(limit, 10) || 25, 1),
            50
        );

        const key = term.toLowerCase() + '|' + count;
        const cached = searchCache[key];

        if (cached && Date.now() - cached.time < SEARCH_CACHE_MS) {
            return cached.value;
        }

        const data = await request(
            '/search/songs?query=' + encodeURIComponent(term) +
            '&limit=' + count
        );

        const payload = getPayload(data);
        const results = payload && Array.isArray(payload.results)
            ? payload.results
            : [];

        const tracks = results
            .filter(function (song) {
                return song && (song.id || song.songId);
            })
            .map(normalizeTrack);

        const value = { tracks: tracks, total: tracks.length };
        searchCache[key] = { value: value, time: Date.now() };

        return value;
    } catch (error) {
        console.log('[snoopy-jiosaavn] searchTracks: ' + error.message);
        return { tracks: [], total: 0 };
    }
}

async function searchAlbums(query, limit, ctx) {
    try {
        const term = toStr(query).trim();
        if (!term) return { albums: [], total: 0 };

        const count = Math.min(
            Math.max(parseInt(limit, 10) || 25, 1),
            50
        );

        const data = await request(
            '/search/albums?query=' + encodeURIComponent(term) +
            '&limit=' + count
        );

        const payload = getPayload(data);
        const results = payload && Array.isArray(payload.results)
            ? payload.results
            : [];

        const albums = results.map(function (item) {
            return {
                id: toStr(item.id),
                title: toStr(item.name || item.title) || 'Unknown Album',
                artist: toStr(item.primaryArtists || item.artist),
                cover: getImage(item.image),
                url: toStr(item.url),
                trackCount: Number(item.songCount || item.trackCount || 0)
            };
        });

        return { albums: albums, total: albums.length };
    } catch (error) {
        console.log('[snoopy-jiosaavn] searchAlbums: ' + error.message);
        return { albums: [], total: 0 };
    }
}

async function getTrackStreamUrl(id, quality, ctx) {
    const trackId = getId(id);

    if (!trackId) {
        return { streamUrl: null, track: null };
    }

    const cached = streamCache[trackId];

    if (cached && Date.now() - cached.time < STREAM_CACHE_MS) {
        return cached.value;
    }

    try {
        const data = await request(
            '/songs/' + encodeURIComponent(trackId)
        );

        const payload = getPayload(data);
        const song = Array.isArray(payload)
            ? payload[0]
            : payload && Array.isArray(payload.songs)
                ? payload.songs[0]
                : payload;

        if (!song) {
            return {
                streamUrl: null,
                track: trackCache[trackId] || { id: trackId }
            };
        }

        const downloads = song.downloadUrl || song.downloadUrls || [];
        const candidates = Array.isArray(downloads) ? downloads : [];

        const playable = candidates.filter(function (item) {
            return item && typeof item.url === 'string' &&
                /^https?:\/\//i.test(item.url);
        });

        const selected = playable.length
            ? playable[playable.length - 1]
            : null;

        if (!selected) {
            return {
                streamUrl: null,
                track: normalizeTrack(song)
            };
        }

        const result = {
            streamUrl: selected.url,
            streamType: 'direct',
            mimeType: 'audio/mp4',
            track: normalizeTrack(song)
        };

        streamCache[trackId] = {
            value: result,
            time: Date.now()
        };

        return result;
    } catch (error) {
        console.log('[snoopy-jiosaavn] getTrackStreamUrl: ' + error.message);

        return {
            streamUrl: null,
            track: trackCache[trackId] || { id: trackId }
        };
    }
}

async function getAlbum(id, ctx) {
    const albumId = getId(id);

    if (!albumId) return { album: null, tracks: [] };

    try {
        const data = await request(
            '/albums/' + encodeURIComponent(albumId)
        );

        const payload = getPayload(data);
        const albumData = Array.isArray(payload)
            ? payload[0]
            : payload;

        if (!albumData) return { album: null, tracks: [] };

        const songs = Array.isArray(albumData.songs)
            ? albumData.songs
            : [];

        const album = {
            id: toStr(albumData.id || albumId),
            title: toStr(albumData.name || albumData.title) || 'Unknown Album',
            artist: toStr(albumData.primaryArtists),
            cover: getImage(albumData.image),
            url: toStr(albumData.url),
            trackCount: songs.length
        };

        return {
            album: album,
            tracks: songs.map(normalizeTrack)
        };
    } catch (error) {
        console.log('[snoopy-jiosaavn] getAlbum: ' + error.message);
        return { album: null, tracks: [] };
    }
}

return {
    id: 'snoopy-jiosaavn',
    name: 'Snoopy Shit',
    version: '1.0.4',
    labels: ['JioSaavn', 'STREAMING'],
    noStreamCache: true,
    searchTracks: searchTracks,
    searchAlbums: searchAlbums,
    getTrackStreamUrl: getTrackStreamUrl,
    getTrackDownloadUrl: getTrackStreamUrl,
    getAlbum: getAlbum
};
