/**
 * @file Последнее непустое название коллектива по броням пользователя.
 */
import Rehearsal from '../models/Rehearsal';

/**
 * Для карточки админки: коллектив из самой свежей брони, где он указан.
 * @returns Map userId → название
 */
export const latestBandNamesByUser = async (): Promise<Map<string, string>> => {
    const docs = await Rehearsal.find()
        .select('date hours')
        .sort({ date: -1 })
        .lean();
    const bands = new Map<string, string>();
    for (const doc of docs) {
        const hours = Array.isArray(doc.hours) ? doc.hours : [];
        for (const slot of hours) {
            const userId = slot?.userId ? String(slot.userId) : '';
            const band = typeof slot?.band_name === 'string' ? slot.band_name.trim() : '';
            if (userId && band && !bands.has(userId)) {
                bands.set(userId, band);
            }
        }
    }
    return bands;
};
