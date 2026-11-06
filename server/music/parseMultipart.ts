/**
 * @file Разбор multipart без сохранения файла на диск до проверки.
 */
import type { Request } from 'express';
import Busboy from 'busboy';

/** Один файл из формы. */
export interface UploadedPart {
    buffer: Buffer;
    filename: string;
    mime: string;
}

/** Поля и файлы формы. */
export interface ParsedMultipart {
    fields: Record<string, string>;
    files: Record<string, UploadedPart>;
}

/**
 * Читает multipart из запроса.
 * @param req Запрос Express
 * @param maxFileBytes Потолок одного файла
 * @returns Поля и файлы
 */
export const parseMultipart = (
    req: Request,
    maxFileBytes: number,
): Promise<ParsedMultipart> => new Promise((resolve, reject) => {
    let parser: ReturnType<typeof Busboy>;
    try {
        parser = Busboy({
            headers: req.headers,
            limits: {
                files: 2,
                fileSize: maxFileBytes,
                fields: 8,
                fieldSize: 8_000,
            },
        });
    } catch (err) {
        reject(err);
        return;
    }

    const fields: Record<string, string> = {};
    const files: Record<string, UploadedPart> = {};
    const pending: Promise<void>[] = [];
    let failed = false;
    let settled = false;

    /**
     * Завершает промис одной ошибкой.
     * @param err Ошибка разбора
     */
    const fail = (err: Error) => {
        if (settled) {
            return;
        }
        failed = true;
        settled = true;
        reject(err);
    };

    parser.on('field', (name: string, value: string) => {
        fields[name] = value;
    });

    parser.on('file', (name: string, stream: NodeJS.ReadableStream, info: { filename: string; mimeType: string }) => {
        const chunks: Buffer[] = [];
        let tooBig = false;
        const done = new Promise<void>((fileResolve, fileReject) => {
            stream.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
            });
            stream.on('limit', () => {
                tooBig = true;
                stream.resume();
            });
            stream.on('error', (err: Error) => fileReject(err));
            stream.on('end', () => {
                if (tooBig) {
                    fileReject(new Error('FILE_TOO_LARGE'));
                    return;
                }
                files[name] = {
                    buffer: Buffer.concat(chunks),
                    filename: info.filename,
                    mime: info.mimeType,
                };
                fileResolve();
            });
        });
        pending.push(done);
    });

    parser.on('error', (err: unknown) => {
        fail(err instanceof Error ? err : new Error('Upload parse failed'));
    });

    parser.on('close', () => {
        void Promise.all(pending).then(() => {
            if (failed || settled) {
                return;
            }
            settled = true;
            resolve({ fields, files });
        }).catch((err: unknown) => {
            fail(err instanceof Error ? err : new Error('Upload parse failed'));
        });
    });

    req.pipe(parser);
});
