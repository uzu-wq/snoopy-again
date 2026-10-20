
export const MODULE = `
const API = 'https://saavn.dev/api';

function toText(value) {
    return value == null ? '' : String(value);
}

function getImage(images) {
    if (!Array.isArray(images) || images.length === 0) return '';
    return toText(images[images.length - 1].url);
}

function normalizeTrack(song) {
    const artists = song.artists || {};
    const primaryArtists = Array.isArray(artists.primary)
        ? artists.primary.map(function (artist) {
            return {
                id: toText(artist.id),
                name: toText(artist.name)
            };
        })
        : [];

    return {
        id: toText(song.id),
        title: toText(song.name || song.title) || 'Unknown Track',
        artist: toText(song.primaryArtists) ||
            primaryArtists.map(function (artist) {
                return artist.name;
            }).join(', ') ||
            'Unknown Artist',
        album: toText(song.album && song.album.name),
        duration: Number(song.duration || 0),
        albumCover: getImage(song.image),
        cover: getImage(song.image),
        format: 'm4a',
        explicit: Boolean(song.explicitContent),
        url: toText(song.url),
        artists: { primary: primaryArtists },
        audioQuality: 'HIGH'
    };
}

async function request(path) {
    const response = await fetch(API + path);

    if (!response.ok) {
        throw new Error('JioSaavn API HTTP ' + response.status);
    }

    return response.json();
}

async function searchTracks(query, limit, ctx) {
    try {
        const search = toText(query).trim();

        if (!search) {
            return { tracks: [], total: 0 };
        }

        const count = Math.min(Math.max(Number(limit) || 20, 1), 50);
        const data = await request(
            '/search/songs?query=' + encodeURIComponent(search) +
            '&limit=' + count
        );

        const results = data.data && data.data.results;
        const tracks = Array.isArray(results)
            ? results.map(normalizeTrack)
            : [];

        return {
            tracks: tracks,
            total: tracks.length
        };
    } catch (error) {
        console.log('[snoopy-jiosaavn] searchTracks: ' + error.message);
        return { tracks: [], total: 0 };
    }
}

async function getTrackStreamUrl(id, quality, ctx) {
    const trackId = toText(
        id && typeof id === 'object' ? id.id : id
    );

    if (!trackId) {
        return { streamUrl: null, track: null };
    }

    try {
        const data = await request(
            '/songs/' + encodeURIComponent(trackId)
        );

        const songData = data.data;
        const song = Array.isArray(songData) ? songData[0] : songData;

        if (!song) {
            return {
                streamUrl: null,
                track: { id: trackId }
            };
        }

        const downloads = song.downloadUrl || song.downloadUrls || [];
        const selected = Array.isArray(downloads) && downloads.length
            ? downloads[downloads.length - 1]
            : null;

        return {
            streamUrl: selected && selected.url
                ? selected.url
                : null,
            streamType: 'direct',
            mimeType: 'audio/mp4',
            track: normalizeTrack(song)
        };
    } catch (error) {
        console.log('[snoopy-jiosaavn] getTrackStreamUrl: ' + error.message);
        return {
            streamUrl: null,
            track: { id: trackId }
        };
    }
}

async function getAlbum(id, ctx) {
    const albumId = toText(
        id && typeof id === 'object' ? id.id : id
    );

    if (!albumId) {
        return { album: null, tracks: [] };
    }

    try {
        const data = await request(
            '/albums?id=' + encodeURIComponent(albumId)
        );

        const result = data.data;

        if (!result) {
            return { album: null, tracks: [] };
        }

        const songs = Array.isArray(result.songs) ? result.songs : [];

        return {
            album: {
                id: toText(result.id),
                title: toText(result.name || result.title),
                artist: toText(result.primaryArtists),
                cover: getImage(result.image),
                trackCount: songs.length,
                url: toText(result.url)
            },
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
    version: '1.0.3',
    labels: ['JioSaavn', 'STREAMING'],
    noStreamCache: true,
    searchTracks: searchTracks,
    getTrackStreamUrl: getTrackStreamUrl,
    getTrackDownloadUrl: getTrackStreamUrl,
    getAlbum: getAlbum
};
`;
