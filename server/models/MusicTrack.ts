/**
 * @file Метаданные записи. Байты лежат в объектном хранилище, не в документе.
 */
import mongoose, { type HydratedDocument, type Model, type Types } from 'mongoose';

/** Статус публикации. Черновик не виден гостям. */
export type MusicTrackStatus = 'draft' | 'published';

/** Поля записи в MongoDB. */
export interface MusicTrackDoc {
    title: string;
    credits: string;
    description: string;
    status: MusicTrackStatus;
    audioKey: string;
    coverKey?: string | null;
    coverContentType?: string | null;
    audioBytes: number;
    publishedAt?: Date | null;
    createdBy: Types.ObjectId;
    updatedBy: Types.ObjectId;
    createdAt?: Date;
    updatedAt?: Date;
}

/** Hydrated-документ записи. */
export type MusicTrackDocument = HydratedDocument<MusicTrackDoc>;

const musicTrackSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, maxlength: 120 },
        credits: { type: String, required: true, maxlength: 160 },
        description: { type: String, default: '', maxlength: 500 },
        status: {
            type: String,
            enum: ['draft', 'published'],
            default: 'draft',
            index: true,
        },
        audioKey: { type: String, required: true },
        coverKey: { type: String, default: null },
        coverContentType: { type: String, default: null },
        audioBytes: { type: Number, required: true },
        publishedAt: { type: Date, default: null },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true },
);

const MusicTrack =
    (mongoose.models.MusicTrack as Model<MusicTrackDoc> | undefined)
    ?? mongoose.model<MusicTrackDoc>('MusicTrack', musicTrackSchema);

export default MusicTrack;
