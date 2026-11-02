import mongoose, { type HydratedDocument, type Model } from 'mongoose';

/**
 * Один занятый слот в документе дня.
 */
export interface BookedHour {
    hour: string;
    userId: string;
    username: string;
    band_name?: string;
    userPhotoUrl?: string | null;
    rehearsalType: string;
}

/**
 * Документ репетиций на календарный день.
 */
export interface RehearsalDoc {
    date: Date;
    hours: BookedHour[];
    createdAt?: Date;
    updatedAt?: Date;
}

/** Hydrated-документ Rehearsal. */
export type RehearsalDocument = HydratedDocument<RehearsalDoc>;

const bookedHourSchema = new mongoose.Schema(
    {
        hour: { type: String, required: true },
        userId: { type: String, required: true },
        username: { type: String, required: true },
        /** Название коллектива необязательно: в форме оно спрятано в «Дополнительно». */
        band_name: { type: String, default: '' },
        userPhotoUrl: { type: String },
        rehearsalType: { type: String, required: true },
    },
    { _id: false },
);

const rehearsalSchema = new mongoose.Schema(
    {
        date: {
            type: Date,
            required: true,
            unique: true,
        },
        hours: {
            type: [bookedHourSchema],
            default: [],
        },
    },
    {
        timestamps: true,
    },
);

const Rehearsal =
    (mongoose.models.Rehearsal as Model<RehearsalDoc> | undefined)
    ?? mongoose.model<RehearsalDoc>('Rehearsal', rehearsalSchema);

export default Rehearsal;
