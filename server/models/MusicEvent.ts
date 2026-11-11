/**
 * @file Анонимные события публичной страницы /music.
 * IP, user-agent и прочие сетевые идентификаторы в документ не пишутся.
 */
import mongoose, { type HydratedDocument, type Model, type Types } from 'mongoose';
import { MUSIC_EVENT_TYPES, type MusicEventType } from '../../shared/musicListen';

/** Поля события в MongoDB. */
export interface MusicEventDoc {
    type: MusicEventType;
    trackId?: string | null;
    albumId?: string | null;
    playlistId?: string | null;
    /** Метка `from` / `utm_source`. Пусто — заход без метки. */
    source?: string | null;
    /** Случайный id из браузера, не пользователь и не адрес. */
    sessionId: string;
    /** Участник студии, если в запросе был живой JWT. Иначе null. */
    userId?: Types.ObjectId | null;
    createdAt?: Date;
    updatedAt?: Date;
}

/** Hydrated-документ события. */
export type MusicEventDocument = HydratedDocument<MusicEventDoc>;

const musicEventSchema = new mongoose.Schema(
    {
        type: { type: String, enum: MUSIC_EVENT_TYPES, required: true },
        trackId: { type: String, default: null },
        albumId: { type: String, default: null },
        playlistId: { type: String, default: null },
        source: { type: String, default: null, maxlength: 64 },
        sessionId: { type: String, required: true, maxlength: 36 },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true, collection: 'music_events' },
);

musicEventSchema.index({ createdAt: -1 });
musicEventSchema.index({
    sessionId: 1,
    type: 1,
    trackId: 1,
    albumId: 1,
    playlistId: 1,
    createdAt: -1,
});
musicEventSchema.index({ type: 1, trackId: 1, createdAt: -1 });
musicEventSchema.index({ type: 1, albumId: 1, createdAt: -1 });
musicEventSchema.index({ type: 1, playlistId: 1, createdAt: -1 });

const MusicEvent =
    (mongoose.models.MusicEvent as Model<MusicEventDoc> | undefined)
    ?? mongoose.model<MusicEventDoc>('MusicEvent', musicEventSchema);

export default MusicEvent;
