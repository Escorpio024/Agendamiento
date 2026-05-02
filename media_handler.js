const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

// Usar el binario de ffmpeg incluido en el paquete para evitar
// depender de una instalación global (necesario en Windows)
try {
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
    console.log(`[Media] ffmpeg path: ${ffmpegInstaller.path}`);
} catch (e) {
    console.warn('[Media] @ffmpeg-installer/ffmpeg no encontrado, usando ffmpeg del sistema.');
}

// Ensure media directory exists
const MEDIA_DIR = path.join(__dirname, 'public/media');
if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

/**
 * Saves media from a WhatsApp message and converts audio if necessary.
 * @param {import('whatsapp-web.js').Message} msg 
 * @returns {Promise<string|null>} - Relative Web path to the file
 */
async function saveMedia(msg) {
    if (!msg.hasMedia) return null;

    try {
        const media = await msg.downloadMedia();
        if (!media) return null;

        // Generate filename
        const timestamp = msg.timestamp * 1000;
        const id = msg.id.id; // unique part
        let filename = `${timestamp}_${id}`;

        // Determine extension
        let ext = media.mimetype.split('/')[1].split(';')[0];
        if (ext === 'plain') ext = 'txt';

        // If it's an audio (PTT or audio), it often comes as ogg or codecs=opus
        const isAudio = media.mimetype.includes('audio');

        if (isAudio) {
            // Save as OGG temporarily
            const oggPath = path.join(MEDIA_DIR, `${filename}.ogg`);
            const mp3Path = path.join(MEDIA_DIR, `${filename}.mp3`);

            fs.writeFileSync(oggPath, media.data, 'base64');

            // Convert to MP3
            await new Promise((resolve, reject) => {
                let command = ffmpeg(oggPath);
                try {
                    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
                    command.setFfmpegPath(ffmpegInstaller.path);
                } catch (e) {}
                
                command
                    .toFormat('mp3')
                    .on('error', (err) => reject(err))
                    .on('end', () => resolve())
                    .save(mp3Path);
            });

            return `/media/${filename}.mp3`;
        } else {
            // Image, Video, Document
            const filePath = path.join(MEDIA_DIR, `${filename}.${ext}`);
            fs.writeFileSync(filePath, media.data, 'base64');
            return `/media/${filename}.${ext}`;
        }

    } catch (error) {
        console.error('Error handling media:', error);
        return null;
    }
}

module.exports = {
    saveMedia
};
