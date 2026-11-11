/**
 * @file Альбом или плейлист. Порядок записей — массив id, обложка лежит в хранилище.
 * Старые записи без подборки остаются как есть: поле на треке не требуется.
 */
import mongoose, { type HydratedDocument, type Model, type Types } from 'mongoose';

/** Альбом — дом записи. Плейлист — подборка, запись может быть в нескольких. */
export type MusicCollectionType = 'album' | 'playlist';

/** Черновик гостям не виден. */
export type MusicCollectionStatus = 'draft' | 'published';

/** Поля подборки в MongoDB. */
export interface MusicCollectionDoc {
    type: MusicCollectionType;
    title: string;
    description: string;
    status: MusicCollectionStatus;
    coverKey?: string | null;
    coverContentType?: string | null;
    /** Сколько раз записана обложка. Нет поля у старых документов — ноль. */
    coverVersion?: number;
    trackIds: Types.ObjectId[];
    publishedAt?: Date | null;
    createdBy: Types.ObjectId;
    updatedBy: Types.ObjectId;
    createdAt?: Date;
    updatedAt?: Date;
}

/** Hydrated-документ подборки. */
export type MusicCollectionDocument = HydratedDocument<MusicCollectionDoc>;

const musicCollectionSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ['album', 'playlist'],
            required: true,
            index: true,
        },
        title: { type: String, required: true, maxlength: 120 },
        description: { type: String, default: '', maxlength: 500 },
        status: {
            type: String,
            enum: ['draft', 'published'],
            default: 'draft',
            index: true,
        },
        coverKey: { type: String, default: null },
        coverContentType: { type: String, default: null },
        coverVersion: { type: Number, default: 0, min: 0 },
        trackIds: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MusicTrack' }],
            default: [],
        },
        publishedAt: { type: Date, default: null },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true },
);

const MusicCollection =
    (mongoose.models.MusicCollection as Model<MusicCollectionDoc> | undefined)
    ?? mongoose.model<MusicCollectionDoc>('MusicCollection', musicCollectionSchema);

export default MusicCollection;
