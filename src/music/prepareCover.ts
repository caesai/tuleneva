/**
 * @file Готовит обложку с телефона к лимиту сервера.
 * Длинная сторона не больше 1500px, файл — JPEG до 2 МБ.
 * HEIC открывается, если это умеет браузер (Safari на iPhone).
 */

/** Длинная сторона кадра, px. Сначала полный размер, потом меньше, если JPEG всё ещё тяжёлый. */
const EDGE_STEPS = [1500, 1100, 800] as const;

/** Качество JPEG на каждом размере. */
const QUALITIES = [0.86, 0.72, 0.58, 0.44] as const;

/** Тот же потолок, что `COVER_MAX_BYTES` на сервере. */
const MAX_BYTES = 2 * 1024 * 1024;

/** Фото не декодировалось (часто HEIC вне Safari). */
export const COVER_UNREADABLE_MESSAGE =
    'Это фото не открылось. Выберите снимок из галереи ещё раз — страница сожмёт его сама.';

/** Холст не смог отдать JPEG нужного размера. */
export const COVER_PREPARE_FAILED_MESSAGE =
    'Не удалось подготовить обложку. Попробуйте другое фото.';

interface DecodedImage {
    width: number;
    height: number;
    source: CanvasImageSource;
    close: () => void;
}

/**
 * Пробует `createImageBitmap`, затем `<img>`.
 * На iPhone первая попытка с ориентацией из EXIF, вторая — без опций:
 * старый Safari бросает ошибку на словарь параметров, хотя сам файл открывает.
 * @param file Файл из галереи
 * @returns Кадр или null
 */
const decodeImage = async (file: File): Promise<DecodedImage | null> => {
    if (typeof createImageBitmap === 'function') {
        const attempts = [
            () => createImageBitmap(file, { imageOrientation: 'from-image' }),
            () => createImageBitmap(file),
        ];
        for (const attempt of attempts) {
            try {
                const bitmap = await attempt();
                return {
                    width: bitmap.width,
                    height: bitmap.height,
                    source: bitmap,
                    close: () => bitmap.close(),
                };
            } catch {
                // Следующий способ.
            }
        }
    }

    const url = URL.createObjectURL(file);
    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('decode'));
            img.src = url;
        });
        if (image.naturalWidth < 1 || image.naturalHeight < 1) {
            URL.revokeObjectURL(url);
            return null;
        }
        return {
            width: image.naturalWidth,
            height: image.naturalHeight,
            source: image,
            close: () => URL.revokeObjectURL(url),
        };
    } catch {
        URL.revokeObjectURL(url);
        return null;
    }
};

/**
 * Вписывает кадр в квадрат `edge`, не увеличивая мелкое фото.
 * @param width Ширина исходника
 * @param height Высота исходника
 * @param edge Максимальная сторона
 * @returns Размер холста
 */
const fitEdge = (width: number, height: number, edge: number): { width: number; height: number } => {
    const longest = Math.max(width, height);
    if (longest <= edge) {
        return { width, height };
    }
    const scale = edge / longest;
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
};

/**
 * Кодирует холст в JPEG.
 * @param canvas Холст
 * @param quality 0..1
 * @returns Blob или null, если браузер не смог
 */
const jpegBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> =>
    new Promise((resolve) => {
        if (typeof canvas.toBlob !== 'function') {
            resolve(null);
            return;
        }
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
    });

/**
 * Уменьшает фото и отдаёт JPEG, который проходит серверную проверку.
 * Тип и имя исходного файла не важны: iPhone часто отдаёт пустой MIME и `.HEIC`.
 * @param file Файл из `<input type="file">`
 * @returns JPEG до 2 МБ
 */
export const prepareCoverFile = async (file: File): Promise<File> => {
    const decoded = await decodeImage(file);
    if (!decoded || decoded.width < 1 || decoded.height < 1) {
        throw new Error(COVER_UNREADABLE_MESSAGE);
    }
    try {
        for (const edge of EDGE_STEPS) {
            const size = fitEdge(decoded.width, decoded.height, edge);
            const canvas = document.createElement('canvas');
            canvas.width = size.width;
            canvas.height = size.height;
            const context = canvas.getContext('2d');
            if (!context) {
                throw new Error(COVER_PREPARE_FAILED_MESSAGE);
            }
            context.drawImage(decoded.source, 0, 0, size.width, size.height);
            for (const quality of QUALITIES) {
                const blob = await jpegBlob(canvas, quality);
                if (blob && blob.size > 0 && blob.size <= MAX_BYTES) {
                    const base = file.name.replace(/\.[^.]+$/, '') || 'cover';
                    return new File([blob], `${base}.jpg`, {
                        type: 'image/jpeg',
                        lastModified: Date.now(),
                    });
                }
            }
        }
        throw new Error(COVER_PREPARE_FAILED_MESSAGE);
    } finally {
        decoded.close();
    }
};
