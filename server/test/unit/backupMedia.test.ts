/**
 * @file Архив backup-media.sh: байты каталога, ссылка на каталог и границы пути.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const scriptPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../scripts/backup-media.sh',
);

/**
 * Запускает скрипт бэкапа. Пути передаются окружением, не оболочкой.
 * @param env MEDIA_DIR, MEDIA_BACKUP_DIR и при необходимости RETAIN
 * @returns Код, stdout и stderr
 */
const runBackup = (env: Record<string, string>) => spawnSync('bash', [scriptPath], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
});

/**
 * @param archive Путь к tar.gz
 * @returns Имена членов архива
 */
const memberNames = (archive: string): string[] => {
    const listed = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' });
    expect(listed.status).toBe(0);
    return listed.stdout.split('\n').filter((name) => name.length > 0);
};

/**
 * @param stdout Строка «Media backup written to …»
 * @returns Путь архива
 */
const archivePathFrom = (stdout: string): string => {
    const line = stdout.trim().split('\n').at(-1) ?? '';
    expect(line.startsWith('Media backup written to ')).toBe(true);
    return line.slice('Media backup written to '.length);
};

describe('backup-media.sh', () => {
    it('archives a real directory under its leaf name and restores the bytes', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuleneva-backup-media-'));
        try {
            const media = path.join(root, 'media');
            const backup = path.join(root, 'backups');
            const sibling = path.join(root, 'not-media.txt');
            const audio = path.join(media, 'music', 'aaaaaaaaaaaaaaaaaaaaaaaa', 'audio.mp3');
            const sidecar = `${audio}.type`;
            const spaced = path.join(media, 'music', 'my track.mp3');
            const unicode = path.join(media, 'music', 'обложка.png');
            fs.mkdirSync(path.dirname(audio), { recursive: true });
            fs.mkdirSync(path.join(media, 'empty-dir'));
            fs.writeFileSync(audio, Buffer.from([0x00, 0x01, 0xff, 0x6d, 0x70, 0x33]));
            fs.chmodSync(audio, 0o640);
            fs.writeFileSync(sidecar, 'audio/mpeg');
            fs.writeFileSync(spaced, 'space');
            fs.writeFileSync(unicode, 'unicode');
            fs.writeFileSync(sibling, 'sibling-not-in-backup');

            const result = runBackup({
                MEDIA_DIR: `${media}/`,
                MEDIA_BACKUP_DIR: backup,
                RETAIN: '14',
            });
            expect(result.status, result.stderr).toBe(0);
            const archive = archivePathFrom(result.stdout);
            expect(fs.existsSync(archive)).toBe(true);
            expect(fs.readdirSync(backup).some((name) => name.endsWith('.partial'))).toBe(false);

            const names = memberNames(archive);
            expect(names.every((name) => name === 'media' || name.startsWith('media/'))).toBe(true);
            expect(names.some((name) => name === 'media/empty-dir' || name === 'media/empty-dir/')).toBe(true);
            expect(names).toContain('media/music/my track.mp3');
            expect(names).toContain('media/music/обложка.png');
            expect(names).toContain('media/music/aaaaaaaaaaaaaaaaaaaaaaaa/audio.mp3.type');
            expect(names.some((name) => name.includes('not-media'))).toBe(false);

            const extractDir = path.join(root, 'restore');
            fs.mkdirSync(extractDir);
            const extracted = spawnSync('tar', ['-xzf', archive, '-C', extractDir]);
            expect(extracted.status).toBe(0);
            const restoredAudio = path.join(extractDir, 'media/music/aaaaaaaaaaaaaaaaaaaaaaaa/audio.mp3');
            expect(fs.readFileSync(restoredAudio).equals(fs.readFileSync(audio))).toBe(true);
            expect(fs.statSync(restoredAudio).mode & 0o777).toBe(0o640);
            expect(fs.readFileSync(path.join(extractDir, 'media/music/my track.mp3'), 'utf8')).toBe('space');
            expect(fs.existsSync(path.join(extractDir, 'not-media.txt'))).toBe(false);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('stores the target of a top-level symlink and keeps inner links as links', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuleneva-backup-link-'));
        try {
            const real = path.join(root, 'real');
            const secret = path.join(root, 'secret.txt');
            const link = path.join(root, 'link&media');
            const backup = path.join(root, 'backups');
            const audio = path.join(real, 'music', 'audio.mp3');
            const inner = path.join(real, 'music', 'link-out.txt');
            fs.mkdirSync(path.dirname(audio), { recursive: true });
            fs.writeFileSync(audio, 'real-bytes');
            fs.writeFileSync(secret, 'secret-bytes-marker');
            fs.symlinkSync(secret, inner);
            fs.symlinkSync(real, link);

            const result = runBackup({
                MEDIA_DIR: link,
                MEDIA_BACKUP_DIR: backup,
            });
            expect(result.status, result.stderr).toBe(0);
            const archive = archivePathFrom(result.stdout);
            const names = memberNames(archive);
            expect(names).toContain('link&media/music/audio.mp3');
            expect(names.some((name) => name === 'link&media' || name.startsWith('link&media/'))).toBe(true);
            expect(names.every((name) => name === 'link&media' || name.startsWith('link&media/'))).toBe(true);

            const verbose = spawnSync('tar', ['-tvzf', archive], { encoding: 'utf8' });
            expect(verbose.status).toBe(0);
            const linkLine = verbose.stdout.split('\n').find((line) => line.includes('link-out.txt'));
            expect(linkLine?.startsWith('l')).toBe(true);
            expect(linkLine).toContain(secret);

            const payload = spawnSync('tar', ['-xOf', archive, 'link&media/music/audio.mp3']);
            expect(payload.status).toBe(0);
            expect(payload.stdout.equals(Buffer.from('real-bytes'))).toBe(true);

            const extractDir = path.join(root, 'restore');
            fs.mkdirSync(extractDir);
            expect(spawnSync('tar', ['-xzf', archive, '-C', extractDir]).status).toBe(0);
            const restoredLink = path.join(extractDir, 'link&media/music/link-out.txt');
            expect(fs.lstatSync(restoredLink).isSymbolicLink()).toBe(true);
            expect(fs.readlinkSync(restoredLink)).toBe(secret);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('fails before creating a backup directory when the media directory is missing or unsafe', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuleneva-backup-miss-'));
        try {
            const missingBackup = path.join(root, 'should-not-exist');
            const missing = runBackup({
                MEDIA_DIR: path.join(root, 'no-such-media'),
                MEDIA_BACKUP_DIR: missingBackup,
            });
            expect(missing.status).toBe(1);
            expect(missing.stderr).toContain('Media directory not found');
            expect(fs.existsSync(missingBackup)).toBe(false);

            const rootBackup = path.join(root, 'root-backup');
            fs.mkdirSync(rootBackup);
            const refused = runBackup({
                MEDIA_DIR: '/',
                MEDIA_BACKUP_DIR: rootBackup,
            });
            expect(refused.status).toBe(1);
            expect(refused.stderr).toContain('Refusing unsafe MEDIA_DIR name');
            expect(fs.readdirSync(rootBackup)).toEqual([]);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('keeps the newest RETAIN archives and leaves unrelated files in the backup directory', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuleneva-backup-retain-'));
        try {
            const media = path.join(root, 'media');
            const backup = path.join(root, 'backups');
            fs.mkdirSync(path.join(media, 'music'), { recursive: true });
            fs.writeFileSync(path.join(media, 'music', 'a.bin'), 'a');
            fs.mkdirSync(backup);
            fs.writeFileSync(path.join(backup, 'notes.txt'), 'keep-me');
            for (const stamp of ['20200101T000001Z', '20200102T000001Z', '20200103T000001Z']) {
                const file = path.join(backup, `media-${stamp}.tar.gz`);
                fs.writeFileSync(file, `old-${stamp}`);
                const touched = spawnSync('touch', ['-d', `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)} 00:00:00 UTC`, file]);
                expect(touched.status).toBe(0);
            }

            const result = runBackup({
                MEDIA_DIR: media,
                MEDIA_BACKUP_DIR: backup,
                RETAIN: '2',
            });
            expect(result.status, result.stderr).toBe(0);
            const archive = archivePathFrom(result.stdout);
            expect(fs.existsSync(archive)).toBe(true);
            const names = fs.readdirSync(backup).filter((name) => name.startsWith('media-') && name.endsWith('.tar.gz')).sort();
            expect(names).toEqual([
                'media-20200103T000001Z.tar.gz',
                path.basename(archive),
            ].sort());
            expect(fs.readFileSync(path.join(backup, 'notes.txt'), 'utf8')).toBe('keep-me');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
