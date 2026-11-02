import mongoose, { type HydratedDocument, type Model, type Types } from 'mongoose';
import type { StudioRole } from './User';

/**
 * Журнал смен ролей пользователей.
 */
export interface RoleChangeLogDoc {
    actorId: Types.ObjectId;
    targetId: Types.ObjectId;
    fromRole: StudioRole;
    toRole: StudioRole;
    createdAt?: Date;
}

/** Hydrated-документ RoleChangeLog. */
export type RoleChangeLogDocument = HydratedDocument<RoleChangeLogDoc>;

const roleChangeLogSchema = new mongoose.Schema(
    {
        actorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        targetId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        fromRole: {
            type: String,
            enum: ['super_admin', 'admin', 'user', 'guest'],
            required: true,
        },
        toRole: {
            type: String,
            enum: ['super_admin', 'admin', 'user', 'guest'],
            required: true,
        },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);

const RoleChangeLog =
    (mongoose.models.RoleChangeLog as Model<RoleChangeLogDoc> | undefined)
    ?? mongoose.model<RoleChangeLogDoc>('RoleChangeLog', roleChangeLogSchema);

export default RoleChangeLog;
