const mongoose = require('mongoose');

/**
 * Журнал смен ролей пользователей.
 */
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

const RoleChangeLog = mongoose.models.RoleChangeLog
    || mongoose.model('RoleChangeLog', roleChangeLogSchema);

module.exports = RoleChangeLog;
